#!/usr/bin/env python3
"""Build stable transparent product cutouts for the Karambaby collection.

The source photographs use a nearly uniform warm-white studio background.  A
browser-side flood fill leaves JPEG islands behind, so the public build stores
real PNG cutouts instead.  The foreground pixels themselves stay fully opaque;
only a one-pixel feather is used at the outer edge.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps


def read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def collection_key(value: str) -> str:
    return re.sub(r"[^a-zа-я0-9]+", "", value.lower().replace("ё", "е"))


def is_karambaby(value: str) -> bool:
    key = collection_key(value)
    return any(token in key for token in ("carambaby", "karambaby", "karrambaby", "карамбейби"))


def connected_components(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    height, width = mask.shape
    seen = np.zeros((height, width), dtype=np.uint8)
    components: list[list[tuple[int, int]]] = []
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or seen[y, x]:
                continue
            seen[y, x] = 1
            queue = deque([(x, y)])
            pixels: list[tuple[int, int]] = []
            while queue:
                px, py = queue.popleft()
                pixels.append((px, py))
                for ny in range(max(0, py - 1), min(height, py + 2)):
                    for nx in range(max(0, px - 1), min(width, px + 2)):
                        if mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = 1
                            queue.append((nx, ny))
            components.append(pixels)
    return components


def fill_mask_holes(mask: Image.Image) -> Image.Image:
    padded = Image.new("L", (mask.width + 2, mask.height + 2), 0)
    padded.paste(mask, (1, 1))
    ImageDraw.floodfill(padded, (0, 0), 128, thresh=0)
    values = np.asarray(padded, dtype=np.uint8)[1:-1, 1:-1]
    # 255 is detected foreground; 0 is an enclosed light area inside it.
    return Image.fromarray(np.where((values == 255) | (values == 0), 255, 0).astype(np.uint8), "L")


def make_cutout(source: Path, target: Path) -> None:
    image = ImageOps.exif_transpose(Image.open(source)).convert("RGB")
    rgb = np.asarray(image, dtype=np.int16)
    height, width, _ = rgb.shape
    border_size = max(4, min(height, width) // 50)
    border = np.concatenate(
        (
            rgb[:border_size].reshape(-1, 3),
            rgb[-border_size:].reshape(-1, 3),
            rgb[:, :border_size].reshape(-1, 3),
            rgb[:, -border_size:].reshape(-1, 3),
        ),
        axis=0,
    )
    background = np.median(border, axis=0)
    border_distance = np.sqrt(np.sum((border - background) ** 2, axis=1))
    threshold = float(np.clip(np.percentile(border_distance, 99.5) + 12, 28, 42))
    distance = np.sqrt(np.sum((rgb - background) ** 2, axis=2))
    foreground = distance > threshold

    scale = 4
    low_width = max(1, width // scale)
    low_height = max(1, height // scale)
    low = np.asarray(
        Image.fromarray((foreground * 255).astype(np.uint8), "L").resize(
            (low_width, low_height), Image.Resampling.BOX
        )
    ) > 28
    components = connected_components(low)
    if not components:
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, "PNG", optimize=True)
        return

    largest = max(len(component) for component in components)
    minimum = max(4, int(largest * 0.008))
    kept_low = np.zeros_like(low, dtype=np.uint8)
    for component in components:
        if len(component) < minimum:
            continue
        for x, y in component:
            kept_low[y, x] = 255

    kept = np.asarray(
        Image.fromarray(kept_low, "L").resize((width, height), Image.Resampling.NEAREST)
    ) > 0
    base = Image.fromarray((foreground & kept).astype(np.uint8) * 255, "L")
    # Close JPEG cracks, then restore light regions enclosed by the garment
    # outline (white shoes, prints and labels must not become transparent).
    base = base.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    base = fill_mask_holes(base)
    alpha = base.filter(ImageFilter.GaussianBlur(0.65))

    rgba = image.convert("RGBA")
    rgba.putalpha(alpha)
    target.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(target, "PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--public-dir", default="public")
    parser.add_argument("--generated-dir", default="")
    args = parser.parse_args()
    public_dir = Path(args.public_dir).resolve()
    data_dir = public_dir / "data"
    catalog = read_json(data_dir / "catalog-snapshot.json", {"headers": [], "rows": []})
    manifest = read_json(data_dir / "image-manifest.json", {})
    image_meta = read_json(data_dir / "image-meta.json", {})
    old_cutout_meta = read_json(data_dir / "cutout-meta.json", {})
    curated_manifest = read_json(data_dir / "curated-cutouts.json", {"paths": []})
    curated_paths = {
        str(path).lstrip("/") for path in curated_manifest.get("paths", []) if str(path).strip()
    }
    next_cutout_meta = {}

    headers = {name: index for index, name in enumerate(catalog.get("headers", []))}

    def cell(row, name: str) -> str:
        index = headers.get(name)
        return str(row[index]).strip() if index is not None and index < len(row) else ""

    wanted: set[tuple[str, str]] = set()
    for row in catalog.get("rows", []):
        if not is_karambaby(cell(row, "Линейка")):
            continue
        folder = cell(row, "Папка фото — Я.Диск")
        prefix = cell(row, "Префикс фото")
        if folder and prefix:
            wanted.add((folder, prefix))

    built = 0
    reused = 0
    for folder, prefix in sorted(wanted):
        files = manifest.get(folder, {})
        folder_meta = image_meta.get(folder, {})
        next_cutout_meta.setdefault(folder, {})
        for original_name, original_url in list(files.items()):
            if not original_name.startswith(f"{prefix}_"):
                continue
            source = public_dir / str(original_url).lstrip("/")
            if not source.exists():
                continue
            relative = Path(str(original_url).lstrip("/"))
            target_relative = Path("catalog-cutouts") / relative.parent.name / f"{relative.stem}.png"
            target = public_dir / target_relative
            source_hash = folder_meta.get(original_name, {}).get("sourceHash", "")
            old = old_cutout_meta.get(folder, {}).get(original_name, {})
            target_key = target_relative.as_posix()
            is_curated = target_key in curated_paths or old.get("curated") is True
            if is_curated and not target.exists():
                raise FileNotFoundError(f"Curated Karambaby cutout is missing: {target_key}")
            if target.exists() and is_curated:
                # Hand-approved transparent assets are the source of truth.  A
                # later photo refresh must never replace them with an automatic
                # background extraction.
                reused += 1
            elif target.exists() and source_hash and old.get("sourceHash") == source_hash:
                reused += 1
            else:
                make_cutout(source, target)
                built += 1
            cutout_url = "/" + target_relative.as_posix()
            files[original_name] = cutout_url
            next_cutout_meta[folder][original_name] = {
                "sourceHash": source_hash,
                "path": cutout_url,
                "curated": is_curated,
            }

    write_json(data_dir / "image-manifest.json", manifest)
    write_json(data_dir / "cutout-meta.json", next_cutout_meta)
    if args.generated_dir:
        write_json(Path(args.generated_dir).resolve() / "image-manifest.json", manifest)
    print(f"Karambaby cutouts: {built} built, {reused} reused.")


if __name__ == "__main__":
    main()
