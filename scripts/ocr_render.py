#!/usr/bin/env python
"""Рендер страниц PDF в PNG для OCR: python scripts/ocr_render.py <pdf> <out_dir> [dpi]."""
import os
import sys

import fitz  # pymupdf

pdf_path, out_dir = sys.argv[1], sys.argv[2]
dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 200
os.makedirs(out_dir, exist_ok=True)
doc = fitz.open(pdf_path)
for i, page in enumerate(doc, start=1):
    pix = page.get_pixmap(dpi=dpi)
    pix.save(os.path.join(out_dir, f"page-{i:02d}.png"))
print(f"{pdf_path}: {len(doc)} страниц → {out_dir} ({dpi} dpi)")
