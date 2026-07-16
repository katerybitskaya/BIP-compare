"""Orchestrates crawling both sites and computing the diff between them.

Each comparison run writes its results under ``results/{id}/``:

  results/{id}/summary.json     -- page list, missing/extra/unchanged, file/link diffs
  results/{id}/pages/old.json   -- full raw content of every crawled page on the old site
  results/{id}/pages/new.json   -- same, for the new site

The raw per-page snapshots (HTML, extracted text, structure signature,
links, attachments) are saved so a later step can diff any given page's old
vs. new content on demand, without re-crawling anything.

A site-wide comparison of every unique link and every unique file found
anywhere on either site is also computed (when the corresponding scope flag
is enabled) and saved straight into summary.json alongside everything else
-- no extra JSON file needed, since both are small, flat lists.

All saved JSON is written with indentation (human-readable) rather than as
one compact line -- these files are occasionally opened directly (e.g. to
double-check what a report actually captured), and a multi-megabyte single
line is effectively unopenable in a normal text editor. The extra
indentation overhead is small next to the cost of the network requests
that produced the data in the first place.
"""
from __future__ import annotations

import asyncio
import json
import shutil
import time
import uuid
from contextlib import AsyncExitStack
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

import httpx

from .crawler import (
    REQUEST_RETRIES,
    RETRY_BACKOFF_SECONDS,
    PageContent,
    _normalize_base,
    _timeout,
    check_reachable,
    crawl_site,
    probe_path,
)
from .models import (
    CompareRequest,
    ComparisonResult,
    FileDiffEntry,
    FileEntry,
    LinkDiffEntry,
    LinkEntry,
    PageDiffEntry,
    PageStatus,
    RawPageEntry,
    RawSiteSnapshot,
    ReportSummary,
    ScreenshotDiffEntry,
    SiteReport,
)
from .screenshots import capture_screenshots_sync, load_manifest, save_manifest, screenshot_filename
from .visual_diff import compare_screenshots

RESULTS_DIR = Path(__file__).resolve().parent.parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)

DEFAULT_HEADERS = {
    "User-Agent": "BipCompareBot/1.0 (+https://github.com/; strona porownawcza BIP)",
}

# Bounds how many requests are ever in flight at once *per site*, regardless
# of how many pages a site turns out to have — keeps large sites from opening
# hundreds of simultaneous connections. Applied per-site (see compare_sites:
# old_client/new_client are two separate httpx.AsyncClient instances, each
# with their own pool) so comparing two different hosts doesn't have them
# competing for one shared budget -- each site gets the full limit to itself.
# When both addresses are the same site, only one client is created and used
# for both "sides" (see same_site below), so that site still only sees one
# pool's worth of concurrent load, not double.
CLIENT_LIMITS = httpx.Limits(max_connections=20, max_keepalive_connections=10)

# Caps how many unique files (attachments) get probed for the site-wide file
# comparison (Dashboard's "Wyniki - pliki" list), across the whole site.
MAX_FILES = 1000

# Same idea, but for the site-wide link comparison -- links are usually
# far more numerous than attachments (every nav item repeats on every
# page), so the cap is a bit higher.
MAX_LINKS = 1500

# Maximum number of concurrent probe requests for missing/extra pages,
# files and links probing steps. The httpx client already limits open
# connections (CLIENT_LIMITS), but an explicit asyncio semaphore prevents
# thousands of coroutines from piling up in the event loop at once when
# a site has many candidates.
PROBE_CONCURRENCY = 30

# Upper bound on the timeout used for probing individual links/files/pages
# after crawling. Users may set timeout_seconds up to 120 s (needed for slow
# BIP page downloads), but a single probe HEAD/GET doesn't need that long.
PROBE_TIMEOUT_CAP = 15.0


def _build_raw_snapshot(site_report: SiteReport, content_by_path: Dict[str, PageContent]) -> RawSiteSnapshot:
    """Combines the crawl's per-page status (SiteReport.pages) with the
    extracted content (PageContent, for pages fetched as HTML) into one
    self-contained snapshot of everything found on this site."""
    pages: Dict[str, RawPageEntry] = {}
    for page in site_report.pages:
        content = content_by_path.get(page.path)
        pages[page.path] = RawPageEntry(
            url=page.url,
            status_code=page.status_code,
            ok=page.ok,
            error=page.error,
            html=content.html if content else None,
            text=content.text if content else None,
            structure=content.structure if content else None,
            links=content.links if content else None,
            attachments=content.attachments if content else None,
        )
    return RawSiteSnapshot(
        base_url=site_report.base_url,
        reachable=site_report.reachable,
        root_status_code=site_report.root_status_code,
        root_error=site_report.root_error,
        pages=pages,
    )


