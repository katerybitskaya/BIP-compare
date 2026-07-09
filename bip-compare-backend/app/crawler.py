"""Asynchronous same-host site crawler used to discover every subpage of a
BIP (Biuletyn Informacji Publicznej) website starting from its base URL.

In addition to the page list (used for missing/extra detection), each
successfully fetched HTML page also has its visible text, full link list,
and attachment (file) list extracted — kept in-memory as ``PageContent`` and
handed back to the caller so it can build the detailed per-page diff
(content / links / attachments) without re-fetching anything.
"""
from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set
from urllib.parse import urljoin, urlparse, urlunparse

import httpx
from bs4 import BeautifulSoup

from .models import PageStatus, SiteReport

# File extensions that represent downloadable assets rather than HTML pages.
# The frontend already treats these as "pliki" (files), not "podstrony" (pages),
# so the page-crawler skips them when building the BFS frontier, and the
# content-extraction step files them under "attachments" instead of "links".
ASSET_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".zip", ".rar",
    ".7z", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico", ".css",
    ".js", ".mp3", ".mp4", ".avi", ".mov", ".woff", ".woff2", ".ttf", ".xml",
    ".rss", ".txt", ".csv",
}

# Extensions that count as "attachments" for the Załączone pliki comparison —
# a subset of ASSET_EXTENSIONS that excludes pure web assets (css/js/fonts/
# icons) nobody would call a "document attached to the page".
ATTACHMENT_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".zip", ".rar",
    ".7z", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".csv",
}

SKIPPED_SCHEMES = {"mailto", "tel", "javascript", "data"}

# Tags whose counts form a lightweight "structure signature" of a page, used
# to flag layout/formatting differences without doing a full DOM diff.
STRUCTURE_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "table", "img", "ul", "ol", "a"]

# If the caller doesn't set max_pages, the crawl is effectively "unlimited" —
# but we still keep an internal ceiling so a pathological site (e.g. an
# infinite calendar/pagination generating endless unique URLs) can't make a
# single request run forever.
SAFETY_MAX_PAGES = 5000

# How many times a single request is retried after a network-level failure
# (timeout, connection reset, ...) before the page/link/file is actually
# classified as broken. A busy real site under the load of a full crawl can
# drop or stall the occasional request; without a retry, one bad moment
# permanently misclassifies an otherwise-fine page as "missing" or "broken".
REQUEST_RETRIES = 2
RETRY_BACKOFF_SECONDS = 0.4


def _timeout(timeout_seconds: float) -> httpx.Timeout:
    """Builds a per-request timeout where waiting for a free connection in
    the shared pool does NOT count against the user's configured budget.

    httpx.Timeout(x) (a plain float) applies x to connect/read/write *and*
    pool-checkout time. When the crawl and the link/file probing step are
    both hammering one shared AsyncClient (bounded to ~20 connections) with
    hundreds or thousands of requests, many requests spend most of their
    time simply queued for a connection -- with pool time counted against
    the same budget, those get killed as "timeouts" before ever reaching
    the network, which then look like broken/missing pages that are
    actually completely fine. Setting pool=None makes the queue wait
    unbounded, so only genuine connect/read/write slowness counts.
    """
    return httpx.Timeout(timeout_seconds, pool=None)


async def _get_with_retry(client: httpx.AsyncClient, url: str, timeout_seconds: float) -> httpx.Response:
    last_exc: Optional[httpx.HTTPError] = None
    for attempt in range(REQUEST_RETRIES + 1):
        try:
            return await client.get(url, timeout=_timeout(timeout_seconds), follow_redirects=True)
        except httpx.HTTPError as exc:
            last_exc = exc
            if attempt < REQUEST_RETRIES:
                await asyncio.sleep(RETRY_BACKOFF_SECONDS * (attempt + 1))
    assert last_exc is not None
    raise last_exc


@dataclass
class PageContent:
    """Everything extracted from one successfully fetched HTML page, saved
    to results/{id}/pages/{old,new}.json for later content comparison."""

    html: str = ""
    text: str = ""
    structure: Dict[str, int] = field(default_factory=dict)
    links: List[Dict[str, str]] = field(default_factory=list)         # non-asset <a href>
    attachments: List[Dict[str, str]] = field(default_factory=list)   # asset <a href>


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


def _is_attachment(path: str) -> bool:
    lower = path.lower()
    return any(lower.endswith(ext) for ext in ATTACHMENT_EXTENSIONS)


def _filename_from_href(href: str) -> str:
    name = os.path.basename(urlparse(href).path)
    return name or href


def _extract_links(html: str, page_url: str, host: str) -> Set[str]:
    """Same-host, non-asset links only — feeds the BFS crawl frontier."""
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


