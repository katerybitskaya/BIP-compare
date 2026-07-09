"""Pydantic models shared across the BIP Compare backend."""
from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, HttpUrl


class CompareScope(BaseModel):
    """Which optional, extra-HTTP-request-heavy checks to run. Unchecking one
    skips it entirely rather than just hiding it in the UI. Screenshot
    comparison isn't implemented yet, so there's no flag for it here."""

    content: bool = Field(True, description="Zbieranie/porównanie treści (obecnie: zbieranie surowej treści do dalszej analizy)")
    links: bool = Field(True, description="Porównanie linków (zarezerwowane na kolejny etap)")
    attachments: bool = Field(True, description="Porównanie plików (załączników) w skali całej witryny")


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
    scope: CompareScope = Field(default_factory=CompareScope, description="Które opcjonalne sprawdzenia wykonać")


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


# --- Raw per-page content snapshot -----------------------------------------
# Saved as results/{id}/pages/old.json and results/{id}/pages/new.json — the
# full crawled content of every page on one site (HTML, extracted text,
# structure signature, links, attachments), so a later step can diff any
# given page's old vs. new content without re-crawling anything.


class RawPageEntry(BaseModel):
    url: str
    status_code: Optional[int] = None
    ok: bool
    error: Optional[str] = None
    html: Optional[str] = Field(None, description="Surowy HTML strony (None jeśli strona nie odpowiedziała lub nie jest HTML-em)")
    text: Optional[str] = Field(None, description="Widoczny tekst wyciągnięty ze strony")
    structure: Optional[Dict[str, int]] = Field(None, description="Liczba wystąpień kluczowych tagów (h1, p, table, img, ...)")
    links: Optional[List[Dict[str, str]]] = Field(None, description="Wszystkie linki na stronie: href, text, key")
    attachments: Optional[List[Dict[str, str]]] = Field(None, description="Załączniki (pliki) na stronie: href, filename, key")


class RawSiteSnapshot(BaseModel):
    base_url: str
    reachable: bool
    root_status_code: Optional[int] = None
    root_error: Optional[str] = None
    pages: Dict[str, RawPageEntry] = Field(default_factory=dict)


class ContentDiffLine(BaseModel):
    """One line of a text or HTML diff between old and new page content."""

    kind: str = Field(description="same | del | ins")
    text: str


class StructureDiffRow(BaseModel):
    """Count of one HTML tag (h1, p, table, ...) on the old vs. new page."""

    tag: str
    old: Optional[int] = None
    new: Optional[int] = None
    changed: bool = False


class PageContentDiff(BaseModel):
    """On-demand content comparison for a single page, built from the raw
    old/new snapshots (results/{id}/pages/{old,new}.json) when the user
    opens that page in the report -- not pre-computed for every page up
    front, so a full site crawl stays fast even for large sites."""

    path: str
    status: str = Field(description="same | changed | removed | added")
    old_url: Optional[str] = None
    new_url: Optional[str] = None
    text_diff: List[ContentDiffLine] = Field(default_factory=list)
    structure_diff: List[StructureDiffRow] = Field(default_factory=list)
    html_diff: List[ContentDiffLine] = Field(default_factory=list)


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
    version — every file discovered anywhere on either site, matched by
    normalized path/filename."""

    key: str
    filename: str
    old: Optional[FileEntry] = None
    new: Optional[FileEntry] = None
    status: str = Field(description="ok | different | error404 | new | removed")


class LinkEntry(BaseModel):
    """One discovered link (<a href>, excluding assets/attachments) as seen
    on one site, probed for reachability."""

    href: str
    text: str
    status_code: Optional[int] = None
    ok: bool = False
    source_path: str = Field(description="Podstrona, na której link został po raz pierwszy znaleziony")


class LinkDiffEntry(BaseModel):
    """Site-wide comparison of one link between the old and new version --
    every link discovered anywhere on either site, matched by normalized
    path (same-host) or absolute URL (cross-host)."""

    key: str
    text: str
    old: Optional[LinkEntry] = None
    new: Optional[LinkEntry] = None
    status: str = Field(description="ok | broken | new | removed")


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
    file_diffs: List[FileDiffEntry] = Field(
        default_factory=list,
        description="Porównanie WSZYSTKICH plików (załączników) znalezionych na obu witrynach, nie tylko z jednej podstrony",
    )
    link_diffs: List[LinkDiffEntry] = Field(
        default_factory=list,
        description="Porównanie WSZYSTKICH linków znalezionych na obu witrynach, nie tylko z jednej podstrony",
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
    file_count: int = 0
    file_issue_count: int = 0
    link_count: int = 0
    link_issue_count: int = 0
