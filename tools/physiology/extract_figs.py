# -*- coding: utf-8 -*-
"""Извлечение рисунков из методичек для лекций без иллюстраций.

Источники:
  - public/library/physiology/vozbudimye-sistemy.docx (media по порядку документа)
  - физиологии/Физиология_ЦНС_МБХ_….pdf (pymupdf, картинки страниц)
  - физиологии/Физиол.сенс.сист.ВНД23МБХWord (4).pdf (pymupdf)

Каждому рисунку приписывается контекст: ближайший предыдущий заголовок
(для docx) или страница + текст рядом (для pdf). Результат — JSON-манифест
tools/physiology/figs-manifest.json: [{source, media, page, w, h, heading, ctx}]

Запуск: python -E tools/physiology/extract_figs.py           # манифест без записи картинок
        python -E tools/physiology/extract_figs.py --write   # + сохранить в public/library/lectures/<slug>/figs/
"""
import io
import json
import re
import sys
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LIB = REPO / "public" / "library" / "physiology"
PHYSIO_SRC = Path(r"C:\Users\MISTACEN\Documents\deepseek-harness\default-workspace\физиологии")
LECTURES = REPO / "public" / "library" / "lectures"
OUT = Path(__file__).resolve().parent / "figs-manifest.json"
WRITE = "--write" in sys.argv

MIN_SIZE = 220  # px: мельче — декоративные (стрелки, рамки)

import warnings  # noqa: E402


def slugify(s: str, limit: int = 48) -> str:
    """Транслитерация для имени файла."""
    table = {
        "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
        "з": "z", "и": "i", "й": "j", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
        "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "c",
        "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "", "э": "e",
        "ю": "yu", "я": "ya",
    }
    s = s.lower()
    out = []
    for ch in s:
        if ch in table:
            out.append(table[ch])
        elif ch.isalnum() and ord(ch) < 128:
            out.append(ch)
        else:
            out.append("-")
    slug = re.sub(r"-+", "-", "".join(out)).strip("-")
    return slug[:limit].strip("-")


def extract_docx(path: Path) -> list[dict]:
    """Рисунки docx в порядке появления, с ближайшим предыдущим заголовком."""
    import xml.etree.ElementTree as ET

    NS = {
        "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
        "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    }
    z = zipfile.ZipFile(path)
    doc = z.read("word/document.xml")
    rels_xml = z.read("word/_rels/document.xml.rels")
    rels = {}
    for rel in ET.fromstring(rels_xml):
        rels[rel.get("Id")] = rel.get("Target")

    media = {}
    for name in z.namelist():
        if name.startswith("word/media/"):
            data = z.read(name)
            media[name] = data

    # PIL для размеров (fallback: расширение)
    try:
        from PIL import Image
        import io as _io

        def img_size(name: str, data: bytes):
            try:
                im = Image.open(_io.BytesIO(data))
                return im.size
            except Exception:
                return (0, 0)
    except ImportError:
        def img_size(name: str, data: bytes):
            return (0, 0)

    root = ET.fromstring(doc)
    items = []
    heading = ""
    para_texts = []
    for para in root.iter(f"{{{NS['w']}}}p"):
        text = "".join(t.text or "" for t in para.iter(f"{{{NS['w']}}}t")).strip()
        pstyle = para.find(f"{{{NS['w']}}}pPr/{{{NS['w']}}}pStyle")
        style = pstyle.get(f"{{{NS['w']}}}val") if pstyle is not None else ""
        blips = list(para.iter(f"{{{NS['a']}}}blip"))
        if blips and text:
            pass
        if blips:
            for blip in blips:
                rid = blip.get(f"{{{NS['r']}}}embed")
                target = rels.get(rid)
                if not target:
                    continue
                target_name = "word/" + target.lstrip("/")
                data = media.get(target_name)
                if not data:
                    continue
                ctx = (para_texts[-1] if para_texts else "")[:180]
                items.append({
                    "source": path.name,
                    "media": Path(target).name,
                    "heading": heading[:120],
                    "ctx": ctx,
                    **dict(zip(("w", "h"), img_size(target_name, data))),
                })
            para_texts = []
            continue
        if text:
            if style.lower().startswith("heading") or style in ("1", "2", "3", "Title"):
                heading = text
            para_texts.append(text)
    return items


def extract_pdf(path: Path) -> list[dict]:
    import pymupdf

    doc = pymupdf.open(path)
    items = []
    for page in doc:
        for img in page.get_images(full=True):
            xref = img[0]
            try:
                pix = pymupdf.Pixmap(doc, xref)
                w, h = pix.width, pix.height
            except Exception:
                continue
            if w < MIN_SIZE or h < MIN_SIZE:
                continue
            # текст рядом с картинкой
            rects = page.get_image_rects(xref)
            ctx = ""
            if rects:
                r = rects[0]
                ctx = page.get_text(clip=pymupdf.Rect(0, max(0, r.y0 - 60), page.rect.width, min(page.rect.height, r.y1 + 30)))
            ctx = re.sub(r"\s+", " ", ctx).strip()[:180]
            heading_line = ""
            m = re.search(r"(§\s*\d+\.[^\.]{3,80}|[А-ЯЁ][А-ЯЁ\s,\-()]{8,80})", ctx)
            if m:
                heading_line = m.group(1).strip()
            items.append({
                "source": path.name,
                "page": page.number + 1,
                "w": w,
                "h": h,
                "heading": heading_line[:120],
                "ctx": ctx,
            })
    doc.close()
    return items


def main() -> None:
    all_items = []
    items = extract_docx(LIB / "vozbudimye-sistemy.docx")
    print(f"vozbudimye-sistemy.docx: {len(items)} media")
    all_items += [{"slug": "vozbudimye-sistemy", **it} for it in items]

    cns_pdf = PHYSIO_SRC / "Физиология_ЦНС_МБХ_для_практических_работ_и_самостоятельной_работы.pdf"
    items = extract_pdf(cns_pdf)
    print(f"ЦНС pdf: {len(items)} картинок >= {MIN_SIZE}px")
    all_items += [{"slug": "cns", **it} for it in items]

    sense_pdf = PHYSIO_SRC / "Физиол.сенс.сист.ВНД23МБХWord (4).pdf"
    items = extract_pdf(sense_pdf)
    print(f"сенсорные pdf: {len(items)} картинок >= {MIN_SIZE}px")
    all_items += [{"slug": "sensornye-vnd", **it} for it in items]

    io.open(OUT, "w", encoding="utf-8", newline="\n").write(
        json.dumps(all_items, ensure_ascii=False, indent=1)
    )
    print("манифест:", OUT, f"({len(all_items)} записей)")
    if WRITE:
        for it in all_items:
            slug = it["slug"]
            # имя: fig-<порядок в slug>-<slug из контекста>
            ctx_slug = slugify(it.get("heading") or it.get("ctx") or "fig") or "fig"
            n = sum(1 for x in all_items if x["slug"] == slug)  # noqa: F841
            print(slug, it.get("media") or f"page{it.get('page')}", it["w"], "x", it["h"], "|", it["heading"][:60])


if __name__ == "__main__":
    main()
