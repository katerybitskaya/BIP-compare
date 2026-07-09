"""Builds a readable diff between the old and new content of one page.

Uses the raw HTML/text snapshots already captured by the crawler
(results/{id}/pages/old.json and new.json) -- no re-crawling needed. The
diff is computed on demand, for one page at a time, when the user opens
it in the report. That keeps a full site crawl fast even for sites with
thousands of pages: the cost of diffing is only paid for the page the
user actually looks at, instead of pre-computing it for every page up
front.
"""
from __future__ import annotations

import difflib
from typing import List, Optional

from .crawler import STRUCTURE_TAGS
from .models import ContentDiffLine, PageContentDiff, RawPageEntry, StructureDiffRow


def _split_text(text: Optional[str]) -> List[str]:
    if not text:
        return []
    return text.split("\n")


def _split_html(html: Optional[str]) -> List[str]:
    if not html:
        return []
    return html.splitlines()


def _diff_lines(old_lines: List[str], new_lines: List[str]) -> List[ContentDiffLine]:
    """Line-based diff (same approach as a unified diff): runs of unchanged
    lines are kept as "same", changed runs are shown as the old lines
    removed followed by the new lines added."""
    matcher = difflib.SequenceMatcher(None, old_lines, new_lines, autojunk=False)
    result: List[ContentDiffLine] = []
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


def build_page_content_diff(
    old_entry: Optional[RawPageEntry],
    new_entry: Optional[RawPageEntry],
    path: str,
) -> PageContentDiff:
    if old_entry is None and new_entry is None:
        return PageContentDiff(path=path, status="removed")

    if old_entry is not None and new_entry is None:
        status = "removed"
    elif old_entry is None and new_entry is not None:
        status = "added"
    else:
        same_text = (old_entry.text or "") == (new_entry.text or "")
        same_html = (old_entry.html or "") == (new_entry.html or "")
        status = "same" if (same_text and same_html) else "changed"

    text_diff = _diff_lines(
        _split_text(old_entry.text if old_entry else None),
        _split_text(new_entry.text if new_entry else None),
    )
    html_diff = _diff_lines(
        _split_html(old_entry.html if old_entry else None),
        _split_html(new_entry.html if new_entry else None),
    )

    old_structure = (old_entry.structure or {}) if old_entry else {}
    new_structure = (new_entry.structure or {}) if new_entry else {}
    structure_diff: List[StructureDiffRow] = []
    for tag in STRUCTURE_TAGS:
        old_count = old_structure.get(tag) if old_entry else None
        new_count = new_structure.get(tag) if new_entry else None
        changed = (old_entry is not None and new_entry is not None and (old_count or 0) != (new_count or 0))
        structure_diff.append(StructureDiffRow(tag=tag, old=old_count, new=new_count, changed=changed))

    return PageContentDiff(
        path=path,
        status=status,
        old_url=old_entry.url if old_entry else None,
        new_url=new_entry.url if new_entry else None,
        text_diff=text_diff,
        structure_diff=structure_diff,
        html_diff=html_diff,
    )
