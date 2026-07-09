"""
Comparator — compares two crawled BIP sites.

Provides:
  - compare_pages()  : find missing / extra / unchanged paths
  - compare_links()  : diff all discovered links
  - compare_files()  : diff all discovered attachments (HEAD requests)
  - compute_content_diff() : line-level text/HTML diff for one page pair
"""
from __future__ import annotations

import difflib
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin

import requests

from .models import (
    CompareScope,
    ContentDiffLine,
    FileDiffEntry,
    FileEntry,
    LinkDiffEntry,
    LinkEntry,
    PageContentDiff,
    PageDiffEntry,
    PageStatus,
    RawPageEntry,
    StructureDiffRow,
)

_SESSION_HEADERS = {
    "User-Agent": "BIP-Compare/1.0 (automated site comparison tool)",
}


# ---------------------------------------------------------------------------
# Page-level comparison
# ---------------------------------------------------------------------------

def compare_pages(
    old_pages: List[PageStatus],
    new_pages: List[PageStatus],
    old_base_url: str,
    new_base_url: str,
) -> Tuple[List[PageDiffEntry], List[PageDiffEntry], List[str]]:
    """
    Compare two lists of crawled pages.

    Returns
    -------
    (missing_in_new, extra_in_new, unchanged_paths)
    """
    old_by_path: Dict[str, PageStatus] = {p.path: p for p in old_pages}
    new_by_path: Dict[str, PageStatus] = {p.path: p for p in new_pages}
    old_paths = set(old_by_path)
    new_paths = set(new_by_path)

    missing_in_new: List[PageDiffEntry] = []
    for path in sorted(old_paths - new_paths):
        op = old_by_path[path]
        missing_in_new.append(
            PageDiffEntry(
                path=path,
                reference_url=op.url,
                reference_status_code=op.status_code,
                checked_url=urljoin(new_base_url, path),
                checked_status_code=None,
                reason="Brak na nowym adresie",
            )
        )

    extra_in_new: List[PageDiffEntry] = []
    for path in sorted(new_paths - old_paths):
        np = new_by_path[path]
        extra_in_new.append(
            PageDiffEntry(
                path=path,
                reference_url=urljoin(old_base_url, path),
                reference_status_code=None,
                checked_url=np.url,
                checked_status_code=np.status_code,
                reason="Tylko na nowym adresie",
            )
        )

    unchanged_paths = sorted(old_paths & new_paths)
    return missing_in_new, extra_in_new, unchanged_paths


# ---------------------------------------------------------------------------
# Link comparison
# ---------------------------------------------------------------------------

def compare_links(
    old_raw: Dict[str, RawPageEntry],
    new_raw: Dict[str, RawPageEntry],
) -> List[LinkDiffEntry]:
    """Diff all links collected from both sites."""

    old_links: Dict[str, LinkEntry] = {}
    new_links: Dict[str, LinkEntry] = {}

    def _collect(raw: Dict[str, RawPageEntry], store: Dict[str, LinkEntry]) -> None:
        for path, page in raw.items():
            if not page.links:
                continue
            for lnk in page.links:
                key = lnk.get("key", "")
                if key and key not in store:
                    store[key] = LinkEntry(
                        href=lnk.get("href", ""),
                        text=lnk.get("text", ""),
                        status_code=None,
                        ok=True,
                        source_path=path,
                    )

    _collect(old_raw, old_links)
    _collect(new_raw, new_links)

    all_keys = sorted(set(old_links) | set(new_links))
    diffs: List[LinkDiffEntry] = []
    for key in all_keys:
        old = old_links.get(key)
        new = new_links.get(key)
        if old and new:
            status = "ok"
        elif old:
            status = "removed"
        else:
            status = "new"
        entry = old or new
        diffs.append(
            LinkDiffEntry(key=key, text=entry.text if entry else "", old=old, new=new, status=status)
        )
    return diffs


# ---------------------------------------------------------------------------
# File / attachment comparison
# ---------------------------------------------------------------------------

