"""
FastAPI application — BIP Compare backend (v2).

Endpoints
---------
POST   /api/compare          Crawl both sites, save to JSON, count & return
GET    /api/compare          List saved reports (empty for now)
DELETE /api/compare          Delete all saved reports
"""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .crawler import crawl_site, save_pages_to_json, count_pages_from_json, RESULTS_DIR
from .models import CompareRequestPayload, ComparisonResult, ReportSummary

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="BIP Compare API",
    description="Porównywarka serwisów BIP — backend FastAPI v2",
    version="2.0.0",
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

def _report_file(report_id: str) -> Path:
    return RESULTS_DIR / f"{report_id}_report.json"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/api/compare", response_model=ComparisonResult)
async def run_compare(payload: CompareRequestPayload) -> ComparisonResult:
    """
    Crawl both BIP sites concurrently, save each site's subpages to a
    separate JSON file, count pages from those JSONs, and return the result.
    """
    t0 = time.time()

    # Crawl both sites in parallel (async)
    old_site, new_site = await asyncio.gather(
        crawl_site(
            payload.old_url,
            max_pages=payload.max_pages,
            timeout=payload.timeout_seconds,
        ),
        crawl_site(
            payload.new_url,
            max_pages=payload.max_pages,
            timeout=payload.timeout_seconds,
        ),
    )

    both_reachable = old_site.reachable and new_site.reachable

    report_id = str(uuid.uuid4())

    # Save each site's pages to a JSON file
    old_json_path = save_pages_to_json(old_site, "old", report_id)
    new_json_path = save_pages_to_json(new_site, "new", report_id)

    # Count pages from JSON files (as requested)
    old_count = count_pages_from_json(old_json_path)
    new_count = count_pages_from_json(new_json_path)

    # Overwrite page_count with the JSON-counted value
    old_site.page_count = old_count
    new_site.page_count = new_count

    duration_ms = int((time.time() - t0) * 1000)
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
        scope=payload.scope,
        missing_in_new=[],
        extra_in_new=[],
        unchanged_paths=[],
    )

    # Save the report itself
    with open(_report_file(report_id), "w", encoding="utf-8") as fh:
        fh.write(result.model_dump_json(indent=2))

    return result


@app.get("/api/compare", response_model=List[ReportSummary])
def list_reports() -> List[ReportSummary]:
    """Return summaries of all saved reports, newest first."""
    summaries: List[ReportSummary] = []

    report_files = sorted(
        (p for p in RESULTS_DIR.glob("*_report.json")),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )

    for rp in report_files:
        try:
            with open(rp, encoding="utf-8") as fh:
                data = json.load(fh)
            r = ComparisonResult(**data)
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
                )
            )
        except Exception:  # noqa: BLE001
            continue

    return summaries


@app.delete("/api/compare")
def clear_all_reports() -> dict:
    """Delete all saved reports and JSON crawl files."""
    removed = 0
    for p in RESULTS_DIR.glob("*.json"):
        p.unlink(missing_ok=True)
        removed += 1
    return {"removed": removed}