def _aggregate_attachments(content_by_path: Dict[str, PageContent]) -> Dict[str, Dict[str, str]]:
    """Every unique attachment (file) discovered anywhere on one site's
    crawl, keyed by normalized path (or absolute URL for cross-host files —
    see crawler._extract_page_content). The first page found linking to a
    given file "wins" as its recorded source_path."""
    files: Dict[str, Dict[str, str]] = {}
    for path, page_content in content_by_path.items():
        for att in page_content.attachments:
            key = att.get("key", att["href"])
            if key not in files:
                files[key] = {"href": att["href"], "filename": att["filename"], "source_path": path}
    return files


async def _probe_file(
    client: httpx.AsyncClient,
    href: str,
    timeout_seconds: float,
    cache: Dict[str, dict],
    semaphore: asyncio.Semaphore,
) -> dict:
    """Checks whether ``href`` responds (HEAD, falling back to GET if the
    server doesn't support HEAD), retrying on transient network failures so
    a single dropped connection under heavy crawl load doesn't permanently
    misclassify a perfectly fine link/file as broken.

    The ``semaphore`` argument limits how many probes run concurrently so that
    sites with large numbers of files/links don't spawn thousands of coroutines
    into the event loop at once.
    """
    if href in cache:
        return cache[href]
    t = min(timeout_seconds, PROBE_TIMEOUT_CAP)
    result = {"status_code": None, "ok": False, "size_bytes": None, "content_type": None}
    async with semaphore:
        for attempt in range(REQUEST_RETRIES + 1):
            try:
                resp = await client.head(href, timeout=_timeout(t), follow_redirects=True)
                if resp.status_code >= 400 or resp.status_code == 405:
                    # Some servers don't implement HEAD (or block it) — fall back to GET.
                    resp = await client.get(href, timeout=_timeout(t), follow_redirects=True)
                result["status_code"] = resp.status_code
                result["ok"] = resp.status_code < 400
                content_length = resp.headers.get("content-length")
                if content_length is not None:
                    try:
                        result["size_bytes"] = int(content_length)
                    except ValueError:
                        pass
                result["content_type"] = resp.headers.get("content-type")
                break
            except httpx.HTTPError:
                if attempt < REQUEST_RETRIES:
                    await asyncio.sleep(RETRY_BACKOFF_SECONDS * (attempt + 1))
    cache[href] = result
    return result


async def build_file_diffs(
    old_client: httpx.AsyncClient,
    new_client: httpx.AsyncClient,
    old_content: Dict[str, PageContent],
    new_content: Dict[str, PageContent],
    timeout_seconds: float,
) -> list[FileDiffEntry]:
    """Site-wide comparison of every downloadable file (attachment) found
    anywhere on either site — independent of which specific page(s) link to
    it. This is what powers the Dashboard's flat "Wyniki - pliki" table.

    Each side is probed through its own client (old_client/new_client) --
    two separate connection pools -- so probing files found on the old site
    doesn't compete for connection slots with probing files found on the new
    site (see CLIENT_LIMITS / compare_sites).
    """
    old_files = _aggregate_attachments(old_content)
    new_files = _aggregate_attachments(new_content)
    all_keys = sorted(set(old_files) | set(new_files))[:MAX_FILES]

    cache: Dict[str, dict] = {}
    semaphore = asyncio.Semaphore(PROBE_CONCURRENCY)

    async def probe_side(
        client: httpx.AsyncClient, files_map: Dict[str, Dict[str, str]], key: str
    ) -> Optional[FileEntry]:
        entry = files_map.get(key)
        if entry is None:
            return None
        probe = await _probe_file(client, entry["href"], timeout_seconds, cache, semaphore)
        return FileEntry(
            filename=entry["filename"],
            href=entry["href"],
            status_code=probe["status_code"],
            ok=probe["ok"],
            size_bytes=probe["size_bytes"],
            content_type=probe["content_type"],
            source_path=entry["source_path"],
        )

    old_entries, new_entries = await asyncio.gather(
        asyncio.gather(*[probe_side(old_client, old_files, k) for k in all_keys]),
        asyncio.gather(*[probe_side(new_client, new_files, k) for k in all_keys]),
    )

    diffs: list[FileDiffEntry] = []
    for key, old_entry, new_entry in zip(all_keys, old_entries, new_entries):
        filename = (old_entry or new_entry).filename  # type: ignore[union-attr]
        if old_entry is None:
            status = "new"
        elif new_entry is None:
            status = "removed"
        elif not new_entry.ok:
            status = "error404"
        elif (
            old_entry.size_bytes is not None
            and new_entry.size_bytes is not None
            and old_entry.size_bytes != new_entry.size_bytes
        ):
            status = "different"
        else:
            status = "ok"
        diffs.append(FileDiffEntry(key=key, filename=filename, old=old_entry, new=new_entry, status=status))

    diffs.sort(key=lambda d: d.filename.lower())
    return diffs


