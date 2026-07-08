"""Pydantic models shared across the BIP Compare backend."""
from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, HttpUrl


class CompareScope(BaseModel):
    """Which kinds of detailed per-page comparison to run. Unchecking one
    skips its (potentially expensive, extra-HTTP-request-heavy) checks
    entirely rather than just hiding it in the UI. Screenshot comparison
    isn't implemented yet, so there's no flag for it here."""

    content: bool = Field(True, description="Porównanie treści (tekst + struktura HTML)")
    links: bool = Field(True, description="Porównanie linków (brakujące/dodatkowe/niedziałające)")
    attachments: bool = Field(True, description="Porównanie załączników (brakujące/dodatkowe/zmiana rozmiaru)")


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
    scope: CompareScope = Field(default_factory=CompareScope, description="Jakie szczegóły porównać na dopasowanych podstronach")


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


# --- Per-page detailed diff (content / links / attachments) ---------------
# These power results/{id}/pages/{hash}.json — one file per subpage that
# exists on both sites, generated in addition to the lightweight summary.


class ContentChange(BaseModel):
    """One added/removed/changed chunk of visible text between the two
    versions of a page (from a line-based difflib comparison)."""

    type: str  # "added" | "removed" | "changed"
    old_text: Optional[str] = None
    new_text: Optional[str] = None


class ContentDiff(BaseModel):
    changed: bool
    old_length: int
    new_length: int
    similarity: float = Field(description="difflib ratio 0..1, 1 = identical text")
    old_structure: Dict[str, int] = Field(
        default_factory=dict, description="Liczba wystąpień kluczowych tagów (h1, p, table, img, ...) na starej stronie"
    )
    new_structure: Dict[str, int] = Field(default_factory=dict)
    changes: List[ContentChange] = Field(default_factory=list)
    truncated: bool = Field(False, description="True jeśli lista zmian została obcięta (bardzo różne strony)")


class LinkStatus(BaseModel):
    href: str
    text: str = ""
    status_code: Optional[int] = None
    ok: bool = True


class LinksDiff(BaseModel):
    missing_links: List[str] = Field(default_factory=list, description="Linki obecne na starej stronie, brakujące na nowej")
    extra_links: List[str] = Field(default_factory=list, description="Linki obecne tylko na nowej stronie")
    broken_links_old: List[LinkStatus] = Field(default_factory=list, description="Linki na starej stronie, które nie działają")
    broken_links_new: List[LinkStatus] = Field(default_factory=list, description="Linki na nowej stronie, które nie działają")


class AttachmentInfo(BaseModel):
    href: str
    filename: str
    size_bytes: Optional[int] = None


class AttachmentChange(BaseModel):
    filename: str
    old_size_bytes: Optional[int] = None
    new_size_bytes: Optional[int] = None


class AttachmentsDiff(BaseModel):
    missing_files: List[AttachmentInfo] = Field(default_factory=list)
    extra_files: List[AttachmentInfo] = Field(default_factory=list)
    changed_size: List[AttachmentChange] = Field(default_factory=list)
    order_changed: bool = False


class ScreenshotDiff(BaseModel):
    """Reserved for a future step — visual comparison of rendered pages.
    Left unset (None) on PageDetail until that step is implemented."""

    old_screenshot_path: Optional[str] = None
    new_screenshot_path: Optional[str] = None
    diff_percentage: Optional[float] = None


class PageDetail(BaseModel):
    """Full per-page comparison, saved as its own file under
    results/{id}/pages/{hash}.json. Only built for paths that respond OK
    on both the old and new site (i.e. members of unchanged_paths), and
    only for the diff categories enabled in that run's CompareScope."""

    path: str
    old_url: str
    new_url: str
    content_diff: Optional[ContentDiff] = None
    links_diff: Optional[LinksDiff] = None
    attachments_diff: Optional[AttachmentsDiff] = None
    screenshot_diff: Optional[ScreenshotDiff] = None


class FileEntry(BaseModel):
    """One discovered attachment (downloadable file) as seen on one site."""

    filename: str
    href: str
    status_code: Optional[int] = None
    ok: bool = False
    size_bytes: Optional[int] = None
    content_type: Optional[str] = None
    source_path: str = Field(description="Podstrona, na której plik został po raz pierwszy znaleziony")


class FileDiffEntry(BaseModel):
    """Site-wide comparison of one attachment (file) between the old and new
    version — unlike AttachmentsDiff (which is scoped to a single matched
    page), this covers every file discovered anywhere on either site."""

    key: str
    filename: str
    old: Optional[FileEntry] = None
    new: Optional[FileEntry] = None
    status: str = Field(description="ok | different | error404 | new | removed")


class ComparisonResult(BaseModel):
    id: str
    generated_at: datetime
    duration_ms: float
    old_url: str
    new_url: str
    old_site: SiteReport
    new_site: SiteReport
    both_reachable: bool
    scope: CompareScope = Field(default_factory=CompareScope)
    missing_in_new: List[PageDiffEntry] = Field(default_factory=list)
    extra_in_new: List[PageDiffEntry] = Field(default_factory=list)
    unchanged_paths: List[str] = Field(default_factory=list)
    page_details: Dict[str, str] = Field(
        default_factory=dict,
        description="Mapowanie ścieżki podstrony -> nazwa pliku (bez .json) w results/{id}/pages/, dla podstron z pełnym porównaniem szczegółowym",
    )
    pages_with_content_changes: int = 0
    pages_with_link_issues: int = 0
    pages_with_attachment_issues: int = 0
    file_diffs: List[FileDiffEntry] = Field(
        default_factory=list,
        description="Porównanie WSZYSTKICH plików (załączników) znalezionych na obu witrynach, nie tylko z jednej podstrony",
    )


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
    scope: CompareScope = Field(default_factory=CompareScope)
    pages_with_content_changes: int = 0
    pages_with_link_issues: int = 0
    pages_with_attachment_issues: int = 0
    file_count: int = 0
    file_issue_count: int = 0
