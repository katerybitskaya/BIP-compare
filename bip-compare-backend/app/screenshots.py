"""Full-page screenshots of crawled pages, captured with Playwright.

Screenshots are optional (CompareScope.screenshots, off by default) since
rendering every page in a real browser is much slower and heavier than the
plain HTTP fetch the rest of the crawler uses. This module only *captures*
and saves images for manual side-by-side viewing -- there's no automated
pixel-diff yet.

Saved under results/{id}/screenshots/{old,new}/{filename}.png. The filename
for a given page path is the same on both sides (see screenshot_filename),
so a path's old and new screenshot are trivial to pair up by name alone.
A small manifest.json (list of paths successfully captured per side) is
saved alongside so the API doesn't need to guess which pages actually
rendered without re-deriving/checking every possible filename.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
from pathlib import Path
from typing import Iterable

# How many pages are rendered at once, per site. Each one is a real browser
# tab -- much heavier (CPU/memory) than an HTTP fetch, so this stays modest
# regardless of how high the HTTP-level concurrency limits are (CLIENT_LIMITS,
# PROBE_CONCURRENCY) -- those bound plain requests, this bounds full browser
# tabs actually rendering a page.
SCREENSHOT_CONCURRENCY = 5

# Upper bound on how long a single page is given to load before we give up
# on it and move on -- one slow/hanging page shouldn't stall the whole batch.
SCREENSHOT_TIMEOUT_CAP_MS = 30_000

_UNSAFE_CHARS = re.compile(r"[^A-Za-z0-9_-]+")


def screenshot_filename(path: str) -> str:
    """Turns a page path (e.g. "/", "/aktualnosci", or something messier
    like "/6796/dokument/api/download/file?id=9543") into a filesystem-safe
    filename that stays readable AND is guaranteed unique per distinct path.

    Two parts: a human-readable slug (slashes -> "__", anything else
    non-alphanumeric -> "_", truncated so very long paths don't hit
    filesystem filename limits) followed by an 8-char hash of the *original*
    untruncated path. The slug alone isn't reliable for uniqueness --
    truncation or two paths that sanitize to the same characters could
    collide -- the hash is what actually guarantees two different paths
    never produce the same filename; the slug is just there so a human
    browsing the screenshots folder can tell files apart at a glance.
    """
    slug = path.strip("/") or "index"
    slug = slug.replace("/", "__")
    slug = _UNSAFE_CHARS.sub("_", slug).strip("_") or "index"
    if len(slug) > 100:
        slug = slug[:100]
    digest = hashlib.sha1(path.encode("utf-8")).hexdigest()[:8]
    return f"{slug}__{digest}.png"


async def capture_screenshots(
    pages: Iterable[tuple[str, str]],
    out_dir: Path,
    timeout_seconds: float,
) -> list[str]:
    """Captures a full-page screenshot of every (path, url) pair, saving
    each to out_dir/{screenshot_filename(path)}.png. Returns the list of
    paths that were captured successfully -- a page that fails to load
    (timeout, network error, render error) is silently skipped rather than
    aborting the whole batch, since one broken page shouldn't stop the rest.

    Reuses a single browser instance across every page (launching the
    browser itself is the expensive part) but opens a fresh tab per URL,
    bounded by SCREENSHOT_CONCURRENCY.
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:  # pragma: no cover - environment setup issue
        raise RuntimeError(
            "Playwright nie jest zainstalowany. Uruchom `pip install playwright` "
            "i `playwright install chromium`, aby włączyć zrzuty ekranów."
        ) from exc

    out_dir.mkdir(parents=True, exist_ok=True)
    captured: list[str] = []
    timeout_ms = min(timeout_seconds * 1000, SCREENSHOT_TIMEOUT_CAP_MS)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        semaphore = asyncio.Semaphore(SCREENSHOT_CONCURRENCY)

        async def _capture_one(path: str, url: str) -> None:
            async with semaphore:
                page = await browser.new_page()
                try:
                    await page.goto(url, timeout=timeout_ms, wait_until="load")
                    filename = screenshot_filename(path)
                    await page.screenshot(path=str(out_dir / filename), full_page=True)
                    captured.append(path)
                except Exception:
                    pass
                finally:
                    await page.close()

        await asyncio.gather(*[_capture_one(path, url) for path, url in pages])
        await browser.close()

    return captured


def save_manifest(screenshots_dir: Path, old_paths: list[str], new_paths: list[str]) -> None:
    manifest = {"old": sorted(old_paths), "new": sorted(new_paths)}
    (screenshots_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")


def load_manifest(screenshots_dir: Path) -> dict[str, list[str]] | None:
    manifest_path = screenshots_dir / "manifest.json"
    if not manifest_path.exists():
        return None
    return json.loads(manifest_path.read_text(encoding="utf-8"))