def _aggregate_links(content_by_path: Dict[str, PageContent]) -> Dict[str, Dict[str, str]]:
    """Every unique link (<a href>, excluding attachments) discovered
    anywhere on one site's crawl, keyed the same way as crawler._extract_page_content
    builds each link's "key" -- normalized path for same-host links, full
    absolute URL for cross-host ones. The first page found linking to a
    given href "wins" as its recorded source_path and link text."""
    links: Dict[str, Dict[str, str]] = {}
    for path, page_content in content_by_path.items():
        for link in page_content.links:
            key = link.get("key", link["href"])
            if key not in links:
                links[key] = {"href": link["href"], "text": link.get("text", ""), "source_path": path}
    return links


async def build_link_diffs(
    old_client: httpx.AsyncClient,
    new_client: httpx.AsyncClient,
    old_content: Dict[str, PageContent],
    new_content: Dict[str, PageContent],
    timeout_seconds: float,
) -> list[LinkDiffEntry]:
    """Site-wide comparison of every link found anywhere on either site --
    independent of which specific page(s) point to it. Reuses the same
    HEAD-then-GET probing as the file comparison, since checking "does this
    href respond" is identical logic either way.

    Each side is probed through its own client (old_client/new_client), same
    reasoning as build_file_diffs -- keeps the two sides' probing from
    competing for one shared connection pool."""
    old_links = _aggregate_links(old_content)
    new_links = _aggregate_links(new_content)
    all_keys = sorted(set(old_links) | set(new_links))[:MAX_LINKS]

    cache: Dict[str, dict] = {}
    semaphore = asyncio.Semaphore(PROBE_CONCURRENCY)

    async def probe_side(
        client: httpx.AsyncClient, links_map: Dict[str, Dict[str, str]], key: str
    ) -> Optional[LinkEntry]:
        entry = links_map.get(key)
        if entry is None:
            return None
        probe = await _probe_file(client, entry["href"], timeout_seconds, cache, semaphore)
        return LinkEntry(
            href=entry["href"],
            text=entry["text"],
            status_code=probe["status_code"],
            ok=probe["ok"],
            source_path=entry["source_path"],
        )

    old_entries, new_entries = await asyncio.gather(
        asyncio.gather(*[probe_side(old_client, old_links, k) for k in all_keys]),
        asyncio.gather(*[probe_side(new_client, new_links, k) for k in all_keys]),
    )

    diffs: list[LinkDiffEntry] = []
    for key, old_entry, new_entry in zip(all_keys, old_entries, new_entries):
        text = (old_entry or new_entry).text or key  # type: ignore[union-attr]
        if old_entry is None:
            status = "new"
        elif new_entry is None:
            status = "removed"
        elif not new_entry.ok:
            status = "broken"
        else:
            status = "ok"
        diffs.append(LinkDiffEntry(key=key, text=text, old=old_entry, new=new_entry, status=status))

    diffs.sort(key=lambda d: d.text.lower())
    return diffs


def _write_snapshots(pages_dir: Path, old_snapshot: RawSiteSnapshot, new_snapshot: RawSiteSnapshot, same_site: bool) -> None:
    """Serializes each side's raw content into its own readable JSON file.

    Runs inside asyncio.to_thread (see compare_sites) since JSON-encoding a
    full site's worth of HTML is CPU-bound and would otherwise block the
    event loop while the file/link probing steps are trying to make
    concurrent network progress.
    """
    (pages_dir / "old.json").write_text(old_snapshot.model_dump_json(indent=2), encoding="utf-8")
    if same_site:
        (pages_dir / "new.json").write_text(old_snapshot.model_dump_json(indent=2), encoding="utf-8")
    else:
        (pages_dir / "new.json").write_text(new_snapshot.model_dump_json(indent=2), encoding="utf-8")


