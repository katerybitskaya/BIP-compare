"""Orchestrates crawling both sites and computing the diff between them."""
from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx

from .crawler import crawl_site, probe_path
from .models import CompareRequest, ComparisonResult, PageDiffEntry, ReportSummary

RESULTS_DIR = Path(__file__).resolve().parent.parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)

DEFAULT_HEADERS = {
    "User-Agent": "BipCompareBot/1.0 (+https://github.com/; strona porownawcza BIP)",
}

# Bounds how many requests are ever in flight at once (across crawling both
# sites and the later diff-probing step), regardless of how many pages a
# site turns out to have — keeps large sites from opening hundreds of
# simultaneous connections.
CLIENT_LIMITS = httpx.Limits(max_connections=20, max_keepalive_connections=10)


async def compare_sites(req: CompareRequest) -> ComparisonResult:
    started = time.perf_counter()

    async with httpx.AsyncClient(headers=DEFAULT_HEADERS, limits=CLIENT_LIMITS) as client:
        old_report, new_report = await asyncio.gather(
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

    duration_ms = (time.perf_counter() - started) * 1000

    result = ComparisonResult(
        id=str(uuid.uuid4()),
        generated_at=datetime.now(timezone.utc),
        duration_ms=round(duration_ms, 1),
        old_url=str(req.old_url),
        new_url=str(req.new_url),
        old_site=old_report,
        new_site=new_report,
        both_reachable=both_reachable,
        missing_in_new=missing_in_new,
        extra_in_new=extra_in_new,
        unchanged_paths=unchanged,
    )

    _save_result(result)
    return result


def _save_result(result: ComparisonResult) -> None:
    out_path = RESULTS_DIR / f"{result.id}.json"
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
    )


def load_result(result_id: str) -> ComparisonResult | None:
    path = RESULTS_DIR / f"{result_id}.json"
    if not path.exists():
        return None
    return ComparisonResult.model_validate_json(path.read_text(encoding="utf-8"))


def list_result_summaries() -> list[ReportSummary]:
    summaries: list[ReportSummary] = []
    for path in RESULTS_DIR.glob("*.json"):
        try:
            result = ComparisonResult.model_validate_json(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        summaries.append(_to_summary(result))
    summaries.sort(key=lambda s: s.generated_at, reverse=True)
    return summaries
