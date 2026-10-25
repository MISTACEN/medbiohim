# -*- coding: utf-8 -*-
"""Рендер оставшихся разворотов химии в PNG для ручного распознавания.
Запуск: python tools/chem/render_remaining.py
Выход: tools/chem/png/chem2-NN.png (стр 12-24), tools/chem/png/chem3-NN.png (все 24)
"""
import os

import pymupdf

BASE = r"C:\Users\MISTACEN\Documents\deepseek-harness\default-workspace\на сайт\химия"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "png")
os.makedirs(OUT, exist_ok=True)

JOBS = [("chem2.pdf", "chem2", 12), ("chem3.pdf", "chem3", 1)]

for name, tag, start in JOBS:
    path = os.path.join(BASE, name)
    if not os.path.exists(path):
        print(f"!! нет файла {path}")
        continue
    doc = pymupdf.open(path)
    for i, page in enumerate(doc):
        if i + 1 < start:
            continue
        out_path = os.path.join(OUT, f"{tag}-{i + 1:02d}.png")
        if os.path.exists(out_path):
            print(f"{tag} стр {i + 1}: уже есть")
            continue
        pix = page.get_pixmap(dpi=150)
        pix.save(out_path)
        print(f"{tag} стр {i + 1}: → {out_path} ({len(pix.tobytes('png')) // 1024} КБ)")
print("Готово. PNG в tools/chem/png/")