async def compare_sites(req: CompareRequest) -> ComparisonResult:
    started = time.perf_counter()
    result_id = str(uuid.uuid4())
    result_dir = RESULTS_DIR / result_id
    result_dir.mkdir(parents=True, exist_ok=True)

    # If both addresses point at the exact same site, crawling it twice in
    # parallel would only double the load on that one server (competing for
    # the same connection pool and, if it's rate-limited, tripping it) while
    # being guaranteed to report zero differences anyway. Crawl it once and
    # reuse the result for both "sides" instead.
    same_site = _normalize_base(str(req.old_url)) == _normalize_base(str(req.new_url))

    async with AsyncExitStack() as stack:
        # Two separate clients (each with their own CLIENT_LIMITS connection
        # pool) so crawling/probing the old site and the new site never
        # compete for the same pool of connections -- each site gets the
        # full concurrency budget to itself. When both addresses are the
        # same site (same_site), reuse a single client for both "sides"
        # instead, so that one server doesn't see double the load.
        old_client = await stack.enter_async_context(
            httpx.AsyncClient(headers=DEFAULT_HEADERS, limits=CLIENT_LIMITS)
        )
        new_client = (
            old_client
            if same_site
            else await stack.enter_async_context(httpx.AsyncClient(headers=DEFAULT_HEADERS, limits=CLIENT_LIMITS))
        )

        # --- Step 0: fast reachability probe (early exit) ------------------
        # Check both root URLs BEFORE starting any full crawl. If either site
        # is unreachable we can return immediately with a clear error message
        # instead of waiting for the crawl to time out on every page.
        if same_site:
            old_reachable, old_root_code, old_root_err = await check_reachable(
                old_client, str(req.old_url), req.timeout_seconds
            )
            new_reachable, new_root_code, new_root_err = old_reachable, old_root_code, old_root_err
        else:
            (old_reachable, old_root_code, old_root_err), (new_reachable, new_root_code, new_root_err) = (
                await asyncio.gather(
                    check_reachable(old_client, str(req.old_url), req.timeout_seconds),
                    check_reachable(new_client, str(req.new_url), req.timeout_seconds),
                )
            )

        if not old_reachable or not new_reachable:
            # Build minimal SiteReports so the caller can display which site
            # failed and why, without doing any further network work.
            old_report = SiteReport(
                base_url=_normalize_base(str(req.old_url)),
                reachable=old_reachable,
                root_status_code=old_root_code,
                root_error=old_root_err,
                page_count=0,
            )
            new_report = SiteReport(
                base_url=_normalize_base(str(req.new_url)),
                reachable=new_reachable,
                root_status_code=new_root_code,
                root_error=new_root_err,
                page_count=0,
            )
            duration_ms = (time.perf_counter() - started) * 1000
            result = ComparisonResult(
                id=result_id,
                generated_at=datetime.now(timezone.utc),
                duration_ms=round(duration_ms, 1),
                old_url=str(req.old_url),
                new_url=str(req.new_url),
                old_site=old_report,
                new_site=new_report,
                both_reachable=False,
                scope=req.scope,
                missing_in_new=[],
                extra_in_new=[],
                unchanged_paths=[],
                file_diffs=[],
                link_diffs=[],
                content_checked_count=0,
                content_changed_count=0,
            )
            _save_result(result)
            return result

        # --- Step 1: full BFS crawl of both sites --------------------------
        # Besides the page list and raw content, each crawl also returns the
        # set of paths identified as changelog/sitemap "meta" pages (see
        # crawler.META_PAGE_LABELS). Their existence is tracked like any
        # other page and their own content IS diffed like any other page --
        # the only thing special about them is that whatever THEY link to
        # was never crawled or aggregated in the first place (handled
        # entirely inside crawl_site). meta_paths itself isn't used for
        # content-diff filtering (see below) -- kept here in case a future
        # feature needs to know which pages these are.
        if same_site:
            old_report, old_content, old_meta_paths = await crawl_site(
                old_client, str(req.old_url), req.max_pages, req.timeout_seconds
            )
            new_report, new_content, new_meta_paths = old_report, old_content, old_meta_paths
        else:
            (old_report, old_content, old_meta_paths), (new_report, new_content, new_meta_paths) = (
                await asyncio.gather(
                    crawl_site(old_client, str(req.old_url), req.max_pages, req.timeout_seconds),
                    crawl_site(new_client, str(req.new_url), req.max_pages, req.timeout_seconds),
                )
            )
        meta_paths = old_meta_paths | new_meta_paths

        both_reachable = old_report.reachable and new_report.reachable

        old_paths = {p.path for p in old_report.pages if p.ok}
        new_paths = {p.path for p in new_report.pages if p.ok}

        old_status_by_path = {p.path: p for p in old_report.pages}
        new_status_by_path = {p.path: p for p in new_report.pages}

        candidate_missing = [] if same_site else sorted(old_paths - new_paths)
        candidate_extra = [] if same_site else sorted(new_paths - old_paths)
        unchanged = sorted(old_paths) if same_site else sorted(old_paths & new_paths)

        missing_in_new: list[PageDiffEntry] = []
        extra_in_new: list[PageDiffEntry] = []

        if both_reachable and not same_site:
            # A path that one site's own crawl found working but the other
            # site's own crawl never discovered is reported as missing/extra
            # -- no exceptions. We still probe it directly on the other site
            # too (second chance), purely to record what that direct check
            # actually returns (checked_url/checked_status_code) -- useful
            # diagnostic info, e.g. showing that a "soft 200" site really
            # did respond even though we're still counting it as missing.
            # The probe result does NOT decide inclusion anymore: some sites
            # (e.g. bip2.k8s.rekord.com.pl) respond with a "soft" success to
            # literally any path -- including ones that plainly don't exist
            # -- so trusting "probe says ok" to skip an entry silently hid
            # every real missing/extra page behind a false "still exists".
            probe_sem = asyncio.Semaphore(PROBE_CONCURRENCY)

            async def _probe_missing(path: str):
                async with probe_sem:
                    return await probe_path(new_client, str(req.new_url), path, req.timeout_seconds)

            async def _probe_extra(path: str):
                async with probe_sem:
                    return await probe_path(old_client, str(req.old_url), path, req.timeout_seconds)

            missing_probes, extra_probes = await asyncio.gather(
                asyncio.gather(*[_probe_missing(p) for p in candidate_missing]),
                asyncio.gather(*[_probe_extra(p) for p in candidate_extra]),
            )

            def _probe_reason(probe: "PageStatus", not_found_text: str) -> str:
                # If the direct second-chance check itself failed (an actual
                # error status, or no response at all), that's more useful
                # to show than the generic "not found during crawl" text --
                # it tells you exactly why the page is missing/extra. Only
                # when the probe came back ok (e.g. a "soft 200") do we fall
                # back to the generic text, since in that case the status
                # code alone ("200") wouldn't explain anything.
                if not probe.ok:
                    return f"HTTP {probe.status_code}" if probe.status_code is not None else "brak odpowiedzi"
                return not_found_text

            for path, probe in zip(candidate_missing, missing_probes):
                old_status = old_status_by_path.get(path)
                missing_in_new.append(
                    PageDiffEntry(
                        path=path,
                        reference_url=old_status.url if old_status else str(req.old_url),
                        reference_status_code=old_status.status_code if old_status else None,
                        checked_url=probe.url,
                        checked_status_code=probe.status_code,
                        reason=_probe_reason(probe, "nie znaleziono podczas przeszukiwania nowego adresu"),
                    )
                )

            for path, probe in zip(candidate_extra, extra_probes):
                new_status = new_status_by_path.get(path)
                extra_in_new.append(
                    PageDiffEntry(
                        path=path,
                        reference_url=new_status.url if new_status else str(req.new_url),
                        reference_status_code=new_status.status_code if new_status else None,
                        checked_url=probe.url,
                        checked_status_code=probe.status_code,
                        reason=_probe_reason(probe, "nie znaleziono podczas przeszukiwania starego adresu"),
                    )
                )

        # --- Content comparison summary (cheap, in-memory) ------------------
        # How many of the common (unchanged-path) pages actually have
        # identical content -- just an equality check on strings the crawl
        # already fetched, no extra requests. Powers the Dashboard's
        # "X / Y stron zmienionych" tile and the report's content overview.
        #
        # Every common page is diffed here, changelog/sitemap "meta" pages
        # (historia zmian, mapa strony) included -- their own content is
        # compared like any other page. The meta-page exclusion only applies
        # to the crawler (not following/collecting links found INSIDE those
        # pages, see crawler.META_PAGE_LABELS) -- that's a "podstrony"-level
        # concern, unaffected by this.
        content_checked_count = 0
        content_changed_count = 0
        if both_reachable and req.scope.content and not same_site:
            for path in unchanged:
                old_page = old_content.get(path)
                new_page = new_content.get(path)
                if old_page is None or new_page is None:
                    continue
                content_checked_count += 1
                if old_page.html != new_page.html or old_page.text != new_page.text:
                    content_changed_count += 1
        elif both_reachable and req.scope.content and same_site:
            content_checked_count = len(unchanged)
            content_changed_count = 0

        # --- Raw per-page content snapshot -----------------------------------
        # Full HTML/text/links/attachments for every crawled page on both
        # sites, saved as pages/old.json + pages/new.json (see
        # _write_snapshots) via asyncio.to_thread so the JSON serialisation
        # (potentially several MB for large sites) doesn't block the event loop.
        #
        # Only needed when the "Zawartość" scope is on -- these files exist
        # solely to power the on-demand /content-diff endpoint. Links/files
        # are fully self-contained in link_diffs/file_diffs (saved straight
        # into summary.json), so when content is off there's no reason to
        # pay the (potentially large) disk-write cost for pages/*.json.
        async def _write_snapshots_if_needed():
            if not req.scope.content:
                return
            old_snapshot = _build_raw_snapshot(old_report, old_content)
            new_snapshot = old_snapshot if same_site else _build_raw_snapshot(new_report, new_content)
            pages_dir = result_dir / "pages"
            pages_dir.mkdir(parents=True, exist_ok=True)
            await asyncio.to_thread(_write_snapshots, pages_dir, old_snapshot, new_snapshot, same_site)

        # --- Site-wide file (attachment) and link comparisons ---------------
        # Run snapshot writing and the two probe-heavy comparisons in parallel
        # so the I/O and network work overlap rather than being serialised.
        async def _run_file_diffs():
            if both_reachable and req.scope.attachments:
                return await build_file_diffs(old_client, new_client, old_content, new_content, req.timeout_seconds)
            return []

        async def _run_link_diffs():
            if both_reachable and req.scope.links:
                return await build_link_diffs(old_client, new_client, old_content, new_content, req.timeout_seconds)
            return []

        # --- Full-page screenshots (opt-in, off by default) ------------------
        # Renders every reachable page in a real browser (Playwright/Chromium)
        # and saves a full-page PNG -- for manual side-by-side visual
        # comparison, not an automated pixel diff. Only runs when the
        # "Zrzuty ekranów" scope is checked, since this is much slower and
        # heavier per page than the plain HTTP fetch everything else uses.
        async def _capture_screenshots_if_needed() -> tuple[list[ScreenshotDiffEntry], Optional[str]]:
            if not (both_reachable and req.scope.screenshots):
                return [], None

            # Both folders are created up front, unconditionally -- before
            # Playwright is even imported -- so results/{id}/screenshots/old
            # and .../new always exist on disk once screenshots were enabled
            # for a run, regardless of whether capture actually succeeds.
            # Makes a failed run's on-disk state self-explanatory (empty
            # old/new folders = capture ran but got nothing; folders missing
            # entirely would mean this step never even started).
            screenshots_dir = result_dir / "screenshots"
            old_dir = screenshots_dir / "old"
            new_dir = screenshots_dir / "new"
            old_dir.mkdir(parents=True, exist_ok=True)
            new_dir.mkdir(parents=True, exist_ok=True)

            try:
                old_targets = [(p.path, p.url) for p in old_report.pages if p.ok]
                if same_site:
                    old_paths = await asyncio.to_thread(
                        capture_screenshots_sync, old_targets, old_dir, req.timeout_seconds
                    )
                    # Same site on both sides -- reuse the already-rendered
                    # images for "new" instead of opening every page twice.
                    for path in old_paths:
                        filename = screenshot_filename(path)
                        shutil.copyfile(old_dir / filename, new_dir / filename)
                    new_paths = old_paths
                else:
                    new_targets = [(p.path, p.url) for p in new_report.pages if p.ok]
                    old_paths, new_paths = await asyncio.gather(
                        asyncio.to_thread(capture_screenshots_sync, old_targets, old_dir, req.timeout_seconds),
                        asyncio.to_thread(capture_screenshots_sync, new_targets, new_dir, req.timeout_seconds),
                    )
                save_manifest(screenshots_dir, old_paths, new_paths)

                error: Optional[str] = None
                if req.scope.screenshots and not old_paths and not new_paths and old_targets:
                    # Capture ran without raising, but produced literally
                    # nothing -- every page failed individually (each
                    # failure is swallowed inside capture_screenshots so the
                    # whole batch isn't aborted by one bad page). Surface
                    # that as a visible warning rather than a silent "0
                    # screenshots" the user has to notice on their own.
                    error = (
                        "Nie udało się przechwycić żadnego zrzutu ekranu -- każda podstrona "
                        "zakończyła się błędem podczas renderowania (timeout, błąd sieci albo "
                        "przeglądarki)."
                    )

                # --- Pixel-level diff (pixelmatch) ---------------------------
                # Only possible for paths captured on BOTH sides -- a path
                # only present on one side (missing/extra page) has nothing
                # to diff against. Each comparison is real CPU-bound image
                # work, so it's offloaded to a thread per path and run
                # concurrently rather than serially blocking the event loop.
                common_paths = sorted(set(old_paths) & set(new_paths))
                diff_dir = screenshots_dir / "diff"
                diff_errors: list[str] = []

                async def _diff_one(path: str) -> ScreenshotDiffEntry | None:
                    filename = screenshot_filename(path)
                    try:
                        stats = await asyncio.to_thread(
                            compare_screenshots,
                            old_dir / filename,
                            new_dir / filename,
                            diff_dir / filename,
                        )
                    except Exception as exc:
                        message = f"{type(exc).__name__}: {exc}"
                        print(f"[screenshots] nie udało się porównać {path}: {message}")
                        diff_errors.append(message)
                        return None
                    status = "identical" if stats["mismatched_pixels"] == 0 else "different"
                    return ScreenshotDiffEntry(path=path, status=status, **stats)

                diff_results = await asyncio.gather(*[_diff_one(p) for p in common_paths])
                screenshot_entries = [d for d in diff_results if d is not None]

                if error is None and common_paths and not screenshot_entries and diff_errors:
                    # Capture worked (both sides have images for these paths)
                    # but every single pixel-comparison call failed -- almost
                    # certainly Pillow/pixelmatch aren't installed in this
                    # environment. Surface the real reason instead of a
                    # silent "0 zrzutów porównanych" the user has to guess at.
                    error = (
                        "Zrzuty ekranów zostały zrobione, ale porównanie pikselowe nie powiodło "
                        "się dla żadnej wspólnej podstrony -- sprawdź, czy Pillow i pixelmatch są "
                        "zainstalowane w środowisku backendu (`pip install -r requirements.txt`). "
                        f"Przykładowy błąd: {diff_errors[0]}"
                    )

                return screenshot_entries, error
            except Exception as exc:
                # Screenshots are optional (opt-in) -- if Playwright isn't
                # installed (`pip install playwright` + `playwright install
                # chromium` weren't run) or the browser crashes for some
                # other reason, that shouldn't take down the entire
                # comparison. Log AND return the message (screenshot_error)
                # so it's visible in the report itself, not just the server
                # console -- continue with no screenshots for this run
                # rather than failing podstrony/zawartość/linki/pliki too,
                # which all succeeded independently of this step.
                message = f"{type(exc).__name__}: {exc}"
                print(f"[screenshots] pominięto zrzuty ekranów dla {result_id}: {message}")
                return [], message

        file_diffs, link_diffs, _, (screenshot_diffs, screenshot_error) = await asyncio.gather(
            _run_file_diffs(),
            _run_link_diffs(),
            _write_snapshots_if_needed(),
            _capture_screenshots_if_needed(),
        )

    duration_ms = (time.perf_counter() - started) * 1000

    result = ComparisonResult(
        id=result_id,
        generated_at=datetime.now(timezone.utc),
        duration_ms=round(duration_ms, 1),
        old_url=str(req.old_url),
        new_url=str(req.new_url),
        old_site=old_report,
        new_site=new_report,
        both_reachable=both_reachable,
        scope=req.scope,
        missing_in_new=missing_in_new,
        extra_in_new=extra_in_new,
        unchanged_paths=unchanged,
        file_diffs=file_diffs,
        link_diffs=link_diffs,
        content_checked_count=content_checked_count,
        content_changed_count=content_changed_count,
        screenshot_diffs=screenshot_diffs,
        screenshot_error=screenshot_error,
    )

    _save_result(result)
    return result


