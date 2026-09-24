#!/usr/bin/env python3
"""
Install the histology media from features.zip into the SpaceWeb backend content tree.

Expected layout after extraction:
  content/histology/em/*.png|*.jpeg
  content/histology/5_Фотографии препаратов/.../*.jpg

The trainer cards already store these relative URLs. This script deliberately
does not touch the database.
"""
from __future__ import annotations

import argparse
import zipfile
from pathlib import Path

ROOT = Path("features/histology-content")
EM_PREFIX = f"{ROOT.as_posix()}/electronograms/images/"
PHOTO_PREFIX = f"{ROOT.as_posix()}/photos/"


def extract_media(zip_path: Path, out_root: Path) -> tuple[int, int]:
    em = photos = 0
    with zipfile.ZipFile(zip_path) as z:
        for name in z.namelist():
            if name.startswith(EM_PREFIX) and not name.endswith("/"):
                rel = Path("histology/em") / Path(name).name
                target = out_root / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(z.read(name))
                em += 1
            elif name.startswith(PHOTO_PREFIX) and not name.endswith("/"):
                rel = Path(name[len(f"{ROOT.as_posix()}/"):])
                target = out_root / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(z.read(name))
                photos += 1
    return em, photos


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("features_zip", type=Path)
    ap.add_argument("--out", type=Path, default=Path("content"))
    args = ap.parse_args()
    em, photos = extract_media(args.features_zip, args.out)
    print(f"electronograms: {em}; preparation photos: {photos}; output: {args.out}")


if __name__ == "__main__":
    main()
