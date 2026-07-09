"""
Pydantic models — mirrors of the TypeScript interfaces in src/api/types.ts.
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
# Raw per-page content snapshot
# ---------------------------------------------------------------------------

class RawPageEntry(BaseModel):
    url: str
    status_code: Optional[int] = None
    ok: bool
    error: Optional[str] = None
    html: Optional[str] = None
    text: Optional[str] = None
    structure: Optional[Dict[str, int]] = None
    links: Optional[List[Dict[str, str]]] = None
    attachments: Optional[List[Dict[str, str]]] = None


class RawSiteSnapshot(BaseModel):
    base_url: str
    reachable: bool
    root_status_code: Optional[int] = None
    root_error: Optional[str] = None
    pages: Dict[str, RawPageEntry] = {}


# ---------------------------------------------------------------------------
# File comparison
# ---------------------------------------------------------------------------

class FileEntry(BaseModel):
    filename: str
    href: str
    status_code: Optional[int] = None
    ok: bool
    size_bytes: Optional[int] = None
    content_type: Optional[str] = None
    source_path: str


class FileDiffEntry(BaseModel):
    key: str
    filename: str
    old: Optional[FileEntry] = None
    new: Optional[FileEntry] = None
    status: str  # "ok" | "different" | "error404" | "new" | "removed"


# ---------------------------------------------------------------------------
# Link comparison
# ---------------------------------------------------------------------------

class LinkEntry(BaseModel):
    href: str
    text: str
    status_code: Optional[int] = None
    ok: bool
    source_path: str


class LinkDiffEntry(BaseModel):
    key: str
    text: str
    old: Optional[LinkEntry] = None
    new: Optional[LinkEntry] = None
    status: str  # "ok" | "broken" | "new" | "removed"


# ---------------------------------------------------------------------------
# Content diff (on-demand)
# ---------------------------------------------------------------------------

class ContentDiffLine(BaseModel):
    kind: str  # "same" | "del" | "ins"
    text: str


class StructureDiffRow(BaseModel):
    tag: str
    old: Optional[int] = None
    new: Optional[int] = None
    changed: bool


class PageContentDiff(BaseModel):
    path: str
    status: str  # "same" | "changed" | "removed" | "added"
    old_url: Optional[str] = None
    new_url: Optional[str] = None
    text_diff: List[ContentDiffLine] = []
    structure_diff: List[StructureDiffRow] = []
    html_diff: List[ContentDiffLine] = []


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
    file_diffs: Optional[List[FileDiffEntry]] = None
    link_diffs: Optional[List[LinkDiffEntry]] = None
    content_checked_count: Optional[int] = None
    content_changed_count: Optional[int] = None


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
    file_count: Optional[int] = None
    file_issue_count: Optional[int] = None
    link_count: Optional[int] = None
    link_issue_count: Optional[int] = None
    content_checked_count: Optional[int] = None
    content_changed_count: Optional[int] = None
