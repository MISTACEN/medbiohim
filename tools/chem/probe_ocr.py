# -*- coding: utf-8 -*-
"""Быстрый зонд: что на первой странице каждого PDF из папки «на сайт/химия».
Запуск: PYTHONIOENCODING=utf-8 python tools/chem/probe_ocr.py
"""
import io
import os
import sys

import pymupdf

CHEM_DIR = r"C:\Users\MISTACEN\Documents\deepseek-harness\default-workspace\на сайт\химия"
HERE = os.path.dirname(os.path.abspath(__file__))

# Загружаем ocr_image/KEY из ocr_scans.py, не запуская его main().
src = io.open(os.path.join(HERE, "ocr_scans.py"), encoding="utf-8").read()
src = src.replace('if __name__ == "__main__":\n    main()', "")
g = {"__file__": os.path.join(HERE, "ocr_scans.py")}
exec(compile(src, "ocr_scans.py", "exec"), g)
ocr_image = g["ocr_image"]
KEY = g["KEY"]

targets = [f for f in sorted(os.listdir(CHEM_DIR)) if f.lower().endswith(".pdf")]
if len(sys.argv) > 1:
    targets = [f for f in targets if sys.argv[1] in f]

for name in targets:
    path = os.path.join(CHEM_DIR, name)
    doc = pymupdf.open(path)
    pix = doc[0].get_pixmap(dpi=110)
    png = pix.tobytes("png")
    print(f"== {name} ({doc.page_count} стр, {len(png) // 1024} КБ)", flush=True)
    text = ocr_image(KEY, png)
    print(f"   [{len(text)} символов]")
    print("   " + text[:700].replace("\n", " | "), flush=True)
    print(flush=True)
    doc.close()
