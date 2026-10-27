# -*- coding: utf-8 -*-
"""Диагонстика: почему часть страниц не распознаётся (таймауты)."""
import io
import os
import sys
import time

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
src = io.open(os.path.join(HERE, "ocr_scans.py"), encoding="utf-8").read()
src = src.replace('if __name__ == "__main__":\n    main()', "")
G = {"__file__": os.path.join(HERE, "ocr_scans.py")}
exec(compile(src, "ocr_scans.py", "exec"), G)
ocr_image = G["ocr_image"]
KEY = G["KEY"]

CHEM = r"C:\Users\MISTACEN\Documents\deepseek-harness\default-workspace\на сайт\химия"

# 166_... — единственный PDF, у которого уже распознаны стр. 1-2
name = [f for f in sorted(os.listdir(CHEM)) if f.startswith("166_")][0]
doc = pymupdf.open(os.path.join(CHEM, name))
print("pages:", doc.page_count)

for idx in (2, 3):  # 0-based: стр. 3 и 4
    for dpi in (110, 150):
        pix = doc[idx].get_pixmap(dpi=dpi)
        png = pix.tobytes("png")
        t0 = time.time()
        text = ocr_image(KEY, png)
        print(f"стр {idx+1} dpi={dpi}: {len(png)//1024} КБ, {round(time.time()-t0,1)}с, "
              f"{len(text)} симв., failed={'OCR FAILED' in text}", flush=True)
        if text and "[OCR FAILED]" not in text:
            print("   ", text[:200].replace("\n", " | "), flush=True)
            break
