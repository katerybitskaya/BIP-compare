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
import sys
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


def capture_screenshots_sync(
    pages: Iterable[tuple[str, str]],
    out_dir: Path,
    timeout_seconds: float,
) -> list[str]:
    """Blocking entry point for capture_screenshots -- runs it to completion
    in a brand-new event loop, created explicitly on whatever thread this is
    called from (meant to be called via asyncio.to_thread, see comparison.py).

    Why this indirection exists: Playwright launches Chromium as a
    subprocess, and on Windows asyncio's SelectorEventLoop cannot create
    subprocesses at all (NotImplementedError, no useful message). Python 3.8+
    defaults to ProactorEventLoop on Windows, which *does* support
    subprocesses -- but uvicorn (especially combined with --reload, which
    re-execs itself and sets up its own loop before app code is fully
    imported) doesn't reliably leave that default in place by the time our
    code runs, and setting the event loop policy at import time (see
    main.py) can end up happening too late, after uvicorn's own loop already
    exists. Explicitly building a fresh Proactor loop *here*, on a plain
    worker thread with no prior asyncio state, sidesteps that timing problem
    entirely instead of depending on it.
    """
    if sys.platform == "win32":
        loop = asyncio.ProactorEventLoop()  # type: ignore[attr-defined]
    else:
        loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_capture_screenshots_async(pages, out_dir, timeout_seconds))
    finally:
        loop.close()


async def _capture_screenshots_async(
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

    out_dir is created up front, before anything else can fail (import,
    browser launch, ...) -- so the folder for this side always exists on
    disk once this function has been called, even if every single page
    then fails to capture. Makes it obvious from the results/ folder alone
    whether capture was even attempted for a given report.
    """
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:  # pragma: no cover - environment setup issue
        raise RuntimeError(
            "Playwright nie jest zainstalowany w środowisku backendu. Uruchom "
            "`pip install playwright` a potem `python -m playwright install chromium` "
            "(w tym samym środowisku/venv, w którym uruchamiany jest `uvicorn`), "
            "aby włączyć zrzuty ekranów."
        ) from exc

    captured: list[str] = []
    timeout_ms = min(timeout_seconds * 1000, SCREENSHOT_TIMEOUT_CAP_MS)

    async with async_playwright() as pw:
        try:
            browser = await pw.chromium.launch()
        except Exception as exc:
            # Most common cause: `playwright install chromium` was never run,
            # so the browser binary itself is missing (this is a SEPARATE
            # install step from `pip install playwright`, easy to miss).
            raise RuntimeError(
                "Nie udało się uruchomić przeglądarki Chromium (Playwright). Uruchom "
                "`python -m playwright install chromium` w środowisku backendu i spróbuj "
                f"ponownie. Oryginalny błąd: {exc}"
            ) from exc

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
