#!/usr/bin/env python3
"""
Install histology media from either the legacy features.zip or the supplied
content.zip into the PHP backend's content/histology tree.

Supported inputs:
  - features.zip: features/histology-content/photos/** and
    features/histology-content/electronograms/images/*
  - content.zip: content/histology/5_Фотографии препаратов/**,
    content/histology/electronograms/images/* and legacy em/*

The script copies media and the two electronogram caption maps only. It does
not write to Supabase and does not import DOCX files as public media.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path, PurePosixPath

LEGACY_ROOT = "features/histology-content"
PHOTO_MARKERS = (
    f"{LEGACY_ROOT}/photos/",
    "content/histology/5_Фотографии препаратов/",
)
EM_MARKERS = (
    f"{LEGACY_ROOT}/electronograms/images/",
    "content/histology/electronograms/images/",
    "content/histology/em/",
)
METADATA_FILES = {
    "content/histology/electronograms/docx-to-image-map.json":
        Path("histology/electronograms/docx-to-image-map.json"),
    "content/histology/electronograms/docx-captions.json":
        Path("histology/electronograms/docx-captions.json"),
}


def decode_legacy_path(name: str) -> str:
    """Decode old ZIP names that escaped each Cyrillic code point as #UXXXX."""
    return re.sub(
        r"#U([0-9a-fA-F]{4})",
        lambda match: chr(int(match.group(1), 16)),
        name,
    )


def safe_relative(name: str) -> Path | None:
    path = PurePosixPath(name)
    if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
        return None
    return Path(*path.parts)


def media_target(name: str) -> Path | None:
    decoded = decode_legacy_path(name)
    lower = decoded.lower()
    for marker in PHOTO_MARKERS:
        if decoded.startswith(marker):
            rel = decoded[len(marker):]
            safe = safe_relative(rel)
            if safe and safe.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                return Path("histology") / safe
    for marker in EM_MARKERS:
        if decoded.startswith(marker):
            rel = decoded[len(marker):]
            safe = safe_relative(rel)
            if safe and safe.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                # Preserve the canonical endpoint path and legacy alias. The
                # original relative filename is retained for existing DB keys.
                if "/em/" in "/" + decoded:
                    return Path("histology") / "em" / safe.name
                return Path("histology") / "electronograms" / "images" / safe.name
    return None


def extract_media(zip_path: Path, out_root: Path) -> dict[str, int]:
    counts = {"photos": 0, "electronograms": 0, "aliases": 0, "metadata": 0, "duplicates": 0}
    seen_targets: dict[str, str] = {}
    em_names: dict[str, tuple[bytes, str]] = {}

    with zipfile.ZipFile(zip_path) as archive:
        members = [name for name in archive.namelist() if not name.endswith("/")]
        # Prefer the canonical electronograms/images path over em aliases.
        for name in members:
            decoded = decode_legacy_path(name)
            if decoded.startswith("content/histology/electronograms/images/") or decoded.startswith(
                f"{LEGACY_ROOT}/electronograms/images/"
            ):
                target = media_target(name)
                if target:
                    em_names[target.name] = (archive.read(name), decoded)

        for name in members:
            decoded = decode_legacy_path(name)
            target = media_target(name)
            if target is None:
                continue
            data = archive.read(name)
            digest = hashlib.sha256(data).hexdigest()
            key = target.as_posix()
            if key in seen_targets:
                if seen_targets[key] == digest:
                    counts["duplicates"] += 1
                    continue
                # A different file maps to the same normalized name: never
                # silently overwrite it; leave the first copy and report.
                raise ValueError(f"Conflicting media files normalize to {key}: {name}")
            seen_targets[key] = digest
            destination = out_root / target
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
            if target.parts[1] == "5_Фотографии препаратов" or "photos" in decoded:
                counts["photos"] += 1
            else:
                counts["electronograms"] += 1

        # Always emit em/<name> aliases for canonical electronograms. Existing
        # short/long aliases from the input are preserved too.
        for filename, (data, _source) in em_names.items():
            target = Path("histology") / "em" / filename
            key = target.as_posix()
            digest = hashlib.sha256(data).hexdigest()
            if key in seen_targets:
                if seen_targets[key] == digest:
                    counts["duplicates"] += 1
                    continue
                raise ValueError(f"Conflicting electronogram alias: {filename}")
            destination = out_root / target
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
            seen_targets[key] = digest
            counts["aliases"] += 1

        for source_name, target in METADATA_FILES.items():
            if source_name in members:
                destination = out_root / target
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(archive.read(source_name))
                counts["metadata"] += 1

    manifest = {
        "source_archive": zip_path.name,
        "counts": counts,
        "files": [
            {"path": path, "sha256": digest}
            for path, digest in sorted(seen_targets.items())
        ],
    }
    manifest_path = out_root / "histology-media-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return counts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_zip", type=Path, help="features.zip or content.zip")
    parser.add_argument("--out", type=Path, default=Path("backend/content"))
    args = parser.parse_args()
    counts = extract_media(args.source_zip, args.out)
    print(json.dumps({"output": str(args.out), **counts}, ensure_ascii=False))


if __name__ == "__main__":
    main()