def compare_files(
    old_raw: Dict[str, RawPageEntry],
    new_raw: Dict[str, RawPageEntry],
    timeout: int = 10,
) -> List[FileDiffEntry]:
    """Diff all attachments collected from both sites (uses HEAD requests)."""
    session = requests.Session()
    session.headers.update(_SESSION_HEADERS)

    old_files: Dict[str, FileEntry] = {}
    new_files: Dict[str, FileEntry] = {}

    def _check_file(href: str) -> Tuple[Optional[int], bool, Optional[int], Optional[str]]:
        """Return (status_code, ok, size_bytes, content_type)."""
        try:
            resp = session.head(href, timeout=timeout, allow_redirects=True)
            sc = resp.status_code
            ok = resp.ok
            raw_len = resp.headers.get("content-length")
            size = int(raw_len) if raw_len and raw_len.isdigit() else None
            ct = resp.headers.get("content-type")
            return sc, ok, size, ct
        except Exception:  # noqa: BLE001
            return None, False, None, None

    def _collect(raw: Dict[str, RawPageEntry], store: Dict[str, FileEntry]) -> None:
        for path, page in raw.items():
            if not page.attachments:
                continue
            for att in page.attachments:
                key = att.get("key", "")
                if key and key not in store:
                    href = att.get("href", "")
                    filename = att.get("filename", "")
                    sc, ok, size, ct = _check_file(href)
                    store[key] = FileEntry(
                        filename=filename,
                        href=href,
                        status_code=sc,
                        ok=ok,
                        size_bytes=size,
                        content_type=ct,
                        source_path=path,
                    )

    _collect(old_raw, old_files)
    _collect(new_raw, new_files)

    all_keys = sorted(set(old_files) | set(new_files))
    diffs: List[FileDiffEntry] = []
    for key in all_keys:
        old = old_files.get(key)
        new = new_files.get(key)
        if old and new:
            if not old.ok or not new.ok:
                status = "error404"
            elif (
                old.size_bytes is not None
                and new.size_bytes is not None
                and old.size_bytes != new.size_bytes
            ):
                status = "different"
            else:
                status = "ok"
        elif old:
            status = "removed"
        else:
            status = "new"
        entry = old or new
        diffs.append(
            FileDiffEntry(
                key=key,
                filename=entry.filename if entry else "",
                old=old,
                new=new,
                status=status,
            )
        )
    return diffs


# ---------------------------------------------------------------------------
# Content diff (on-demand, per page)
# ---------------------------------------------------------------------------

def _build_diff_lines(
    old_lines: List[str], new_lines: List[str]
) -> List[ContentDiffLine]:
    result: List[ContentDiffLine] = []
    matcher = difflib.SequenceMatcher(None, old_lines, new_lines, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for line in old_lines[i1:i2]:
                result.append(ContentDiffLine(kind="same", text=line))
        elif tag == "delete":
            for line in old_lines[i1:i2]:
                result.append(ContentDiffLine(kind="del", text=line))
        elif tag == "insert":
            for line in new_lines[j1:j2]:
                result.append(ContentDiffLine(kind="ins", text=line))
        elif tag == "replace":
            for line in old_lines[i1:i2]:
                result.append(ContentDiffLine(kind="del", text=line))
            for line in new_lines[j1:j2]:
                result.append(ContentDiffLine(kind="ins", text=line))
    return result


def compute_content_diff(
    path: str,
    old_page: RawPageEntry,
    new_page: RawPageEntry,
) -> PageContentDiff:
    """Compute line-level text diff and HTML structure diff between two pages."""

    old_text_lines = (old_page.text or "").splitlines()
    new_text_lines = (new_page.text or "").splitlines()
    text_diff = _build_diff_lines(old_text_lines, new_text_lines)

    old_html_lines = (old_page.html or "").splitlines()
    new_html_lines = (new_page.html or "").splitlines()
    html_diff = _build_diff_lines(old_html_lines, new_html_lines)

    old_struct = old_page.structure or {}
    new_struct = new_page.structure or {}
    all_tags = sorted(set(old_struct) | set(new_struct))
    structure_diff: List[StructureDiffRow] = [
        StructureDiffRow(
            tag=tag,
            old=old_struct.get(tag),
            new=new_struct.get(tag),
            changed=old_struct.get(tag) != new_struct.get(tag),
        )
        for tag in all_tags
    ]

    changed = old_text_lines != new_text_lines
    return PageContentDiff(
        path=path,
        status="changed" if changed else "same",
        old_url=old_page.url,
        new_url=new_page.url,
        text_diff=text_diff,
        structure_diff=structure_diff,
        html_diff=html_diff,
    )


# ---------------------------------------------------------------------------
# Content summary (count checked / changed pages)
# ---------------------------------------------------------------------------

def count_content_changes(
    unchanged_paths: List[str],
    old_raw: Dict[str, RawPageEntry],
    new_raw: Dict[str, RawPageEntry],
) -> Tuple[int, int]:
    """Return (checked_count, changed_count) for the common pages."""
    checked = 0
    changed = 0
    for path in unchanged_paths:
        op = old_raw.get(path)
        np = new_raw.get(path)
        if op and np:
            checked += 1
            if (op.text or "") != (np.text or ""):
                changed += 1
    return checked, changed