def _save_result(result: ComparisonResult) -> None:
    result_dir = RESULTS_DIR / result.id
    result_dir.mkdir(parents=True, exist_ok=True)
    out_path = result_dir / "summary.json"
    out_path.write_text(result.model_dump_json(indent=2), encoding="utf-8")


def _to_summary(result: ComparisonResult) -> ReportSummary:
    return ReportSummary(
        id=result.id,
        generated_at=result.generated_at,
        duration_ms=result.duration_ms,
        old_url=result.old_url,
        new_url=result.new_url,
        both_reachable=result.both_reachable,
        old_reachable=result.old_site.reachable,
        new_reachable=result.new_site.reachable,
        old_page_count=result.old_site.page_count,
        new_page_count=result.new_site.page_count,
        missing_count=len(result.missing_in_new),
        extra_count=len(result.extra_in_new),
        unchanged_count=len(result.unchanged_paths),
        scope=result.scope,
        file_count=len(result.file_diffs),
        file_issue_count=sum(1 for f in result.file_diffs if f.status != "ok"),
        link_count=len(result.link_diffs),
        link_issue_count=sum(1 for l in result.link_diffs if l.status != "ok"),
        content_checked_count=result.content_checked_count,
        content_changed_count=result.content_changed_count,
    )


def load_result(result_id: str) -> ComparisonResult | None:
    path = RESULTS_DIR / result_id / "summary.json"
    if not path.exists():
        return None
    return ComparisonResult.model_validate_json(path.read_text(encoding="utf-8"))


