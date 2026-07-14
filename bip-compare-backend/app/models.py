"""
Pydantic models — mirrors of the TypeScript interfaces in the frontend.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Request payload
# ---------------------------------------------------------------------------

class CompareScope(BaseModel):
    content: bool = True
    links: bool = True
    attachments: bool = True


class CompareRequestPayload(BaseModel):
    old_url: str
    new_url: str
    max_pages: int = 0
    timeout_seconds: int = 30
    scope: Optional[CompareScope] = None


# ---------------------------------------------------------------------------
# Site crawl results
# ---------------------------------------------------------------------------

class PageStatus(BaseModel):
    path: str
    url: str
    status_code: Optional[int] = None
    ok: bool
    error: Optional[str] = None


class SiteReport(BaseModel):
    base_url: str
    reachable: bool
    root_status_code: Optional[int] = None
    root_error: Optional[str] = None
    pages: List[PageStatus] = []
    page_count: int = 0


# ---------------------------------------------------------------------------
# Page diff
# ---------------------------------------------------------------------------

class PageDiffEntry(BaseModel):
    path: str
    reference_url: str
    reference_status_code: Optional[int] = None
    checked_url: str
    checked_status_code: Optional[int] = None
    reason: str


# ---------------------------------------------------------------------------
# Comparison result & report summary
# ---------------------------------------------------------------------------

class ComparisonResult(BaseModel):
    id: str
    generated_at: str
    duration_ms: int
    old_url: str
    new_url: str
    old_site: SiteReport
    new_site: SiteReport
    both_reachable: bool
    scope: Optional[CompareScope] = None
    missing_in_new: List[PageDiffEntry] = []
    extra_in_new: List[PageDiffEntry] = []
    unchanged_paths: List[str] = []


class ReportSummary(BaseModel):
    id: str
    generated_at: str
    duration_ms: int
    old_url: str
    new_url: str
    both_reachable: bool
    old_reachable: bool
    new_reachable: bool
    old_page_count: int
    new_page_count: int
    missing_count: int
    extra_count: int
    unchanged_count: int
    scope: Optional[CompareScope] = None
