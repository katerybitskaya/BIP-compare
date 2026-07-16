"""Pixel-level visual diffing between two screenshots of the same page,
using the Python port of the pixelmatch algorithm (mapbox/pixelmatch) --
the same perceptual-diff approach used by most visual regression tools,
which (unlike a naive pixel-by-pixel subtraction) tolerates minor
anti-aliasing differences instead of flagging every soft edge as changed.

Full-page screenshots of the old and new version of a page almost never
have the exact same height (different amount of content) -- pixelmatch
requires both images to be the same size, so the shorter one is padded
(white, bottom-aligned) to match the taller one before diffing. The
original heights are reported alongside the pixel diff, since "this page
got much longer/shorter" is meaningful information on its own, not just
noise to paper over before the comparison.
"""
from __future__ import annotations

from pathlib import Path


def compare_screenshots(old_path: Path, new_path: Path, diff_path: Path) -> dict:
    """Compares two same-page screenshots pixel-by-pixel, saving a visual
    diff image (differing pixels highlighted) to diff_path. Returns a dict
    with mismatched_pixels, total_pixels, diff_percent, old_height, new_height.

    Runs synchronously (CPU-bound image work) -- callers should wrap this in
    asyncio.to_thread so it doesn't block the event loop.
    """
    from PIL import Image
    from pixelmatch.contrib.PIL import pixelmatch

    old_img = Image.open(old_path).convert("RGBA")
    new_img = Image.open(new_path).convert("RGBA")
    old_height, new_height = old_img.height, new_img.height

    width = max(old_img.width, new_img.width)
    height = max(old_height, new_height)

    def _pad(img: "Image.Image") -> "Image.Image":
        if img.width == width and img.height == height:
            return img
        canvas = Image.new("RGBA", (width, height), (255, 255, 255, 255))
        canvas.paste(img, (0, 0))
        return canvas

    padded_old = _pad(old_img)
    padded_new = _pad(new_img)
    diff_img = Image.new("RGBA", (width, height))

    mismatched = pixelmatch(padded_old, padded_new, diff_img, includeAA=False)

    diff_path.parent.mkdir(parents=True, exist_ok=True)
    diff_img.save(diff_path)

    total_pixels = width * height
    diff_percent = round((mismatched / total_pixels * 100), 2) if total_pixels else 0.0

    return {
        "mismatched_pixels": mismatched,
        "total_pixels": total_pixels,
        "diff_percent": diff_percent,
        "old_height": old_height,
        "new_height": new_height,
    }