def _extract_page_content(html: str, page_url: str, host: str) -> PageContent:
    """Full extraction for the detailed per-page diff: visible text,
    structure signature, and every link on the page (any host), split into
    plain links vs. attachments. Runs on HTML already fetched by the crawl,
    so it costs no extra network requests.

    Each link also gets a "key" used for old-vs-new matching: for a link
    that stays on the same site as the page it was found on, the key is
    just its path (e.g. "/kontakt.html") -- because the old and new sites
    almost always live on different hosts, so the *same* internal link
    would otherwise never match between versions. For links to a different
    (external/third-party) host, the key is the full absolute URL, since
    there's no "same site" normalization to apply.
    """
    soup = BeautifulSoup(html, "lxml")

    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)

    structure = {tag: len(soup.find_all(tag)) for tag in STRUCTURE_TAGS}

    links: List[Dict[str, str]] = []
    attachments: List[Dict[str, str]] = []
    seen_hrefs: Set[str] = set()

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
        if absolute in seen_hrefs:
            continue
        seen_hrefs.add(absolute)

        link_text = tag.get_text(strip=True)
        path = absolute_parsed.path or "/"
        same_host = absolute_parsed.netloc == host
        key = _normalize_path(absolute) if same_host else absolute
        if _is_attachment(path):
            attachments.append({"href": absolute, "filename": _filename_from_href(absolute), "key": key})
        else:
            links.append({"href": absolute, "text": link_text, "key": key})

    return PageContent(html=html, text=text, structure=structure, links=links, attachments=attachments)


async def crawl_site(
    client: httpx.AsyncClient,
    base_url: str,
    max_pages: Optional[int],
    timeout_seconds: float,
) -> tuple[SiteReport, Dict[str, PageContent]]:
    """Breadth-first crawl of every reachable HTML subpage on ``base_url``.

    Pages are fetched in same-depth batches (concurrently, bounded by the
    ``httpx.AsyncClient``'s connection limits) rather than one at a time, so
    sites with many subpages don't take forever to crawl. If ``max_pages`` is
    None, the crawl continues until every discovered same-host page has been
    visited (capped internally at ``SAFETY_MAX_PAGES`` as a last resort).

    Returns the usual ``SiteReport`` plus a ``path -> PageContent`` map for
    every page that was fetched successfully as HTML, so the caller can build
    detailed content/links/attachments diffs without re-fetching.
    """
    base = _normalize_base(base_url)
    host = urlparse(base).netloc
    effective_max = max_pages if max_pages is not None else SAFETY_MAX_PAGES

    report = SiteReport(base_url=base, reachable=False)
    content_by_path: Dict[str, PageContent] = {}

    # 1) Reachability probe on the root URL.
    try:
        root_resp = await _get_with_retry(client, base, timeout_seconds)
        report.reachable = True
        report.root_status_code = root_resp.status_code
    except httpx.HTTPError as exc:
        report.reachable = False
        report.root_error = str(exc)
        report.page_count = 0
        return report, content_by_path

    # 2) Breadth-first traversal, restricted to the same host, one "layer"
    #    (frontier) of pages fetched concurrently at a time.
    visited: Set[str] = set()
    frontier: Set[str] = {"/"}
    pages: list[PageStatus] = []

    async def fetch_one(path: str) -> tuple[PageStatus, Set[str], Optional[PageContent]]:
        full_url = urljoin(base, path)
        try:
            resp = await _get_with_retry(client, full_url, timeout_seconds)
            status = resp.status_code
            ok = status < 400
            page = PageStatus(path=path, url=str(resp.url), status_code=status, ok=ok)
            links: Set[str] = set()
            content: Optional[PageContent] = None
            content_type = resp.headers.get("content-type", "")
            if ok and "text/html" in content_type:
                links = _extract_links(resp.text, str(resp.url), host)
                content = _extract_page_content(resp.text, str(resp.url), host)
            return page, links, content
        except httpx.HTTPError as exc:
            return PageStatus(path=path, url=full_url, status_code=None, ok=False, error=str(exc)), set(), None

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
        for page, links, content in results:
            pages.append(page)
            if content is not None:
                content_by_path[page.path] = content
            for link in links:
                if link not in visited:
                    next_frontier.add(link)
        frontier = next_frontier

    report.pages = pages
    report.page_count = len(pages)
    return report, content_by_path


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
        resp = await _get_with_retry(client, full_url, timeout_seconds)
        status = resp.status_code
        return PageStatus(path=path, url=str(resp.url), status_code=status, ok=status < 400)
    except httpx.HTTPError as exc:
        return PageStatus(path=path, url=full_url, status_code=None, ok=False, error=str(exc))
