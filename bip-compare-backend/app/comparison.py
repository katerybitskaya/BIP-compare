"""Orchestrates crawling both sites and computing the diff between them.

Each comparison run writes its results under ``results/{id}/``:

  results/{id}/summary.json     -- page list, missing/extra/unchanged, file diffs
  results/{id}/pages/old.json   -- full raw content of every crawled page on the old site
  results/{id}/pages/new.json   -- same, for the new site

The raw per-page snapshots (HTML, extracted text, structure signature,
links, attachments) are saved so a later step can diff any given page's old
vs. new content on demand, without re-crawling anything.

A site-wide comparison of every unique link and every unique file found
anywhere on either site is also computed (when the corresponding scope flag
is enabled) and saved straight into summary.json alongside everything else
-- no extra JSON file needed, since both are small, flat lists.
"""
from __future__ import annotations

import asyncio
import shutil
import time
import uuid
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
    RawPageEntry,
    RawSiteSnapshot,
    ReportSummary,
    SiteReport,
)

RESULTS_DIR = Path(__file__).resolve().parent.parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)

DEFAULT_HEADERS = {
    "User-Agent": "BipCompareBot/1.0 (+https://github.com/; strona porownawcza BIP)",
}

# Bounds how many requests are ever in flight at once (across crawling both
# sites and the later file-probing step), regardless of how many pages a
# site turns out to have — keeps large sites from opening hundreds of
# simultaneous connections.
CLIENT_LIMITS = httpx.Limits(max_connections=20, max_keepalive_connections=10)

# Caps how many unique files (attachments) get probed for the site-wide file
# comparison (Dashboard's "Wyniki - pliki" list), across the whole site.
MAX_FILES = 1000

