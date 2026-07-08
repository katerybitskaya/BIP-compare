"""FastAPI entrypoint for the BIP Compare backend.

Exposes an endpoint that takes two HTTPS addresses (old vs. new version of a
public-institution website), crawls every subpage of each, and returns/saves
a JSON report describing:
  * whether both sites are reachable at all,
  * the full list of discovered subpages per site,
  * which subpages are missing (existed on the old site, gone on the new one),
  * which subpages are "extra"/unneeded (only exist on the new site),
  * which subpages are unchanged between both versions,
  * for each unchanged (matched) subpage, a detailed diff of its content
    (text/structure), links, and attachments — fetched separately per page.
"""
from __future__ import annotations

from typing import List

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .comparison import compare_sites, list_result_summaries, load_page_detail, load_result
from .models import CompareRequest, ComparisonResult, PageDetail, ReportSummary

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


@app.get("/api/compare/{result_id}", response_model=ComparisonResult)
async def get_result(result_id: str) -> ComparisonResult:
    result = load_result(result_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono raportu o podanym id.")
    return result


@app.get("/api/compare/{result_id}/pages", response_model=PageDetail)
async def get_page_detail(
    result_id: str,
    path: str = Query(..., description="Ścieżka podstrony, np. /o-nas"),
) -> PageDetail:
    detail = load_page_detail(result_id, path)
    if detail is None:
        raise HTTPException(
            status_code=404,
            detail="Brak szczegółowego porównania dla tej podstrony (albo raport nie istnieje, albo ta ścieżka nie ma wygenerowanych szczegółów).",
        )
    return detail
