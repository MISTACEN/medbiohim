# -*- coding: utf-8 -*-
"""Засевает кэш OCR страницами из ручных транскрипций (tools/chem/transcripts),
чтобы не распознавать chem2/chem3 заново.

Запуск: PYTHONIOENCODING=utf-8 python tools/chem/seed_from_transcripts.py
"""
import io
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "ocr")
TRANS = os.path.join(HERE, "transcripts")

# файл транскрипции → (канонический basename, номера страниц в файле)
MAP = {
    "chem2-12-17.txt": "chem2",
    "chem2-18-24.txt": "chem2",
    "chem3-01-12.txt": "chem3",
    "chem3-13-24.txt": "chem3",
}

MARK = re.compile(r"^=====\s*([A-Za-z0-9]+)-(\d+)\s*=====\s*$", re.M)

for fname, base in MAP.items():
    path = os.path.join(TRANS, fname)
    if not os.path.exists(path):
        print("!! нет", fname)
        continue
    text = io.open(path, encoding="utf-8", errors="ignore").read()
    marks = list(MARK.finditer(text))
    page_dir = os.path.join(OUT, base)
    os.makedirs(page_dir, exist_ok=True)
    for i, m in enumerate(marks):
        start = m.end()
        end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        body = text[start:end].strip()
        n = int(m.group(2))
        if not body:
            continue
        tp = os.path.join(page_dir, "page-%02d.txt" % n)
        if os.path.exists(tp):
            continue
        io.open(tp, "w", encoding="utf-8", newline="\n").write(body)
        io.open(os.path.join(page_dir, "page-%02d.done" % n), "w").write("1")
        print("seed", base, n, len(body))

# сводка по кэшу
for d in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, d)
    if not os.path.isdir(p):
        continue
    pages = sorted(f for f in os.listdir(p) if f.endswith(".txt"))
    bad = sum(1 for f in pages if "[OCR FAILED]" in io.open(os.path.join(p, f), encoding="utf-8", errors="ignore").read())
    print(d, "| страниц:", len(pages), "| failed:", bad)
