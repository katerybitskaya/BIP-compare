"""Asynchronous same-host site crawler used to discover every subpage of a
BIP (Biuletyn Informacji Publicznej) website starting from its base URL."""
from __future__ import annotations

import asyncio
from typing import Optional, Set
from urllib.parse import urljoin, urlparse, urlunparse

import httpx
from bs4 import BeautifulSoup

from .models import PageStatus, SiteReport

# File extensions that represent downloadable assets rather than HTML pages.
# The frontend already treats these as "pliki" (files), not "podstrony" (pages),
# so the page-crawler skips them.
ASSET_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".zip", ".rar",
    ".7z", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico", ".css",
    ".js", ".mp3", ".mp4", ".avi", ".mov", ".woff", ".woff2", ".ttf", ".xml",
    ".rss", ".txt", ".csv",
}

SKIPPED_SCHEMES = {"mailto", "tel", "javascript", "data"}

# If the caller doesn't set max_pages, the crawl is effectively "unlimited" —
# but we still keep an internal ceiling so a pathological site (e.g. an
# infinite calendar/pagination generating endless unique URLs) can't make a
# single request run forever.
SAFETY_MAX_PAGES = 5000


def _normalize_base(url: str) -> str:
    parsed = urlparse(str(url))
    return urlunparse((parsed.scheme, parsed.netloc, "", "", "", ""))


def _normalize_path(url: str) -> str:
    """Return a comparable path (no scheme/host, no fragment, no query)."""
    parsed = urlparse(url)
    path = parsed.path or "/"
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/")
    return path or "/"


def _is_asset(path: str) -> bool:
    lower = path.lower()
    return any(lower.endswith(ext) for ext in ASSET_EXTENSIONS)


def _extract_links(html: str, page_url: str, host: str) -> Set[str]:
    soup = BeautifulSoup(html, "lxml")
    found: Set[str] = set()
    for tag in soup.find_all("a", href=True):
        href = tag["href"].strip()
        if not href or href.startswith("#"):
            continue
        parsed = urlparse(href)
        if parsed.scheme in SKIPPED_SCHEMES:
            continue
        absolute = urljoin(page_url, href)
        absolute_parsed = urlparse(absolute)
        if absolute_parsed.scheme not in ("http", "https"):
            continue
        if absolute_parsed.netloc != host:
            continue  # stay within the same site
        path = _normalize_path(absolute)
        if _is_asset(path):
            continue
        found.add(path)
    return found


async def crawl_site(
    client: httpx.AsyncClient,
    base_url: str,
    max_pages: Optional[int],
    timeout_seconds: float,
) -> SiteReport:
    """Breadth-first crawl of every reachable HTML subpage on ``base_url``.

    Pages are fetched in same-depth batches (concurrently, bounded by the
    ``httpx.AsyncClient``'s connection limits) rather than one at a time, so
    sites with many subpages don't take forever to crawl. If ``max_pages`` is
    None, the crawl continues until every discovered same-host page has been
    visited (capped internally at ``SAFETY_MAX_PAGES`` as a last resort).
    """
    base = _normalize_base(base_url)
    host = urlparse(base).netloc
    effective_max = max_pages if max_pages is not None else SAFETY_MAX_PAGES

    report = SiteReport(base_url=base, reachable=False)

    # 1) Reachability probe on the root URL.
    try:
        root_resp = await client.get(base, timeout=timeout_seconds, follow_redirects=True)
        report.reachable = True
        report.root_status_code = root_resp.status_code
    except httpx.HTTPError as exc:
        report.reachable = False
        report.root_error = str(exc)
        report.page_count = 0
        return report

    # 2) Breadth-first traversal, restricted to the same host, one "layer"
    #    (frontier) of pages fetched concurrently at a time.
    visited: Set[str] = set()
    frontier: Set[str] = {"/"}
    pages: list[PageStatus] = []

    async def fetch_one(path: str) -> tuple[PageStatus, Set[str]]:
        full_url = urljoin(base, path)
        try:
            resp = await client.get(full_url, timeout=timeout_seconds, follow_redirects=True)
            status = resp.status_code
            ok = status < 400
            page = PageStatus(path=path, url=str(resp.url), status_code=status, ok=ok)
            links: Set[str] = set()
            content_type = resp.headers.get("content-type", "")
            if ok and "text/html" in content_type:
                links = _extract_links(resp.text, str(resp.url), host)
            return page, links
        except httpx.HTTPError as exc:
            return PageStatus(path=path, url=full_url, status_code=None, ok=False, error=str(exc)), set()

    while frontier and len(pages) < effective_max:
        batch = [p for p in frontier if p not in visited]
        if not batch:
            break
        remaining_budget = effective_max - len(pages)
        batch = batch[:remaining_budget]
        for path in batch:
            visited.add(path)

        results = await asyncio.gather(*(fetch_one(path) for path in batch))

        next_frontier: Set[str] = set()
        for page, links in results:
            pages.append(page)
            for link in links:
                if link not in visited:
                    next_frontier.add(link)
        frontier = next_frontier

    report.pages = pages
    report.page_count = len(pages)
    return report


async def probe_path(
    client: httpx.AsyncClient,
    base_url: str,
    path: str,
    timeout_seconds: float,
) -> PageStatus:
    """Directly check whether ``path`` responds successfully on ``base_url``,
    independent of whether that site's own crawl discovered a link to it."""
    base = _normalize_base(base_url)
    full_url = urljoin(base, path)
    try:
        resp = await client.get(full_url, timeout=timeout_seconds, follow_redirects=True)
        status = resp.status_code
        return PageStatus(path=path, url=str(resp.url), status_code=status, ok=status < 400)
    except httpx.HTTPError as exc:
        return PageStatus(path=path, url=full_url, status_code=None, ok=False, error=str(exc))