def load_raw_snapshot(result_id: str, side: str) -> RawSiteSnapshot | None:
    """Loads the full raw per-page content snapshot for one side ("old" or
    "new") of a saved comparison, from results/{id}/pages/{side}.json.

    Also falls back to a combined results/{id}/snapshot.json, in case this
    report was saved during the brief period where old/new were merged into
    a single compact file -- keeps those reports readable too.
    """
    if side not in ("old", "new"):
        return None

    pages_path = RESULTS_DIR / result_id / "pages" / f"{side}.json"
    if pages_path.exists():
        return RawSiteSnapshot.model_validate_json(pages_path.read_text(encoding="utf-8"))

    combined_path = RESULTS_DIR / result_id / "snapshot.json"
    if combined_path.exists():
        combined = json.loads(combined_path.read_text(encoding="utf-8"))
        entry = combined.get(side)
        if entry is None:
            return None
        return RawSiteSnapshot.model_validate(entry)

    return None


def load_screenshot_manifest(result_id: str) -> dict[str, list[str]] | None:
    """Returns {"old": [...], "new": [...]} -- the paths that actually got a
    screenshot captured for each side of a saved comparison (see
    screenshots.save_manifest). None if screenshots were never captured for
    this report (scope.screenshots was off, or it predates this feature)."""
    return load_manifest(RESULTS_DIR / result_id / "screenshots")


