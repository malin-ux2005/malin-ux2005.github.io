"""Measure the backdrop colour of every catalog photo.

The storefront paints each product tile in the colour of its own photo
background, so the photo edge disappears into the card. The result is a small
JSON map: "/catalog-images/<folder>/<file>" -> "#rrggbb". Photos whose border is
not a calm, even backdrop (busy scene, transparent cutout) are left out and get
the neutral default tile colour on the site.
"""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

BAND = 0.035  # share of the width/height sampled along each edge
MAX_SPREAD = 18.0  # per-channel spread (P90-P10) above which the border is "busy"


def measure(path: Path):
    with Image.open(path) as image:
        if image.mode in ("RGBA", "LA") or "transparency" in image.info:
            alpha = image.convert("RGBA").getchannel("A")
            if alpha.getextrema()[0] < 250:
                return None  # transparent cutout: the card keeps its own backdrop
        image.draft("RGB", (240, 320))
        rgb = image.convert("RGB")
        rgb.thumbnail((240, 320))
        pixels = np.asarray(rgb).astype(np.float32)
    height, width, _ = pixels.shape
    band_y = max(2, int(height * BAND))
    band_x = max(2, int(width * BAND))
    border = np.concatenate([
        pixels[:band_y].reshape(-1, 3),
        pixels[-band_y:].reshape(-1, 3),
        pixels[:, :band_x].reshape(-1, 3),
        pixels[:, -band_x:].reshape(-1, 3),
    ])
    spread = np.percentile(border, 90, axis=0) - np.percentile(border, 10, axis=0)
    if float(spread.max()) > MAX_SPREAD:
        return None
    red, green, blue = (int(round(value)) for value in np.median(border, axis=0))
    return f"#{red:02x}{green:02x}{blue:02x}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--public-dir", default="public")
    parser.add_argument("--generated-dir", default="")
    args = parser.parse_args()

    public_dir = Path(args.public_dir).resolve()
    data_dir = public_dir / "data"
    manifest = json.loads((data_dir / "image-manifest.json").read_text(encoding="utf-8"))
    tones_path = data_dir / "image-tones.json"
    previous = {}
    if tones_path.exists():
        previous = json.loads(tones_path.read_text(encoding="utf-8")).get("cache", {})
    # Yandex content hashes make a stable cache key (file times change on every
    # CI checkout and would create a commit on every run).
    source_hashes = {}
    meta_path = data_dir / "image-meta.json"
    if meta_path.exists():
        for folder in json.loads(meta_path.read_text(encoding="utf-8")).values():
            for entry in folder.values():
                if isinstance(entry, dict) and entry.get("path"):
                    source_hashes[entry["path"]] = str(entry.get("sourceHash") or "")

    tones, cache = {}, {}
    for files in manifest.values():
        for url in files.values():
            if not url.startswith("/catalog-images/"):
                continue
            path = public_dir / url.lstrip("/")
            if not path.exists():
                continue
            stamp = source_hashes.get(url) or str(path.stat().st_size)
            cached = previous.get(url)
            if cached and cached.get("stamp") == stamp:
                tone = cached.get("tone")
            else:
                try:
                    tone = measure(path)
                except Exception:  # unreadable file: keep the default tile colour
                    tone = None
            cache[url] = {"stamp": stamp, "tone": tone}
            if tone:
                tones[url] = tone

    payload = {"tones": tones, "cache": cache}
    tones_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    if args.generated_dir:
        generated = Path(args.generated_dir).resolve()
        generated.mkdir(parents=True, exist_ok=True)
        (generated / "image-tones.json").write_text(json.dumps({"tones": tones}, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    print(f"Measured {len(cache)} photos, {len(tones)} with an even backdrop.")


if __name__ == "__main__":
    main()
