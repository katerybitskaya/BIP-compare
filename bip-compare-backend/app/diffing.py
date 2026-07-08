"""Per-page detailed diffing: content (visible text + structure), links, and
attachments. Used to build the ``results/{id}/pages/{hash}.json`` files for
every subpage that exists on both the old and new site."""
from __future__ import annotations

import asyncio
import difflib
from typing import Dict, List, Optional

import httpx

from .models import (
    AttachmentChange,
    AttachmentInfo,
    AttachmentsDiff,
    ContentChange,
    ContentDiff,
    LinkStatus,
    LinksDiff,
)

# Caps how many individual change entries a single content diff can hold —
# two completely unrelated pages could otherwise produce thousands of tiny
# "changed" chunks and bloat the per-page JSON file for no useful reason.
MAX_CONTENT_CHANGES = 200

_OPCODE_TO_TYPE = {"replace": "changed", "delete": "removed", "insert": "added"}


def diff_content(old_text: str, new_text: str, old_structure: Dict[str, int], new_structure: Dict[str, int]) -> ContentDiff:
    """Line-based diff of two pages' visible text, plus their tag-count
    structure signatures (headings/paragraphs/tables/images/lists/links)."""
    old_lines = [line.strip() for line in old_text.splitlines() if line.strip()]
    new_lines = [line.strip() for line in new_text.splitlines() if line.strip()]

    matcher = difflib.SequenceMatcher(a=old_lines, b=new_lines, autojunk=False)
    similarity = matcher.ratio()

    changes: List[ContentChange] = []
    truncated = False
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        if len(changes) >= MAX_CONTENT_CHANGES:
            truncated = True
            break
        old_chunk = "\n".join(old_lines[i1:i2]) or None
        new_chunk = "\n".join(new_lines[j1:j2]) or None
        changes.append(ContentChange(type=_OPCODE_TO_TYPE[tag], old_text=old_chunk, new_text=new_chunk))

    return ContentDiff(
        changed=similarity < 0.999,
        old_length=len(old_text),
        new_length=len(new_text),
        similarity=round(similarity, 4),
        old_structure=old_structure,
        new_structure=new_structure,
        changes=changes,
        truncated=truncated,
    )


async def _check_status(
    client: httpx.AsyncClient, url: str, timeout_seconds: float, cache: Dict[str, Optional[int]]
) -> Optional[int]:
    if url in cache:
        return cache[url]
    status: Optional[int] = None
    try:
        resp = await client.head(url, timeout=timeout_seconds, follow_redirects=True)
        if resp.status_code >= 400 or resp.status_code == 405:
            # Some servers don't implement HEAD properly — fall back to GET.
            resp = await client.get(url, timeout=timeout_seconds, follow_redirects=True)
        status = resp.status_code
    except httpx.HTTPError:
        status = None
    cache[url] = status
    return status


async def diff_links(
    client: httpx.AsyncClient,
    old_links: List[Dict[str, str]],
    new_links: List[Dict[str, str]],
    timeout_seconds: float,
    status_cache: Dict[str, Optional[int]],
) -> LinksDiff:
    """Compares the link sets of two matching pages: which links disappeared,
    which are new, and — for every unique link across both — whether it
    actually responds.

    Matching is done on each link's normalized "key" (see
    ``crawler._extract_page_content``): for a same-site link that's the
    page's own site's path (e.g. "/kontakt.html"), since the old and new
    sites almost always live on different hosts and a raw href comparison
    would make every internal link look "missing" and "extra" at once.
    External links use their full URL as the key. HTTP status is still
    checked against each link's real absolute href (deduplicated via a
    cache shared across the whole comparison run, since nav/footer links
    repeat on almost every page).
    """
    old_by_key: Dict[str, Dict[str, str]] = {}
    for link in old_links:
        key = link.get("key", link["href"])
        old_by_key.setdefault(key, link)
    new_by_key: Dict[str, Dict[str, str]] = {}
    for link in new_links:
        key = link.get("key", link["href"])
        new_by_key.setdefault(key, link)

    missing = sorted(set(old_by_key) - set(new_by_key))
    extra = sorted(set(new_by_key) - set(old_by_key))

    old_href_text: Dict[str, str] = {link["href"]: link.get("text", "") for link in old_links}
    new_href_text: Dict[str, str] = {link["href"]: link.get("text", "") for link in new_links}
    old_hrefs = list(old_href_text)
    new_hrefs = list(new_href_text)

    old_statuses, new_statuses = await asyncio.gather(
        asyncio.gather(*(_check_status(client, href, timeout_seconds, status_cache) for href in old_hrefs)),
        asyncio.gather(*(_check_status(client, href, timeout_seconds, status_cache) for href in new_hrefs)),
    )

    broken_old = [
        LinkStatus(href=href, text=old_href_text[href], status_code=status, ok=False)
        for href, status in zip(old_hrefs, old_statuses)
        if status is None or status >= 400
    ]
    broken_new = [
        LinkStatus(href=href, text=new_href_text[href], status_code=status, ok=False)
        for href, status in zip(new_hrefs, new_statuses)
        if status is None or status >= 400
    ]

    return LinksDiff(
        missing_links=missing,
        extra_links=extra,
        broken_links_old=broken_old,
        broken_links_new=broken_new,
    )


