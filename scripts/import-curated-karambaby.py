from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


# Web derivative only: the untouched 1440x1920 masters remain in the delivery
# archive. 768x1024 matches the existing storefront pipeline and stays crisp at
# the largest rendered card size without forcing phone visitors to download the
# full production masters.
TARGET_SIZE = (768, 1024)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import approved Karambaby transparent masters without altering their composition."
    )
    parser.add_argument("source", type=Path)
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    args = parser.parse_args()

    source_dir = args.source.resolve()
    public_dir = args.public_dir.resolve()
    target_dir = public_dir / "catalog-cutouts" / "7e4a6c2131"
    manifest_path = public_dir / "data" / "curated-cutouts.json"
    masters = sorted(source_dir.glob("*.png"), key=lambda path: path.name)

    if len(masters) != 125:
        raise RuntimeError(f"Expected 125 approved PNG masters, found {len(masters)}")

    target_dir.mkdir(parents=True, exist_ok=True)
    curated_paths: list[str] = []
    for master in masters:
        with Image.open(master) as source:
            image = source.convert("RGBA")
            if image.size != (1440, 1920):
                raise RuntimeError(f"Unexpected master size for {master.name}: {image.size}")
            if image.getextrema()[3][0] >= 255:
                raise RuntimeError(f"Master has no transparent pixels: {master.name}")
            resized = image.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
            # A web-safe adaptive palette keeps the approved shape, alpha and
            # visible garment detail while avoiding a 70+ MiB first gallery.
            # The untouched full-colour masters remain in the delivery archive.
            web_image = resized.quantize(
                colors=256,
                method=Image.Quantize.FASTOCTREE,
                dither=Image.Dither.NONE,
            )
            output = target_dir / master.name
            web_image.save(output, format="PNG", optimize=True, compress_level=9)
        curated_paths.append(output.relative_to(public_dir).as_posix())

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps({"paths": curated_paths}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    imported = sorted(target_dir.glob("*.png"), key=lambda path: path.name)
    imported_names = {path.name for path in imported}
    missing = [path.name for path in masters if path.name not in imported_names]
    if missing:
        raise RuntimeError(f"Imported assets are missing: {', '.join(missing)}")

    print(f"Imported {len(masters)} curated Karambaby cutouts at {TARGET_SIZE[0]}x{TARGET_SIZE[1]}.")


if __name__ == "__main__":
    main()