# Same idea, but for the site-wide link comparison -- links are usually
# far more numerous than attachments (every nav item repeats on every
# page), so the cap is a bit higher.
MAX_LINKS = 1500


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
    client: httpx.AsyncClient, href: str, timeout_seconds: float, cache: Dict[str, dict]
) -> dict:
    """Checks whether ``href`` responds (HEAD, falling back to GET if the
    server doesn't support HEAD), retrying on transient network failures so
    a single dropped connection under heavy crawl load doesn't permanently
    misclassify a perfectly fine link/file as broken."""
    if href in cache:
        return cache[href]
    result = {"status_code": None, "ok": False, "size_bytes": None, "content_type": None}
    for attempt in range(REQUEST_RETRIES + 1):
        try:
            resp = await client.head(href, timeout=_timeout(timeout_seconds), follow_redirects=True)
            if resp.status_code >= 400 or resp.status_code == 405:
                # Some servers don't implement HEAD (or block it) — fall back to GET.
                resp = await client.get(href, timeout=_timeout(timeout_seconds), follow_redirects=True)
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
    client: httpx.AsyncClient,
    old_content: Dict[str, PageContent],
    new_content: Dict[str, PageContent],
    timeout_seconds: float,
) -> list[FileDiffEntry]:
    """Site-wide comparison of every downloadable file (attachment) found
    anywhere on either site — independent of which specific page(s) link to
    it. This is what powers the Dashboard's flat "Wyniki - pliki" table.
    """
    old_files = _aggregate_attachments(old_content)
    new_files = _aggregate_attachments(new_content)
    all_keys = sorted(set(old_files) | set(new_files))[:MAX_FILES]

    cache: Dict[str, dict] = {}

    async def probe_side(files_map: Dict[str, Dict[str, str]], key: str) -> Optional[FileEntry]:
        entry = files_map.get(key)
        if entry is None:
            return None
        probe = await _probe_file(client, entry["href"], timeout_seconds, cache)
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
        asyncio.gather(*[probe_side(old_files, k) for k in all_keys]),
        asyncio.gather(*[probe_side(new_files, k) for k in all_keys]),
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
    client: httpx.AsyncClient,
    old_content: Dict[str, PageContent],
    new_content: Dict[str, PageContent],
    timeout_seconds: float,
) -> list[LinkDiffEntry]:
    """Site-wide comparison of every link found anywhere on either site --
    independent of which specific page(s) point to it. Reuses the same
    HEAD-then-GET probing as the file comparison, since checking "does this
    href respond" is identical logic either way."""
    old_links = _aggregate_links(old_content)
    new_links = _aggregate_links(new_content)
    all_keys = sorted(set(old_links) | set(new_links))[:MAX_LINKS]

    cache: Dict[str, dict] = {}

    async def probe_side(links_map: Dict[str, Dict[str, str]], key: str) -> Optional[LinkEntry]:
        entry = links_map.get(key)
        if entry is None:
            return None
        probe = await _probe_file(client, entry["href"], timeout_seconds, cache)
        return LinkEntry(
            href=entry["href"],
            text=entry["text"],
            status_code=probe["status_code"],
            ok=probe["ok"],
            source_path=entry["source_path"],
        )

    old_entries, new_entries = await asyncio.gather(
        asyncio.gather(*[probe_side(old_links, k) for k in all_keys]),
        asyncio.gather(*[probe_side(new_links, k) for k in all_keys]),
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


async def compare_sites(req: CompareRequest) -> ComparisonResult:
    started = time.perf_counter()
    result_id = str(uuid.uuid4())

    # If both addresses point at the exact same site, crawling it twice in
    # parallel would only double the load on that one server (competing for
    # the same connection pool and, if it's rate-limited, tripping it) while
    # being guaranteed to report zero differences anyway. Crawl it once and
    # reuse the result for both "sides" instead.
    same_site = _normalize_base(str(req.old_url)) == _normalize_base(str(req.new_url))

    async with httpx.AsyncClient(headers=DEFAULT_HEADERS, limits=CLIENT_LIMITS) as client:
        if same_site:
            old_report, old_content = await crawl_site(client, str(req.old_url), req.max_pages, req.timeout_seconds)
            new_report, new_content = old_report, old_content
        else:
            (old_report, old_content), (new_report, new_content) = await asyncio.gather(
                crawl_site(client, str(req.old_url), req.max_pages, req.timeout_seconds),
                crawl_site(client, str(req.new_url), req.max_pages, req.timeout_seconds),
            )

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
            # A path only *looks* missing if the other site's own crawl never
            # found a link to it. Before declaring it gone, probe the exact
            # same path directly on the new site — it might exist but just be
            # unlinked, in which case it isn't really "missing".
            missing_probes = await asyncio.gather(
                *[probe_path(client, str(req.new_url), path, req.timeout_seconds) for path in candidate_missing]
            )
            for path, probe in zip(candidate_missing, missing_probes):
                if probe.ok:
                    continue  # exists on new site, just unlinked — not missing
                old_status = old_status_by_path.get(path)
                missing_in_new.append(
                    PageDiffEntry(
                        path=path,
                        reference_url=old_status.url if old_status else str(req.old_url),
                        reference_status_code=old_status.status_code if old_status else None,
                        checked_url=probe.url,
                        checked_status_code=probe.status_code,
                        reason=probe.error or f"HTTP {probe.status_code}" if probe.status_code else (probe.error or "niedostępna"),
                    )
                )

            extra_probes = await asyncio.gather(
                *[probe_path(client, str(req.old_url), path, req.timeout_seconds) for path in candidate_extra]
            )
            for path, probe in zip(candidate_extra, extra_probes):
                if probe.ok:
                    continue  # exists on old site too, just unlinked — not really "extra"
                new_status = new_status_by_path.get(path)
                extra_in_new.append(
                    PageDiffEntry(
                        path=path,
                        reference_url=new_status.url if new_status else str(req.new_url),
                        reference_status_code=new_status.status_code if new_status else None,
                        checked_url=probe.url,
                        checked_status_code=probe.status_code,
                        reason=probe.error or (f"HTTP {probe.status_code}" if probe.status_code else "niedostępna na starym adresie"),
                    )
                )

        # --- Content comparison summary (cheap, in-memory) ------------------
        # How many of the common (unchanged-path) pages actually have
        # identical content -- just an equality check on strings the crawl
        # already fetched, no extra requests. Powers the Dashboard's
        # "X / Y stron zmienionych" tile and the report's content overview.
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

        # --- Raw per-page content snapshots --------------------------------
        # Full HTML/text/links/attachments for every crawled page on each
        # site, saved so a later step can diff any page's content on demand.
        # Cheap to build — no extra network requests, just serializing data
        # already gathered by the crawl.
        pages_dir = RESULTS_DIR / result_id / "pages"
        pages_dir.mkdir(parents=True, exist_ok=True)
        old_snapshot = _build_raw_snapshot(old_report, old_content)
        new_snapshot = old_snapshot if same_site else _build_raw_snapshot(new_report, new_content)
        (pages_dir / "old.json").write_text(old_snapshot.model_dump_json(indent=2), encoding="utf-8")
        (pages_dir / "new.json").write_text(new_snapshot.model_dump_json(indent=2), encoding="utf-8")

        # --- Site-wide file (attachment) comparison ------------------------
        # Every file discovered anywhere on either site, compared by
        # name/size/reachability. Powers the Dashboard's flat file list.
        file_diffs: list[FileDiffEntry] = []
        if both_reachable and req.scope.attachments:
            file_diffs = await build_file_diffs(client, old_content, new_content, req.timeout_seconds)

        # --- Site-wide link comparison ---------------------------------
        # Every link discovered anywhere on either site, compared by
        # reachability/existence. Powers the report's "Porównanie linków".
        link_diffs: list[LinkDiffEntry] = []
        if both_reachable and req.scope.links:
            link_diffs = await build_link_diffs(client, old_content, new_content, req.timeout_seconds)

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
    "new") of a saved comparison."""
    if side not in ("old", "new"):
        return None
    path = RESULTS_DIR / result_id / "pages" / f"{side}.json"
    if not path.exists():
        return None
    return RawSiteSnapshot.model_validate_json(path.read_text(encoding="utf-8"))


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
