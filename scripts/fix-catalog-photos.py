"""Straighten and reframe the catalog photos listed in photo-fixes.json.

A few studio shots look broken in the grid: trousers laid sideways across a
portrait frame, small items (shorts, tops, shoes) lost in a big backdrop, a
raw landscape shot on a hanger. Instead of a reshoot, the file is listed in
scripts/photo-fixes.json with what it needs:

  "rotate": "cw" | "ccw"      a quarter turn so the waist ends up on top
  "fill":   0.64              crop in until the item spans this share of the frame
  "crop":   [x0, y0, x1, y1]  an explicit crop, as fractions of the upright photo
  "source": "c295866df73d"    start of the Yandex sha256 the fix was written for
  "preview": true             work from Yandex's preview, not the original
                              (camera RAW files, originals Yandex won't serve)

sync-static-content.mjs downloads the full-size original of each listed photo
(and records the fix in image-meta.json); this step writes the fixed photo
over the mirrored one in /catalog-images/ and removes the original. The
result keeps the portrait frame and the plain backdrop, so cards stay
seamless. With no originals waiting it does nothing.
"""

import argparse
import json
import os
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

MAX_SIDE = 1440
QUALITY = 88
ROTATED_FILL = 0.78


def subject_box(image: Image.Image):
    """Bounding box of everything that stands out from the backdrop along the frame's edges."""
    probe = image.copy()
    probe.thumbnail((480, 480))
    pixels = np.asarray(probe).astype(np.int16)
    border = np.concatenate([pixels[:4].reshape(-1, 3), pixels[-4:].reshape(-1, 3), pixels[:, :4].reshape(-1, 3), pixels[:, -4:].reshape(-1, 3)])
    mask = np.abs(pixels - np.median(border, axis=0)).max(axis=2) > 38
    rows = np.where(mask.mean(axis=1) > 0.01)[0]
    cols = np.where(mask.mean(axis=0) > 0.01)[0]
    if not len(rows) or not len(cols):
        return None
    sx, sy = image.width / probe.width, image.height / probe.height
    return cols[0] * sx, rows[0] * sy, (cols[-1] + 1) * sx, (rows[-1] + 1) * sy


def reframe(image: Image.Image, fill: float, aspect: float) -> Image.Image:
    """Crop to `aspect` (width / height) around the item so it spans `fill` of the frame."""
    box = subject_box(image)
    if not box:
        return image
    x0, y0, x1, y1 = box
    height = min(max((x1 - x0) / aspect, y1 - y0) / fill, image.height, image.width / aspect)
    width = height * aspect
    left = min(max((x0 + x1 - width) / 2, 0), image.width - width)
    top = min(max((y0 + y1 - height) / 2, 0), image.height - height)
    return image.crop((round(left), round(top), round(left + width), round(top + height)))


def fix_photo(source: Path, fix: dict) -> Image.Image:
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
    aspect = image.width / image.height
    if fix.get("rotate") == "cw":
        image = image.transpose(Image.Transpose.ROTATE_270)
    elif fix.get("rotate") == "ccw":
        image = image.transpose(Image.Transpose.ROTATE_90)
    if fix.get("crop"):
        x0, y0, x1, y1 = fix["crop"]
        image = image.crop((round(x0 * image.width), round(y0 * image.height), round(x1 * image.width), round(y1 * image.height)))
    elif fix.get("fill") or fix.get("rotate"):
        image = reframe(image, float(fix.get("fill") or ROTATED_FILL), aspect)
    image.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    return image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--public-dir", default="public")
    parser.add_argument("--originals-dir", default=os.environ.get("PHOTO_ORIGINALS_DIR") or str(Path(tempfile.gettempdir()) / "viwantica-photo-originals"))
    args = parser.parse_args()

    public_dir = Path(args.public_dir).resolve()
    originals = Path(args.originals_dir).resolve()
    meta = json.loads((public_dir / "data" / "image-meta.json").read_text(encoding="utf-8"))

    fixed = 0
    for folder, entries in meta.items():
        for entry in entries.values():
            if not isinstance(entry, dict) or not entry.get("fix"):
                continue
            target = public_dir / entry["path"].lstrip("/")
            original = originals / folder / target.name
            if not original.exists():
                continue
            try:
                image = fix_photo(original, json.loads(entry["fix"]))
            except Exception as error:  # noqa: BLE001 - one odd upload must not stop the sync
                print(f"Skipped {entry['path']}: {error}")
                original.unlink()
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.suffix.lower() in (".jpg", ".jpeg"):
                image.save(target, "JPEG", quality=QUALITY, optimize=True, progressive=True)
            else:
                image.save(target)
            original.unlink()
            fixed += 1
    print(f"Straightened {fixed} catalog photos.")


if __name__ == "__main__":
    main()
