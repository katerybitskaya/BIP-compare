"""
Site crawler — BFS crawl of a BIP website.

Discovers all internal HTML pages, records their HTTP status,
and optionally collects raw content (HTML, text, links, attachments)
needed for deeper comparison.
"""
from __future__ import annotations

import hashlib
from collections import deque
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup

from .models import PageStatus, RawPageEntry, RawSiteSnapshot, SiteReport

# File extensions treated as attachments (not crawled as pages)
_ATTACHMENT_EXTENSIONS = frozenset({
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".odt", ".ods", ".odp",
    ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2",
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg", ".webp",
    ".mp3", ".mp4", ".avi", ".mov", ".wmv",
    ".txt", ".csv", ".xml", ".json",
    ".rtf", ".eml", ".msg",
})

_SESSION_HEADERS = {
    "User-Agent": "BIP-Compare/1.0 (automated site comparison tool)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pl,en;q=0.5",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_attachment(url: str) -> bool:
    path = urlparse(url).path.lower()
    return any(path.endswith(ext) for ext in _ATTACHMENT_EXTENSIONS)


def _normalize_url(url: str) -> str:
    """Strip fragment; normalise trailing slash to bare path."""
    p = urlparse(url)
    path = p.path.rstrip("/") or "/"
    return urlunparse((p.scheme, p.netloc, path, p.params, p.query, ""))


def _page_path(url: str) -> str:
    """Return path (+ query string if present) as the canonical page key."""
    p = urlparse(url)
    path = p.path.rstrip("/") or "/"
    return f"{path}?{p.query}" if p.query else path


def _link_key(href: str, text: str) -> str:
    return hashlib.md5(f"{href}|{text}".encode()).hexdigest()[:12]


def _attachment_key(href: str) -> str:
    return hashlib.md5(href.encode()).hexdigest()[:12]


# ---------------------------------------------------------------------------
# Main crawl function
# ---------------------------------------------------------------------------

def crawl_site(
    base_url: str,
    *,
    max_pages: int = 10000,
    timeout: int = 15,
    collect_raw: bool = False,
) -> Tuple[SiteReport, Optional[Dict[str, RawPageEntry]]]:
    """
    BFS-crawl *base_url* and every internal HTML link found on the pages.

    Parameters
    ----------
    base_url    : Starting URL.
    max_pages   : Hard limit on the number of pages to visit.
    timeout     : Per-request timeout in seconds.
    collect_raw : Whether to collect full HTML/text/links/attachments.

    Returns
    -------
    (SiteReport, raw_pages | None)
        raw_pages is a dict keyed by page path and is only returned when
        collect_raw=True.
    """
    session = requests.Session()
    session.headers.update(_SESSION_HEADERS)

    base_netloc = urlparse(base_url).netloc

    # ------------------------------------------------------------------
    # 1. Check root reachability
    # ------------------------------------------------------------------
    root_status_code: Optional[int] = None
    root_error: Optional[str] = None
    reachable = False

    try:
        resp = session.get(base_url, timeout=timeout, allow_redirects=True)
        root_status_code = resp.status_code
        reachable = resp.ok
        if not resp.ok:
            root_error = f"HTTP {resp.status_code}"
    except requests.exceptions.ConnectionError as exc:
        root_error = f"Błąd połączenia: {str(exc)[:120]}"
    except requests.exceptions.Timeout:
        root_error = "Timeout"
    except Exception as exc:  # noqa: BLE001
        root_error = str(exc)[:120]

    if not reachable:
        return (
            SiteReport(
                base_url=base_url,
                reachable=False,
                root_status_code=root_status_code,
                root_error=root_error,
                pages=[],
                page_count=0,
            ),
            None,
        )

    # ------------------------------------------------------------------
    # 2. BFS crawl
    # ------------------------------------------------------------------
    visited: set[str] = set()
    queue: deque[str] = deque([_normalize_url(base_url)])
    pages: List[PageStatus] = []
    raw_pages: Dict[str, RawPageEntry] = {} if collect_raw else None  # type: ignore[assignment]

    while queue and len(pages) < max_pages:
        url = queue.popleft()
        if url in visited:
            continue
        visited.add(url)

        path = _page_path(url)
        status_code: Optional[int] = None
        ok = False
        error: Optional[str] = None
        html_content: Optional[str] = None

        try:
            resp = session.get(url, timeout=timeout, allow_redirects=True)
            status_code = resp.status_code
            ok = resp.ok
            if not resp.ok:
                error = f"HTTP {resp.status_code}"
            else:
                ct = resp.headers.get("content-type", "")
                if "html" in ct:
                    html_content = resp.text
        except requests.exceptions.ConnectionError as exc:
            error = f"Błąd połączenia: {str(exc)[:80]}"
        except requests.exceptions.Timeout:
            error = "Timeout"
        except Exception as exc:  # noqa: BLE001
            error = str(exc)[:80]

        pages.append(
            PageStatus(path=path, url=url, status_code=status_code, ok=ok, error=error)
        )

        # ---- Parse HTML --------------------------------------------------
        soup: Optional[BeautifulSoup] = None
        if html_content:
            soup = BeautifulSoup(html_content, "html.parser")

        # ---- Collect raw data (if requested) -----------------------------
        if collect_raw:
            text: Optional[str] = None
            structure: Optional[Dict[str, int]] = None
            links_list: Optional[List[Dict[str, str]]] = None
            attachments_list: Optional[List[Dict[str, str]]] = None

            if soup is not None:
                text = soup.get_text(separator="\n", strip=True)

                structure = {}
                for tag in soup.find_all(True):
                    structure[tag.name] = structure.get(tag.name, 0) + 1

                links_list = []
                attachments_list = []
                seen_link_keys: set[str] = set()
                seen_att_keys: set[str] = set()

                for a in soup.find_all("a", href=True):
                    raw_href: str = a["href"].strip()
                    if not raw_href or raw_href.startswith(("#", "javascript:", "mailto:", "tel:")):
                        continue
                    abs_href = urljoin(url, raw_href)
                    link_text = a.get_text(strip=True)

                    if _is_attachment(abs_href):
                        filename = urlparse(abs_href).path.split("/")[-1]
                        key = _attachment_key(abs_href)
                        if key not in seen_att_keys:
                            seen_att_keys.add(key)
                            attachments_list.append(
                                {"href": abs_href, "filename": filename, "key": key}
                            )
                    else:
                        key = _link_key(abs_href, link_text)
                        if key not in seen_link_keys:
                            seen_link_keys.add(key)
                            links_list.append(
                                {"href": abs_href, "text": link_text, "key": key}
                            )

            raw_pages[path] = RawPageEntry(
                url=url,
                status_code=status_code,
                ok=ok,
                error=error,
                html=html_content,
                text=text,
                structure=structure,
                links=links_list,
                attachments=attachments_list,
            )

        # ---- Discover new internal links for the queue -------------------
        if soup is not None:
            for a in soup.find_all("a", href=True):
                raw_href = a["href"].strip()
                if not raw_href or raw_href.startswith(("#", "javascript:", "mailto:", "tel:")):
                    continue
                abs_href = urljoin(url, raw_href)
                p = urlparse(abs_href)
                if p.netloc == base_netloc and not _is_attachment(abs_href):
                    norm = _normalize_url(abs_href)
                    if norm not in visited:
                        queue.append(norm)

    return (
        SiteReport(
            base_url=base_url,
            reachable=True,
            root_status_code=root_status_code,
            root_error=None,
            pages=pages,
            page_count=len(pages),
        ),
        raw_pages,
    )


def build_raw_snapshot(
    site: SiteReport,
    raw_pages: Optional[Dict[str, RawPageEntry]],
) -> RawSiteSnapshot:
    return RawSiteSnapshot(
        base_url=site.base_url,
        reachable=site.reachable,
        root_status_code=site.root_status_code,
        root_error=site.root_error,
        pages=raw_pages or {},
    )
