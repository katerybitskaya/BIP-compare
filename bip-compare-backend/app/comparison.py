"""Orchestrates crawling both sites and computing the diff between them.

Each comparison run writes its results under ``results/{id}/``:

  results/{id}/summary.json        -- page list, missing/extra/unchanged (as before)
  results/{id}/pages/{hash}.json   -- one file per matched page, with the
                                       detailed content/links/attachments diff

Splitting it this way keeps summary.json small and fast to load for the
report list / overview, while the (potentially much larger) per-page detail
is only read when a user actually opens that page's diff.
"""
from __future__ import annotations

import asyncio
import hashlib
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

import httpx

from .crawler import PageContent, crawl_site, probe_path
from .diffing import (
    diff_attachments,
    diff_content,
    diff_links,
    has_attachment_issues,
    has_content_diff,
    has_link_issues,
)
from .models import (
    CompareRequest,
    CompareScope,
    ComparisonResult,
    FileDiffEntry,
    FileEntry,
    PageDetail,
    PageDiffEntry,
    ReportSummary,
)

RESULTS_DIR = Path(__file__).resolve().parent.parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)

DEFAULT_HEADERS = {
    "User-Agent": "BipCompareBot/1.0 (+https://github.com/; strona porownawcza BIP)",
}

# Bounds how many requests are ever in flight at once (across crawling both
# sites and the later diff-probing/detail step), regardless of how many pages
# a site turns out to have — keeps large sites from opening hundreds of
# simultaneous connections.
CLIENT_LIMITS = httpx.Limits(max_connections=20, max_keepalive_connections=10)

# Caps how many matched pages get the expensive detailed diff (content +
# every link's HTTP status + every attachment's size). Without a cap, a site
# with thousands of unchanged pages would multiply the request count by
# (links-per-page + attachments-per-page) on top of the original crawl. This
# is a safety valve for pathologically large sites, not a normal limit.
MAX_DETAILED_PAGES = 500

# Caps how many unique files (attachments) get probed for the site-wide file
# comparison (Dashboard's "Wyniki - pliki" list), across the whole site.
MAX_FILES = 1000


def _path_hash(path: str) -> str:
    """Stable, filesystem-safe filename for a page path."""
    return hashlib.sha1(path.encode("utf-8")).hexdigest()[:16]


