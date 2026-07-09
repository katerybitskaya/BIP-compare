"""
FastAPI application — BIP Compare backend.

Endpoints
---------
POST   /api/compare                          Run a new comparison
GET    /api/compare                          List all saved reports
DELETE /api/compare                          Delete all saved reports
GET    /api/compare/{id}                     Get a full report
GET    /api/compare/{id}/raw/{old|new}       Get raw page snapshot for one side
GET    /api/compare/{id}/content-diff        Get on-demand content diff for a path
"""
from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .comparator import (
    compare_files,
    compare_links,
    compare_pages,
    compute_content_diff,
    count_content_changes,
)
from .crawler import build_raw_snapshot, crawl_site
from .models import (
    CompareRequestPayload,
    ComparisonResult,
    PageContentDiff,
    RawPageEntry,
    RawSiteSnapshot,
    ReportSummary,
)

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="BIP Compare API",
    description="Porównywarka serwisów BIP — backend FastAPI",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Storage helpers
# ---------------------------------------------------------------------------

RESULTS_DIR = Path(__file__).parent.parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)


def _report_file(report_id: str) -> Path:
    return RESULTS_DIR / f"{report_id}.json"


def _raw_file(report_id: str, side: str) -> Path:
    return RESULTS_DIR / f"{report_id}_raw_{side}.json"


