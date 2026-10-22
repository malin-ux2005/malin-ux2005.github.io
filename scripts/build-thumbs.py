"""Small WebP previews for catalog cards.

Cards are ~170 px wide on a phone, yet the mirrored photos are ~1280 px.
Decoding dozens of full photos while scrolling is what makes the home-screen
app stutter, so every catalog photo (and Karrrambaby cutout, transparency kept)
gets a 640 px WebP twin under /catalog-thumbs/. The product card uses the
twin; the product page keeps the full photo.

Writes data/thumbs.json: {"thumbs": {photo_url: thumb_url}, "cache": {...}}.
"""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageOps

SIZE = 640
QUALITY = 76


def build(source: Path, target: Path) -> None:
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image)
        has_alpha = image.mode in ("RGBA", "LA") or "transparency" in image.info
        image = image.convert("RGBA" if has_alpha else "RGB")
        image.thumbnail((SIZE, SIZE), Image.LANCZOS)
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, "WEBP", quality=QUALITY, method=4)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--public-dir", default="public")
    parser.add_argument("--generated-dir", default="")
    args = parser.parse_args()

    public_dir = Path(args.public_dir).resolve()
    data_dir = public_dir / "data"
    manifest = json.loads((data_dir / "image-manifest.json").read_text(encoding="utf-8"))
    out_path = data_dir / "thumbs.json"
    previous = {}
    if out_path.exists():
        previous = json.loads(out_path.read_text(encoding="utf-8")).get("cache", {})

    # Yandex content hashes are stable across CI checkouts (file times are not).
    source_hashes = {}
    for meta_name in ("image-meta.json", "cutout-meta.json"):
        meta_path = data_dir / meta_name
        if meta_path.exists():
            for folder in json.loads(meta_path.read_text(encoding="utf-8")).values():
                for entry in folder.values():
                    if isinstance(entry, dict) and entry.get("path"):
                        source_hashes[entry["path"]] = str(entry.get("sourceHash") or "")

    thumbs, cache, built = {}, {}, 0
    for files in manifest.values():
        for url in files.values():
            if not (url.startswith("/catalog-images/") or url.startswith("/catalog-cutouts/")):
                continue
            source = public_dir / url.lstrip("/")
            if not source.exists():
                continue
            relative = Path(url.lstrip("/"))
            thumb_relative = Path("catalog-thumbs") / relative.parts[0].replace("catalog-", "") / relative.parent.name / f"{relative.stem}.webp"
            target = public_dir / thumb_relative
            stamp = (source_hashes.get(url) or "") + f":{source.stat().st_size}"
            if not (target.exists() and previous.get(url) == stamp):
                try:
                    build(source, target)
                    built += 1
                except Exception:
                    continue
            thumb_url = "/" + thumb_relative.as_posix()
            thumbs[url] = thumb_url
            cache[url] = stamp

    payload = {"thumbs": thumbs, "cache": cache}
    out_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    if args.generated_dir:
        generated = Path(args.generated_dir).resolve()
        generated.mkdir(parents=True, exist_ok=True)
        (generated / "thumbs.json").write_text(json.dumps({"thumbs": thumbs}, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    print(f"Card previews: {len(thumbs)} total, {built} built.")


if __name__ == "__main__":
    main()
