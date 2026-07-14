"""
Async crawler — BFS crawl of a BIP website using aiohttp for speed.

Uses asyncio.Semaphore to run up to N requests concurrently, dramatically
reducing total crawl time compared to sequential requests.
Each discovered subpage is saved into a JSON file (one per site).
"""
from __future__ import annotations

import asyncio
import json
from collections import deque
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse, urlunparse

import aiohttp
from bs4 import BeautifulSoup

from .models import PageStatus, SiteReport

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Max concurrent HTTP requests (keeps things fast but polite)
MAX_CONCURRENT = 20

# File extensions treated as attachments — skip these during crawl
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
    "User-Agent": "BIP-Compare/2.0 (automated site comparison tool)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pl,en;q=0.5",
}

# Where to store JSON crawl results
RESULTS_DIR = Path(__file__).parent.parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_attachment(url: str) -> bool:
    path = urlparse(url).path.lower()
    return any(path.endswith(ext) for ext in _ATTACHMENT_EXTENSIONS)


def _is_history_page(url: str) -> bool:
    """Return True for 'pełna historia zmian' pages (pattern: /ID/historia/ID)."""
    return "/historia/" in urlparse(url).path


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


# ---------------------------------------------------------------------------
# Core: fetch a single page
# ---------------------------------------------------------------------------

async def _fetch_page(
    session: aiohttp.ClientSession,
    url: str,
    sem: asyncio.Semaphore,
    timeout: int,
) -> Tuple[str, Optional[int], bool, Optional[str], Optional[str]]:
    """
    Fetch a single URL.
    Returns (url, status_code, ok, error, html_or_none).
    """
    async with sem:
        try:
            async with session.get(
                url,
                timeout=aiohttp.ClientTimeout(total=timeout),
                allow_redirects=True,
                ssl=False,
            ) as resp:
                status_code = resp.status
                ok = 200 <= status_code < 400
                html_content = None
                if ok and "html" in resp.headers.get("content-type", ""):
                    html_content = await resp.text(errors="replace")
                return url, status_code, ok, None, html_content
        except asyncio.TimeoutError:
            return url, None, False, "Timeout", None
        except aiohttp.ClientError as exc:
            return url, None, False, str(exc)[:120], None
        except Exception as exc:  # noqa: BLE001
            return url, None, False, str(exc)[:120], None


# ---------------------------------------------------------------------------
# Main crawl
# ---------------------------------------------------------------------------

async def crawl_site(
    base_url: str,
    *,
    max_pages: int = 0,
    timeout: int = 30,
) -> SiteReport:
    """
    Async BFS crawl of *base_url*.
    Discovers all internal HTML links, records each page, and writes the
    full list to a JSON file in RESULTS_DIR.

    Returns a SiteReport with page_count set.
    """
    base_netloc = urlparse(base_url).netloc
    sem = asyncio.Semaphore(MAX_CONCURRENT)

    connector = aiohttp.TCPConnector(limit=MAX_CONCURRENT, ssl=False)
    async with aiohttp.ClientSession(
        headers=_SESSION_HEADERS,
        connector=connector,
    ) as session:

        # --- 1. Check root reachability ---
        root_url, root_status, root_ok, root_error, root_html = await _fetch_page(
            session, base_url, sem, timeout
        )

        if not root_ok:
            return SiteReport(
                base_url=base_url,
                reachable=False,
                root_status_code=root_status,
                root_error=root_error,
                pages=[],
                page_count=0,
            )

        # --- 2. BFS crawl (batch-parallel) ---
        visited: set[str] = set()
        start_norm = _normalize_url(base_url)
        visited.add(start_norm)

        pages: List[PageStatus] = []

        # Seed with root page
        pages.append(PageStatus(
            path=_page_path(root_url),
            url=root_url,
            status_code=root_status,
            ok=root_ok,
            error=root_error,
        ))

        # Extract links from root
        frontier: deque[str] = deque()
        if root_html:
            _extract_links(root_html, root_url, base_netloc, visited, frontier)

        while frontier and (max_pages == 0 or len(pages) < max_pages):
            # Take a batch from the frontier
            batch_size = MAX_CONCURRENT
            if max_pages > 0:
                batch_size = min(batch_size, max_pages - len(pages))
            batch: List[str] = []
            while frontier and len(batch) < batch_size:
                batch.append(frontier.popleft())

            # Fetch all pages in batch concurrently
            tasks = [
                _fetch_page(session, url, sem, timeout)
                for url in batch
            ]
            results = await asyncio.gather(*tasks)

            for url, status_code, ok, error, html_content in results:
                if max_pages > 0 and len(pages) >= max_pages:
                    break

                path = _page_path(url)
                pages.append(PageStatus(
                    path=path,
                    url=url,
                    status_code=status_code,
                    ok=ok,
                    error=error,
                ))

                # Discover new links from this page
                if html_content:
                    _extract_links(html_content, url, base_netloc, visited, frontier)

    return SiteReport(
        base_url=base_url,
        reachable=True,
        root_status_code=root_status,
        root_error=None,
        pages=pages,
        page_count=len(pages),
    )


def _extract_links(
    html: str,
    current_url: str,
    base_netloc: str,
    visited: set[str],
    frontier: deque[str],
) -> None:
    """Parse HTML and add unseen internal links to the frontier."""
    soup = BeautifulSoup(html, "lxml")
    for a in soup.find_all("a", href=True):
        raw_href: str = a["href"].strip()
        if not raw_href or raw_href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue
        abs_href = urljoin(current_url, raw_href)
        p = urlparse(abs_href)
        if p.netloc == base_netloc and not _is_attachment(abs_href) and not _is_history_page(abs_href):
            norm = _normalize_url(abs_href)
            if norm not in visited:
                visited.add(norm)
                frontier.append(norm)


# ---------------------------------------------------------------------------
# JSON persistence
# ---------------------------------------------------------------------------

def save_pages_to_json(report: SiteReport, label: str, report_id: str) -> Path:
    """
    Save all crawled pages of a SiteReport to a JSON file.
    Duplicates (same path) are removed — only the first occurrence is kept.
    Returns the path to the created file.
    """
    out_path = RESULTS_DIR / f"{report_id}_{label}.json"

    seen_paths: set[str] = set()
    unique_pages = []
    for p in report.pages:
        if p.path not in seen_paths:
            seen_paths.add(p.path)
            unique_pages.append(p.model_dump())

    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(unique_pages, fh, ensure_ascii=False, indent=2)
    return out_path


def count_pages_from_json(json_path: Path) -> int:
    """Read a JSON pages file and return the number of subpages it contains."""
    with open(json_path, encoding="utf-8") as fh:
        data = json.load(fh)
    return len(data)