async def _get_size(
    client: httpx.AsyncClient, url: str, timeout_seconds: float, cache: Dict[str, Optional[int]]
) -> Optional[int]:
    if url in cache:
        return cache[url]
    size: Optional[int] = None
    try:
        resp = await client.head(url, timeout=timeout_seconds, follow_redirects=True)
        content_length = resp.headers.get("content-length")
        if content_length is not None:
            size = int(content_length)
    except (httpx.HTTPError, ValueError):
        size = None
    cache[url] = size
    return size


async def diff_attachments(
    client: httpx.AsyncClient,
    old_files: List[Dict[str, str]],
    new_files: List[Dict[str, str]],
    timeout_seconds: float,
    size_cache: Dict[str, Optional[int]],
) -> AttachmentsDiff:
    """Compares the attachment (downloadable file) lists of two matching
    pages by filename: which files disappeared, which are new, whether a
    same-named file changed size, and whether the display order changed."""
    old_by_name = {f["filename"]: f["href"] for f in old_files}
    new_by_name = {f["filename"]: f["href"] for f in new_files}

    missing_names = sorted(set(old_by_name) - set(new_by_name))
    extra_names = sorted(set(new_by_name) - set(old_by_name))
    common_names = sorted(set(old_by_name) & set(new_by_name))

    missing_sizes, extra_sizes = await asyncio.gather(
        asyncio.gather(*(_get_size(client, old_by_name[n], timeout_seconds, size_cache) for n in missing_names)),
        asyncio.gather(*(_get_size(client, new_by_name[n], timeout_seconds, size_cache) for n in extra_names)),
    )
    missing_files = [AttachmentInfo(href=old_by_name[n], filename=n, size_bytes=s) for n, s in zip(missing_names, missing_sizes)]
    extra_files = [AttachmentInfo(href=new_by_name[n], filename=n, size_bytes=s) for n, s in zip(extra_names, extra_sizes)]

    changed_size: List[AttachmentChange] = []
    if common_names:
        old_common_sizes, new_common_sizes = await asyncio.gather(
            asyncio.gather(*(_get_size(client, old_by_name[n], timeout_seconds, size_cache) for n in common_names)),
            asyncio.gather(*(_get_size(client, new_by_name[n], timeout_seconds, size_cache) for n in common_names)),
        )
        for name, old_size, new_size in zip(common_names, old_common_sizes, new_common_sizes):
            if old_size != new_size:
                changed_size.append(AttachmentChange(filename=name, old_size_bytes=old_size, new_size_bytes=new_size))

    old_common_order = [f["filename"] for f in old_files if f["filename"] in common_names]
    new_common_order = [f["filename"] for f in new_files if f["filename"] in common_names]
    order_changed = old_common_order != new_common_order

    return AttachmentsDiff(
        missing_files=missing_files,
        extra_files=extra_files,
        changed_size=changed_size,
        order_changed=order_changed,
    )


def has_content_diff(content_diff: Optional[ContentDiff]) -> bool:
    return bool(content_diff and content_diff.changed)


def has_link_issues(links_diff: Optional[LinksDiff]) -> bool:
    return bool(
        links_diff
        and (links_diff.missing_links or links_diff.extra_links or links_diff.broken_links_old or links_diff.broken_links_new)
    )


def has_attachment_issues(attachments_diff: Optional[AttachmentsDiff]) -> bool:
    return bool(
        attachments_diff
        and (attachments_diff.missing_files or attachments_diff.extra_files or attachments_diff.changed_size or attachments_diff.order_changed)
    )
