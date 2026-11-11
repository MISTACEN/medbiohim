"""Render vector schemes from методичка PDFs into candidate PNG figures.

For each page of a PDF:
- collect page.get_drawings() rects,
- merge nearby rects into clusters (gap <= 25 pt),
- keep clusters >= 140x140 pt covering < 75% of the page,
- render each cluster bbox (padded 8 pt) at 2x zoom into PNG.

Usage:
    python -E tools/physiology/render_pdf_figs.py <pdf_path> <slug> [--pages A-B] [--raster]

Default mode: vector drawing clusters (pageNNN-kK.png).
--raster mode: embedded raster images larger than 120x120 pt (imgNNN-kK.png).

Outputs:
    .tmp-figs/<slug>/manifest.json (+ per-candidate PNGs)
"""

from __future__ import annotations

import argparse
import json
import sys
import pathlib

import fitz  # pymupdf

GAP = 25.0
MIN_SIDE = 140.0
MAX_PAGE_COVERAGE = 0.75
PAD = 8.0
ZOOM = 2.0


def merge_clusters(rects, gap=GAP):
    """Merge rectangles whose bounding boxes are within `gap` (Manhattan-ish)."""
    clusters = []
    for r in rects:
        x0, y0, x1, y1 = r
        placed = False
        for c in clusters:
            nx0 = min(c[0], x0)
            ny0 = min(c[1], y0)
            nx1 = max(c[2], x1)
            ny1 = max(c[3], y1)
            # horizontal/vertical separation between the rect and the cluster
            sep_x = max(0.0, max(c[0], x0) - min(c[2], x1)) if (x1 < c[0] or x0 > c[2]) else 0.0
            sep_y = max(0.0, max(c[1], y0) - min(c[3], y1)) if (y1 < c[1] or y0 > c[3]) else 0.0
            if sep_x <= gap and sep_y <= gap:
                c[0], c[1], c[2], c[3] = nx0, ny0, nx1, ny1
                placed = True
                break
        if not placed:
            clusters.append([x0, y0, x1, y1])
    # second pass: merge overlapping clusters until stable
    changed = True
    while changed:
        changed = False
        out = []
        for c in clusters:
            merged = False
            for o in out:
                sep_x = max(0.0, max(o[0], c[0]) - min(o[2], c[2])) if (c[2] < o[0] or c[0] > o[2]) else 0.0
                sep_y = max(0.0, max(o[1], c[1]) - min(o[3], c[3])) if (c[3] < o[1] or c[1] > o[3]) else 0.0
                if sep_x <= gap and sep_y <= gap:
                    o[0] = min(o[0], c[0])
                    o[1] = min(o[1], c[1])
                    o[2] = max(o[2], c[2])
                    o[3] = max(o[3], c[3])
                    merged = True
                    changed = True
                    break
            if not merged:
                out.append(c)
        clusters = out
    return clusters


def page_raster_candidates(page, min_side=120.0):
    pw, ph = page.rect.width, page.rect.height
    out = []
    for info in page.get_image_info():
        b = info["bbox"]
        w, h = b[2] - b[0], b[3] - b[1]
        if w < min_side or h < min_side:
            continue
        bbox = fitz.Rect(
            max(0.0, b[0] - PAD),
            max(0.0, b[1] - PAD),
            min(pw, b[2] + PAD),
            min(ph, b[3] + PAD),
        )
        out.append(bbox)
    out.sort(key=lambda r: (round(r.y0 / 50), r.x0))
    return out


def page_candidates(page):
    pw, ph = page.rect.width, page.rect.height
    page_area = pw * ph
    rects = []
    for d in page.get_drawings():
        r = d["rect"]
        if r.is_empty or r.is_infinite:
            continue
        # ignore full-width hairlines that are just rules/underlines? keep all rects,
        # clustering merges them into bigger shapes anyway.
        rects.append([r.x0, r.y0, r.x1, r.y1])
    if not rects:
        return []
    clusters = merge_clusters(rects)
    out = []
    for c in clusters:
        w = c[2] - c[0]
        h = c[3] - c[1]
        if w < MIN_SIDE or h < MIN_SIDE:
            continue
        if w * h >= MAX_PAGE_COVERAGE * page_area:
            continue
        bbox = fitz.Rect(
            max(0.0, c[0] - PAD),
            max(0.0, c[1] - PAD),
            min(pw, c[2] + PAD),
            min(ph, c[3] + PAD),
        )
        out.append(bbox)
    # sort top-to-bottom, left-to-right
    out.sort(key=lambda r: (round(r.y0 / 50), r.x0))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("slug")
    ap.add_argument("--pages", default=None, help="1-based range like 1-70 or single page")
    ap.add_argument("--raster", action="store_true", help="extract embedded raster images instead of vector clusters")
    args = ap.parse_args(argv)

    out_dir = pathlib.Path(".tmp-figs") / args.slug
    out_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(args.pdf)
    if args.pages:
        if "-" in args.pages:
            a, b = args.pages.split("-")
            page_iter = range(int(a) - 1, int(b))
        else:
            page_iter = [int(args.pages) - 1]
    else:
        page_iter = range(len(doc))

    manifest = []
    prefix = "img" if args.raster else "page"
    for pno in page_iter:
        page = doc[pno]
        cands = page_raster_candidates(page) if args.raster else page_candidates(page)
        for k, bbox in enumerate(cands, start=1):
            pix = page.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM), clip=bbox)
            name = f"{prefix}{pno + 1:03d}-k{k}.png"
            pix.save(str(out_dir / name))
            text = page.get_text("text")
            manifest.append(
                {
                    "file": name,
                    "page": pno + 1,
                    "bbox": [round(v, 1) for v in (bbox.x0, bbox.y0, bbox.x1, bbox.y1)],
                    "text_first_200": text[:200],
                }
            )
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"{args.slug}: {len(manifest)} candidates -> {out_dir}")


if __name__ == "__main__":
    main(sys.argv[1:])
