"""FastAPI entrypoint for the BIP Compare backend.

Exposes an endpoint that takes two HTTPS addresses (old vs. new version of a
public-institution website), crawls every subpage of each, and returns/saves
a JSON report describing:
  * whether both sites are reachable at all,
  * the full list of discovered subpages per site,
  * which subpages are missing (existed on the old site, gone on the new one),
  * which subpages are "extra"/unneeded (only exist on the new site),
  * which subpages are unchanged between both versions,
  * a site-wide comparison of every downloadable file (attachment) found on
    either site.

The full raw content of every crawled page (HTML, text, links, attachments)
is saved per-site under results/{id}/pages/{old,new}.json and can be fetched
via /api/compare/{id}/raw/{side}. On top of that, /api/compare/{id}/content-diff
computes a readable old-vs-new diff (text, HTML structure, HTML source) for
one page at a time, on demand -- only when the "Zawartość" (content) scope
was enabled for that report.
"""
from __future__ import annotations

from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .comparison import (
    clear_all_results,
    compare_sites,
    delete_result,
    list_result_summaries,
    load_raw_snapshot,
    load_result,
)
from .content_diff import build_page_content_diff
from .models import CompareRequest, ComparisonResult, PageContentDiff, RawSiteSnapshot, ReportSummary

app = FastAPI(
    title="BIP Compare API",
    description="Porównuje starą i nową wersję Biuletynu Informacji Publicznej.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/api/compare", response_model=ComparisonResult)
async def compare(req: CompareRequest) -> ComparisonResult:
    return await compare_sites(req)


@app.get("/api/compare", response_model=List[ReportSummary])
async def get_all_results() -> List[ReportSummary]:
    return list_result_summaries()


@app.delete("/api/compare")
async def delete_all_results() -> dict:
    removed = clear_all_results()
    return {"removed": removed}


@app.get("/api/compare/{result_id}", response_model=ComparisonResult)
async def get_result(result_id: str) -> ComparisonResult:
    result = load_result(result_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono raportu o podanym id.")
    return result


@app.delete("/api/compare/{result_id}")
async def delete_one_result(result_id: str) -> dict:
    deleted = delete_result(result_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Nie znaleziono raportu o podanym id.")
    return {"deleted": True}


@app.get("/api/compare/{result_id}/raw/{side}", response_model=RawSiteSnapshot)
async def get_raw_snapshot(result_id: str, side: str) -> RawSiteSnapshot:
    if side not in ("old", "new"):
        raise HTTPException(status_code=400, detail="Parametr 'side' musi być 'old' albo 'new'.")
    snapshot = load_raw_snapshot(result_id, side)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono surowej treści dla tego raportu.")
    return snapshot


@app.get("/api/compare/{result_id}/content-diff", response_model=PageContentDiff)
async def get_content_diff(result_id: str, path: str) -> PageContentDiff:
    result = load_result(result_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono raportu o podanym id.")
    if not result.scope.content:
        raise HTTPException(
            status_code=400,
            detail=(
                "Zawartość (HTML) nie była porównywana dla tego raportu -- "
                "zakres 'Zawartość' był odznaczony przy uruchamianiu porównania."
            ),
        )
    old_snapshot = load_raw_snapshot(result_id, "old")
    new_snapshot = load_raw_snapshot(result_id, "new")
    if old_snapshot is None or new_snapshot is None:
        raise HTTPException(status_code=404, detail="Brak zapisanej surowej treści dla tego raportu.")
    old_entry = old_snapshot.pages.get(path)
    new_entry = new_snapshot.pages.get(path)
    if old_entry is None and new_entry is None:
        raise HTTPException(status_code=404, detail=f"Nie znaleziono podstrony '{path}' w żadnej z wersji.")
    return build_page_content_diff(old_entry, new_entry, path)