async def _build_page_detail(
    client: httpx.AsyncClient,
    path: str,
    old_content: Dict[str, PageContent],
    new_content: Dict[str, PageContent],
    old_url_by_path: Dict[str, str],
    new_url_by_path: Dict[str, str],
    timeout_seconds: float,
    scope: CompareScope,
    link_status_cache: Dict[str, Optional[int]],
    attachment_size_cache: Dict[str, Optional[int]],
) -> Optional[PageDetail]:
    old_page = old_content.get(path)
    new_page = new_content.get(path)
    if old_page is None or new_page is None:
        return None  # not fetched as HTML on one side (or fetch failed) — nothing to diff in detail

    content_diff = None
    if scope.content:
        content_diff = diff_content(old_page.text, new_page.text, old_page.structure, new_page.structure)

    links_diff = None
    attachments_diff = None
    coros = []
    if scope.links:
        coros.append(diff_links(client, old_page.links, new_page.links, timeout_seconds, link_status_cache))
    if scope.attachments:
        coros.append(diff_attachments(client, old_page.attachments, new_page.attachments, timeout_seconds, attachment_size_cache))
    if coros:
        results = await asyncio.gather(*coros)
        idx = 0
        if scope.links:
            links_diff = results[idx]
            idx += 1
        if scope.attachments:
            attachments_diff = results[idx]

    if content_diff is None and links_diff is None and attachments_diff is None:
        return None  # nothing was in scope for this run — no detail to save

    return PageDetail(
        path=path,
        old_url=old_url_by_path[path],
        new_url=new_url_by_path[path],
        content_diff=content_diff,
        links_diff=links_diff,
        attachments_diff=attachments_diff,
        screenshot_diff=None,  # reserved for a future step (visual/screenshot comparison)
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
    if href in cache:
        return cache[href]
    result = {"status_code": None, "ok": False, "size_bytes": None, "content_type": None}
    try:
        resp = await client.head(href, timeout=timeout_seconds, follow_redirects=True)
        if resp.status_code >= 400 or resp.status_code == 405:
            # Some servers don't implement HEAD (or block it) — fall back to GET.
            resp = await client.get(href, timeout=timeout_seconds, follow_redirects=True)
        result["status_code"] = resp.status_code
        result["ok"] = resp.status_code < 400
        content_length = resp.headers.get("content-length")
        if content_length is not None:
            try:
                result["size_bytes"] = int(content_length)
            except ValueError:
                pass
        result["content_type"] = resp.headers.get("content-type")
    except httpx.HTTPError:
        pass
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
    it. This is what powers the Dashboard's flat "Wyniki - pliki" table,
    as distinct from AttachmentsDiff (which is scoped to one matched page).
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


async def compare_sites(req: CompareRequest) -> ComparisonResult:
    started = time.perf_counter()
    result_id = str(uuid.uuid4())

    async with httpx.AsyncClient(headers=DEFAULT_HEADERS, limits=CLIENT_LIMITS) as client:
        (old_report, old_content), (new_report, new_content) = await asyncio.gather(
            crawl_site(client, str(req.old_url), req.max_pages, req.timeout_seconds),
            crawl_site(client, str(req.new_url), req.max_pages, req.timeout_seconds),
        )

        both_reachable = old_report.reachable and new_report.reachable

        old_paths = {p.path for p in old_report.pages if p.ok}
        new_paths = {p.path for p in new_report.pages if p.ok}

        old_status_by_path = {p.path: p for p in old_report.pages}
        new_status_by_path = {p.path: p for p in new_report.pages}

        candidate_missing = sorted(old_paths - new_paths)
        candidate_extra = sorted(new_paths - old_paths)
        unchanged = sorted(old_paths & new_paths)

        missing_in_new: list[PageDiffEntry] = []
        extra_in_new: list[PageDiffEntry] = []

        if both_reachable:
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

        # --- Detailed per-page diff: content / links / attachments --------
        page_details: Dict[str, str] = {}
        pages_with_content_changes = 0
        pages_with_link_issues = 0
        pages_with_attachment_issues = 0

        scope_active = req.scope.content or req.scope.links or req.scope.attachments
        if both_reachable and unchanged and scope_active:
            detail_paths = unchanged[:MAX_DETAILED_PAGES]
            old_url_by_path = {p: old_status_by_path[p].url for p in detail_paths}
            new_url_by_path = {p: new_status_by_path[p].url for p in detail_paths}
            link_status_cache: Dict[str, Optional[int]] = {}
            attachment_size_cache: Dict[str, Optional[int]] = {}

            details = await asyncio.gather(
                *[
                    _build_page_detail(
                        client, path, old_content, new_content,
                        old_url_by_path, new_url_by_path,
                        req.timeout_seconds, req.scope, link_status_cache, attachment_size_cache,
                    )
                    for path in detail_paths
                ]
            )

            pages_dir = RESULTS_DIR / result_id / "pages"
            pages_dir.mkdir(parents=True, exist_ok=True)
            for path, detail in zip(detail_paths, details):
                if detail is None:
                    continue
                if has_content_diff(detail.content_diff):
                    pages_with_content_changes += 1
                if has_link_issues(detail.links_diff):
                    pages_with_link_issues += 1
                if has_attachment_issues(detail.attachments_diff):
                    pages_with_attachment_issues += 1

                file_stem = _path_hash(path)
                (pages_dir / f"{file_stem}.json").write_text(detail.model_dump_json(indent=2), encoding="utf-8")
                page_details[path] = file_stem

        # --- Site-wide file (attachment) comparison ------------------------
        # Independent of per-page detail: every file discovered anywhere on
        # either site, compared by name/size/reachability. Powers the
        # Dashboard's flat file list.
        file_diffs: list[FileDiffEntry] = []
        if both_reachable and req.scope.attachments:
            file_diffs = await build_file_diffs(client, old_content, new_content, req.timeout_seconds)

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
        page_details=page_details,
        pages_with_content_changes=pages_with_content_changes,
        pages_with_link_issues=pages_with_link_issues,
        pages_with_attachment_issues=pages_with_attachment_issues,
        file_diffs=file_diffs,
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
        pages_with_content_changes=result.pages_with_content_changes,
        pages_with_link_issues=result.pages_with_link_issues,
        pages_with_attachment_issues=result.pages_with_attachment_issues,
        file_count=len(result.file_diffs),
        file_issue_count=sum(1 for f in result.file_diffs if f.status != "ok"),
    )


def load_result(result_id: str) -> ComparisonResult | None:
    path = RESULTS_DIR / result_id / "summary.json"
    if not path.exists():
        return None
    return ComparisonResult.model_validate_json(path.read_text(encoding="utf-8"))


def load_page_detail(result_id: str, path: str) -> PageDetail | None:
    """Loads one page's detailed diff, looked up by its original site path
    (e.g. "/o-nas") via the summary's ``page_details`` hash mapping."""
    result = load_result(result_id)
    if result is None:
        return None
    file_stem = result.page_details.get(path)
    if file_stem is None:
        return None
    detail_path = RESULTS_DIR / result_id / "pages" / f"{file_stem}.json"
    if not detail_path.exists():
        return None
    return PageDetail.model_validate_json(detail_path.read_text(encoding="utf-8"))


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
