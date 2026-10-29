# -*- coding: utf-8 -*-
"""OCR всех PDF из папки «на сайт/химия» с постраничным кэшем.

Запуск:  PYTHONIOENCODING=utf-8 python tools/chem/ocr_chem_folder.py [подстрока]
Выход:  tools/chem/ocr/<каноническое_имя>/page-NN.txt  (+ page-NN.done)
        tools/chem/ocr/<каноническое_имя>.txt          (всё вместе)

Дубликаты по md5 склеиваются: «Отсканированный документ*.pdf» == chemN.pdf.
Уже распознанные ранее страницы (кэш по basename) переиспользуются.
"""
import hashlib
import io
import os
import re
import sys
import time

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
CHEM_DIR = r"C:\Users\MISTACEN\Documents\deepseek-harness\default-workspace\на сайт\химия"
OUT = os.path.join(HERE, "ocr")

src = io.open(os.path.join(HERE, "ocr_scans.py"), encoding="utf-8").read()
src = src.replace('if __name__ == "__main__":\n    main()', "")
G = {"__file__": os.path.join(HERE, "ocr_scans.py")}
exec(compile(src, "ocr_scans.py", "exec"), G)
ocr_image = G["ocr_image"]
KEY = G["KEY"]

# md5 → каноническое имя (имя, под которым файлы лежат в папке)
CANON = {
    "126f85f3361f9316ea0a6100431a0ab4": "chem1.pdf",
    "5c62927034286b5d62e0fe73705cc619": "chem2.pdf",
    "1e80eb5267f239f225ae0be0d79d2374": "chem3.pdf",
    "380a480d8e68ad49f97399f639f44fd4": "166_Объясните,_какими_свойствами_ацетоуксусного_эфира_обуслов_.pdf",
    "6201c4319c53de398c3ea5b574e3d1d0": "Д) прегнан ..pdf",
    "ecaeec5e2cf345a33706fae31c525670": "МИНИСТЕРСТВО_ОБРАЗОВАНИЯ_РОССИЙСКОЙ_ФЕДЕРАЦИИ.pdf",
    "f0e75963b181b4edf7a59f5675e26f25": "очной_кислоты_С_НАД_Какова_роль_нуклеотидных_кофермен_.pdf",
}
# каноническое имя → дополнительные каталоги кэша (старые прогоны)
LEGACY_DIRS = {
    "chem1.pdf": ["Отсканированный документ 2"],
    "chem2.pdf": ["Отсканированный документ 3"],
    "chem3.pdf": ["Отсканированный документ"],
}


def md5(path: str) -> str:
    h = hashlib.md5()
    with io.open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_cache(dirs, n):
    for d in dirs:
        p = os.path.join(d, f"page-{n:02d}.txt")
        done = os.path.join(d, f"page-{n:02d}.done")
        if os.path.exists(p) and os.path.exists(done):
            t = io.open(p, encoding="utf-8", errors="ignore").read().strip()
            if t and "[OCR FAILED]" not in t:
                return t
    return None


def main() -> None:
    only = sys.argv[1] if len(sys.argv) > 1 else ""
    files = [f for f in sorted(os.listdir(CHEM_DIR)) if f.lower().endswith(".pdf")]
    seen, jobs = set(), []
    for name in files:
        path = os.path.join(CHEM_DIR, name)
        digest = md5(path)
        if digest in seen:
            continue
        seen.add(digest)
        canon = CANON.get(digest, name)
        jobs.append((path, canon))
    if only and re.fullmatch(r"[\d,]+", only):
        # индекс по списку уникальных PDF — чтобы не передавать кириллицу через argv
        idx = [int(x) for x in only.split(",")]
        jobs = [j for i, j in enumerate(jobs) if i in idx]
    elif only:
        jobs = [j for j in jobs if only in j[1]]
    if not jobs:
        print("нет задач по фильтру", only, flush=True)
        return
    print("задач:", len(jobs), [os.path.basename(j[1]) for j in jobs], flush=True)

    for path, canon in jobs:
        base = re.sub(r"\.pdf$", "", canon, flags=re.I)
        page_dir = os.path.join(OUT, base)
        os.makedirs(page_dir, exist_ok=True)
        legacy = [os.path.join(OUT, d) for d in LEGACY_DIRS.get(canon, [])]
        doc = pymupdf.open(path)
        print(f"== {canon} — {doc.page_count} стр", flush=True)
        out = []
        for i, page in enumerate(doc, 1):
            txt_path = os.path.join(page_dir, f"page-{i:02d}.txt")
            text = read_cache([page_dir] + legacy, i)
            if text is None:
                pix = page.get_pixmap(dpi=110)
                png = pix.tobytes("png")
                t0 = time.time()
                text = ocr_image(KEY, png)
                if not text or "[OCR FAILED]" in text:
                    print(f"  стр {i}: OCR FAILED", flush=True)
                    time.sleep(3)
                    text = ocr_image(KEY, png)
                io.open(txt_path, "w", encoding="utf-8", newline="\n").write(text)
                io.open(os.path.join(page_dir, f"page-{i:02d}.done"), "w").write("1")
                print(f"  стр {i}: {round(time.time() - t0, 1)}с, {len(text)} симв.", flush=True)
                time.sleep(0.3)
            else:
                print(f"  стр {i}: кэш ({len(text)} симв.)", flush=True)
            out.append(f"\n\n===== СТРАНИЦА {i} =====\n\n" + text)
        io.open(os.path.join(OUT, base + ".txt"), "w", encoding="utf-8", newline="\n").write("".join(out))
        print(f"  → ocr/{base}.txt", flush=True)
        doc.close()


if __name__ == "__main__":
    main()