def get_screenshot_file(result_id: str, side: str, path: str) -> Path | None:
    """Resolves a page path to its saved screenshot for one side of a saved
    comparison -- "old"/"new" for the raw screenshots, "diff" for the
    pixelmatch visual-diff image (visual_diff.compare_screenshots). None if
    it doesn't exist (wrong side, path was never captured/diffed, or
    screenshots weren't enabled for this report)."""
    if side not in ("old", "new", "diff"):
        return None
    file_path = RESULTS_DIR / result_id / "screenshots" / side / screenshot_filename(path)
    return file_path if file_path.exists() else None


def list_result_summaries() -> list[ReportSummary]:
    summaries: list[ReportSummary] = []
    for summary_path in RESULTS_DIR.glob("*/summary.json"):
        try:
            result = ComparisonResult.model_validate_json(summary_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        summaries.append(_to_summary(result))
    summaries.sort(key=lambda s: s.generated_at, reverse=True)
    return summaries


def delete_result(result_id: str) -> bool:
    """Deletes one saved comparison report (summary.json + pages/) by id.
    Returns False if no report with that id exists, so the caller can
    respond with 404 instead of silently pretending it succeeded."""
    if "/" in result_id or "\\" in result_id or result_id in ("", ".", ".."):
        return False  # reject anything that isn't a plain report-id path segment
    result_dir = RESULTS_DIR / result_id
    if not result_dir.is_dir():
        return False
    shutil.rmtree(result_dir)
    return True


def clear_all_results() -> int:
    """Deletes every saved comparison report. Returns how many were removed.

    Individual entries that can't be deleted (e.g. leftover files from an
    older format, or a permissions quirk of the host filesystem) are
    skipped rather than aborting the whole operation.
    """
    removed = 0
    for entry in RESULTS_DIR.iterdir():
        try:
            if entry.is_dir():
                shutil.rmtree(entry)
                removed += 1
            elif entry.name != ".gitkeep":
                entry.unlink()
                removed += 1
        except OSError:
            continue
    return removed