def _load_report(report_id: str) -> ComparisonResult:
    path = _report_file(report_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Raport '{report_id}' nie istnieje.")
    with open(path, encoding="utf-8") as fh:
        return ComparisonResult(**json.load(fh))


def _save_json(path: Path, data: str) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(data)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/api/compare", response_model=ComparisonResult)
def run_compare(payload: CompareRequestPayload) -> ComparisonResult:
    """
    Crawl both BIP sites and produce a full comparison report.
    The report is saved to disk and returned immediately.
    """
    scope = payload.scope
    collect_raw = scope is None or (scope.content or scope.links or scope.attachments)

    t0 = time.time()

    # --- Crawl both sites ---
    old_site, old_raw = crawl_site(
        payload.old_url,
        max_pages=payload.max_pages,
        timeout=payload.timeout_seconds,
        collect_raw=collect_raw,
    )
    new_site, new_raw = crawl_site(
        payload.new_url,
        max_pages=payload.max_pages,
        timeout=payload.timeout_seconds,
        collect_raw=collect_raw,
    )

    both_reachable = old_site.reachable and new_site.reachable

    missing_in_new = []
    extra_in_new = []
    unchanged_paths: List[str] = []
    link_diffs = None
    file_diffs = None
    content_checked_count: Optional[int] = None
    content_changed_count: Optional[int] = None

    if both_reachable:
        missing_in_new, extra_in_new, unchanged_paths = compare_pages(
            old_site.pages, new_site.pages, payload.old_url, payload.new_url
        )

        if scope is None or scope.links:
            if old_raw and new_raw:
                link_diffs = compare_links(old_raw, new_raw)

        if scope is None or scope.attachments:
            if old_raw and new_raw:
                file_diffs = compare_files(old_raw, new_raw, timeout=payload.timeout_seconds)

        if scope is None or scope.content:
            if old_raw and new_raw:
                content_checked_count, content_changed_count = count_content_changes(
                    unchanged_paths, old_raw, new_raw
                )

    duration_ms = int((time.time() - t0) * 1000)
    report_id = str(uuid.uuid4())
    generated_at = datetime.now(timezone.utc).isoformat()

    result = ComparisonResult(
        id=report_id,
        generated_at=generated_at,
        duration_ms=duration_ms,
        old_url=payload.old_url,
        new_url=payload.new_url,
        old_site=old_site,
        new_site=new_site,
        both_reachable=both_reachable,
        scope=scope,
        missing_in_new=missing_in_new,
        extra_in_new=extra_in_new,
        unchanged_paths=unchanged_paths,
        file_diffs=file_diffs,
        link_diffs=link_diffs,
        content_checked_count=content_checked_count,
        content_changed_count=content_changed_count,
    )

    # Save main report
    _save_json(_report_file(report_id), result.model_dump_json(indent=2))

    # Save raw snapshots (needed for on-demand content diff)
    if old_raw is not None:
        snap = build_raw_snapshot(old_site, old_raw)
        _save_json(_raw_file(report_id, "old"), snap.model_dump_json(indent=2))
    if new_raw is not None:
        snap = build_raw_snapshot(new_site, new_raw)
        _save_json(_raw_file(report_id, "new"), snap.model_dump_json(indent=2))

    return result


@app.get("/api/compare", response_model=List[ReportSummary])
def list_reports() -> List[ReportSummary]:
    """Return summaries of all saved reports, newest first."""
    summaries: List[ReportSummary] = []

    report_files = sorted(
        (p for p in RESULTS_DIR.glob("*.json") if "_raw_" not in p.name),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )

    for rp in report_files:
        try:
            with open(rp, encoding="utf-8") as fh:
                data = json.load(fh)
            r = ComparisonResult(**data)
            fd = r.file_diffs or []
            ld = r.link_diffs or []
            summaries.append(
                ReportSummary(
                    id=r.id,
                    generated_at=r.generated_at,
                    duration_ms=r.duration_ms,
                    old_url=r.old_url,
                    new_url=r.new_url,
                    both_reachable=r.both_reachable,
                    old_reachable=r.old_site.reachable,
                    new_reachable=r.new_site.reachable,
                    old_page_count=r.old_site.page_count,
                    new_page_count=r.new_site.page_count,
                    missing_count=len(r.missing_in_new),
                    extra_count=len(r.extra_in_new),
                    unchanged_count=len(r.unchanged_paths),
                    scope=r.scope,
                    file_count=len(fd),
                    file_issue_count=sum(1 for f in fd if f.status != "ok"),
                    link_count=len(ld),
                    link_issue_count=sum(1 for lk in ld if lk.status != "ok"),
                    content_checked_count=r.content_checked_count,
                    content_changed_count=r.content_changed_count,
                )
            )
        except Exception:  # noqa: BLE001
            continue  # Skip corrupted files silently

    return summaries


@app.get("/api/compare/{report_id}", response_model=ComparisonResult)
def get_report(report_id: str) -> ComparisonResult:
    """Return the full comparison result for a saved report."""
    return _load_report(report_id)


@app.get("/api/compare/{report_id}/raw/{side}", response_model=RawSiteSnapshot)
def get_raw_snapshot(report_id: str, side: str) -> RawSiteSnapshot:
    """Return the raw per-page snapshot for one side of a comparison."""
    if side not in ("old", "new"):
        raise HTTPException(status_code=400, detail="side musi być 'old' lub 'new'.")
    rp = _raw_file(report_id, side)
    if not rp.exists():
        raise HTTPException(status_code=404, detail="Raw snapshot nie istnieje dla tego raportu.")
    with open(rp, encoding="utf-8") as fh:
        return RawSiteSnapshot(**json.load(fh))


@app.get("/api/compare/{report_id}/content-diff", response_model=PageContentDiff)
def get_content_diff(
    report_id: str,
    path: str = Query(..., description="Ścieżka podstrony, np. /aktualnosci"),
) -> PageContentDiff:
    """
    Compute an on-demand content diff for a single page path within a report.
    Only available when the report was run with scope.content = true.
    """
    report = _load_report(report_id)

    if report.scope is not None and not report.scope.content:
        raise HTTPException(
            status_code=400,
            detail="Porównanie zawartości nie było włączone dla tego raportu.",
        )

    old_rp = _raw_file(report_id, "old")
    new_rp = _raw_file(report_id, "new")

    if not old_rp.exists() or not new_rp.exists():
        raise HTTPException(status_code=404, detail="Raw snapshots nie istnieją dla tego raportu.")

    with open(old_rp, encoding="utf-8") as fh:
        old_snap: Dict = json.load(fh)
    with open(new_rp, encoding="utf-8") as fh:
        new_snap: Dict = json.load(fh)

    old_pages: Dict[str, dict] = old_snap.get("pages", {})
    new_pages: Dict[str, dict] = new_snap.get("pages", {})

    old_data = old_pages.get(path)
    new_data = new_pages.get(path)

    if not old_data and not new_data:
        raise HTTPException(status_code=404, detail=f"Ścieżka '{path}' nie istnieje w żadnym snapshoci.")

    if not old_data:
        assert new_data is not None  # guaranteed by the check above
        np = RawPageEntry(**new_data)
        return PageContentDiff(
            path=path,
            status="added",
            old_url=None,
            new_url=np.url,
            text_diff=[],
            structure_diff=[],
            html_diff=[],
        )

    if not new_data:
        assert old_data is not None  # guaranteed by the check above
        op = RawPageEntry(**old_data)
        return PageContentDiff(
            path=path,
            status="removed",
            old_url=op.url,
            new_url=None,
            text_diff=[],
            structure_diff=[],
            html_diff=[],
        )

    assert old_data is not None and new_data is not None
    return compute_content_diff(path, RawPageEntry(**old_data), RawPageEntry(**new_data))


@app.delete("/api/compare")
def clear_all_reports() -> dict:
    """Delete all saved reports and raw snapshots."""
    removed = 0
    for p in RESULTS_DIR.glob("*.json"):
        p.unlink(missing_ok=True)
        removed += 1
    return {"removed": removed}
