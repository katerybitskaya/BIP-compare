"""Pydantic models shared across the BIP Compare backend."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, HttpUrl


class CompareRequest(BaseModel):
    old_url: HttpUrl = Field(..., description="Adres bazowy starej wersji BIP")
    new_url: HttpUrl = Field(..., description="Adres bazowy nowej wersji BIP")
    max_pages: Optional[int] = Field(
        None,
        ge=1,
        le=20000,
        description=(
            "Maksymalna liczba podstron do odwiedzenia na jedną stronę. "
            "Nie podawaj, aby przeszukać całą witrynę bez limitu "
            "(wewnętrznie i tak obowiązuje zabezpieczenie na wypadek stron "
            "generujących nieskończoną liczbę adresów)."
        ),
    )
    timeout_seconds: float = Field(10.0, ge=1.0, le=60.0, description="Limit czasu pojedynczego żądania HTTP")


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
    pages: List[PageStatus] = Field(default_factory=list)
    page_count: int = 0


class PageDiffEntry(BaseModel):
    path: str
    reference_url: str
    reference_status_code: Optional[int] = None
    checked_url: str
    checked_status_code: Optional[int] = None
    reason: str


class ComparisonResult(BaseModel):
    id: str
    generated_at: datetime
    duration_ms: float
    old_url: str
    new_url: str
    old_site: SiteReport
    new_site: SiteReport
    both_reachable: bool
    missing_in_new: List[PageDiffEntry] = Field(default_factory=list)
    extra_in_new: List[PageDiffEntry] = Field(default_factory=list)
    unchanged_paths: List[str] = Field(default_factory=list)


class ReportSummary(BaseModel):
    """Lightweight view of a saved ComparisonResult, used for report cards
    in the frontend without having to fetch every full report."""

    id: str
    generated_at: datetime
    duration_ms: float
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
