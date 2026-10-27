# -*- coding: utf-8 -*-
"""Достаёт тесты из PDF папки «на сайт/химия» и кладёт файлы рядом с ними.

Вход:  tools/chem/ocr/<имя PDF без расширения>.txt — распознанный текст
       (собирается ocr_chem_folder.py; страницы из transcripts подцеплены
       скриптом seed_from_transcripts.py)
Выход: <папка>/<имя PDF>_тесты.txt   — читаемые тесты по темам
       <папка>/<имя PDF>_тесты.json  — структурированные вопросы
       <папка>/Тесты_химия_все.json  — сводный файл по всем документам

Запуск: PYTHONIOENCODING=utf-8 python tools/chem/build_tests.py
"""
import hashlib
import importlib.util
import io
import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "ocr")
CHEM_DIR = r"C:\Users\MISTACEN\Documents\deepseek-harness\default-workspace\на сайт\химия"

# --- подключаем парсер из build_part1.py -------------------------------------
spec = importlib.util.spec_from_file_location("bp1", os.path.join(HERE, "build_part1.py"))
bp1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bp1)

THEME_RE = bp1.THEME_RE
QNUM_RE = bp1.QNUM_RE
MATCH_RE = bp1.MATCH_RE
norm_text = bp1.norm_text

PAGE_INLINE_RE = re.compile(r"\[\s*стр\.?\s*\d+\s*\]", re.I)
RIGHT_MARK = re.compile(r"\s+([А-ЯЁ])\.\s+(.+)$")
LETTER_LINE = re.compile(r"^\s*([А-ЯЁ])\.")


def parse_questions(block_lines):
    """[{kind, num, text, options} | {kind, match, left, right}] с учётом
    двухколоночной вёрстки: «1. исходный   А. вариант» в одной строке."""
    items = []
    i, n = 0, len(block_lines)
    while i < n:
        line = PAGE_INLINE_RE.sub("", block_lines[i]).strip()
        if not line:
            i += 1
            continue
        mm = MATCH_RE.match(line)
        qm = QNUM_RE.match(line)
        if mm:
            num_a, num_b = int(mm.group(1)), int(mm.group(2))
            left, right = [], []
            i += 1
            while i < n:
                l2 = PAGE_INLINE_RE.sub("", block_lines[i]).strip()
                if not l2:
                    i += 1
                    continue
                if MATCH_RE.match(l2):
                    break
                q_next = QNUM_RE.match(l2)
                if q_next and int(q_next.group(1)) > num_b:
                    break
                if l2.startswith(("Тема ", "ОТВЕТЫ")):
                    break
                lm = re.match(r"^\s*(\d{1,2})[.)]\s*(.*)$", l2)
                if lm:
                    rest = lm.group(2).strip()
                    rm = RIGHT_MARK.search(rest)
                    if rm:
                        left.append(rest[:rm.start()].strip())
                        right.append(rm.group(2).strip())
                    else:
                        left.append(rest)
                    i += 1
                    continue
                rm2 = LETTER_LINE.match(l2)
                if rm2:
                    right.append(LETTER_LINE.sub("", l2).strip())
                    i += 1
                    continue
                if right:
                    right[-1] += " " + l2
                elif left:
                    left[-1] += " " + l2
                i += 1
            items.append({"kind": "match", "num": num_a, "num_to": num_b,
                          "left": left, "right": right})
            continue
        if qm:
            num = int(qm.group(1))
            text_parts = [qm.group(2)]
            options = []
            i += 1
            while i < n:
                l2 = PAGE_INLINE_RE.sub("", block_lines[i]).strip()
                if not l2:
                    i += 1
                    continue
                if MATCH_RE.match(l2):
                    break
                q_next = QNUM_RE.match(l2)
                om = re.match(r"^\s*([1-9])\)\s*(.*)$", l2)
                if om and not options and re.match(r"^\s*1\)\s", l2) and re.search(r"\s[2-9]\)\s", l2):
                    parts = re.split(r"\s+(?=[1-9]\)\s)", l2)
                    for p in parts:
                        pm = re.match(r"([1-9])\)\s*(.*)$", p.strip())
                        if pm:
                            options.append(pm.group(2).strip())
                    i += 1
                    continue
                if om:
                    options.append(om.group(2).strip())
                    i += 1
                    continue
                if q_next and int(q_next.group(1)) > num:
                    break
                if l2.startswith(("Тема ", "ОТВЕТЫ", "ПРИЛОЖЕНИЯ")):
                    break
                if options:
                    options[-1] += " " + l2
                else:
                    text_parts.append(l2)
                i += 1
            items.append({"kind": "mcq" if options else "open", "num": num,
                          "text": norm_text(" ".join(text_parts)), "options": options})
            continue
        i += 1
    return items

PAGE_RE = re.compile(r"^\s*=+\s*(СТРАНИЦА|chem\d)", re.I)
ANS_RE = re.compile(r"(\d{1,3})\s*=\s*([^;|=]{1,120});")


def md5(path):
    h = hashlib.md5()
    with io.open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def unique_pdfs():
    seen, out = set(), []
    for name in sorted(os.listdir(CHEM_DIR)):
        if not name.lower().endswith(".pdf"):
            continue
        path = os.path.join(CHEM_DIR, name)
        d = md5(path)
        if d in seen:
            continue
        seen.add(d)
        out.append(path)
    return out


def split_theme_blocks(lines):
    """[(key, title, [lines])] — заголовок «Тема X.Y» начинает блок.
    Строки до первого заголовка попадают в блок «—» (продолжение темы
    с предыдущего разворота). Секция «ОТВЕТЫ» не обрывает разбор:
    эталоны читаются отдельным проходом, а их строки не похожи на вопросы."""
    blocks = []
    cur_key, cur_title, cur = None, "", []
    started = False
    for line in lines:
        s = line.strip()
        m = THEME_RE.match(line)
        if m and (m.group(1).count(".") == 1 or "." not in m.group(1)):
            if cur_key:
                blocks.append((cur_key, cur_title, cur))
            cur_key = m.group(1)
            title = re.sub(r"ОТВЕТЫ ТЕСТОВОГО КОНТРОЛЯ|ОТВЕТЫ", "", m.group(2), flags=re.I)
            title = re.sub(r"\.{3,}\s*\d*", " ", title).strip(" .:-")
            cur_title = norm_text(title) or cur_title
            cur = []
            started = True
            continue
        if started:
            cur.append(line)
        elif s:
            if cur_key is None:
                cur_key, cur_title = "—", "вопросы без заголовка темы"
            cur.append(line)
    if cur_key:
        blocks.append((cur_key, cur_title, cur))
    return blocks


def parse_doc(text):
    """→ (themes, answers) ; themes: key → {title, questions}"""
    lines = [l.replace("\r", "") for l in text.split("\n")]
    lines = [l for l in lines if not PAGE_RE.match(l)]
    lines = [PAGE_INLINE_RE.sub("", l) for l in lines]

    answers = {}
    cur = None
    for line in lines:
        s = line.strip()
        m = THEME_RE.match(s)
        if m and not QNUM_RE.match(s):
            cur = m.group(1)
            continue
        if cur is None:
            continue
        for num, val in ANS_RE.findall(line):
            answers.setdefault(cur, {})[int(num)] = norm_text(val)

    blocks = split_theme_blocks(lines)
    themes = {}
    seen = set()
    if not blocks:
        # документ без заголовков тем — весь текст одним блоком
        blocks = [("—", "вопросы без заголовка темы", lines)]
    for key, title, block in blocks:
        for q in parse_questions(block):
            label = norm_text(q.get("text") or "|".join(q.get("left") or []) or str(q.get("num")))
            if not label:
                continue
            sig = (key, label)
            if sig in seen:
                continue
            seen.add(sig)
            th = themes.setdefault(key, {"title": title, "questions": []})
            # заголовок из оглавления (с точками-выносками) не берём
            if re.search(r"\.{4,}", th["title"]) and not re.search(r"\.{4,}", title):
                th["title"] = title
            th["questions"].append(q)

    for key, th in themes.items():
        ans = answers.get(key, {})
        for q in th["questions"]:
            if q["kind"] == "mcq":
                a = ans.get(q["num"])
                if a:
                    q["answer_raw"] = a
            elif q["kind"] == "match":
                vals = [ans.get(n) for n in range(q["num"], q.get("num_to", q["num"]) + 1)]
                if any(v is not None for v in vals):
                    q["answers_raw"] = vals
    return themes, answers


LETTERS = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ"


def letter(i):
    return LETTERS[i] if i < len(LETTERS) else str(i + 1) + "."


def render_text(pdf_name, page_count, themes, answers):
    out = []
    out.append(f"ТЕСТЫ ИЗ ДОКУМЕНТА: {pdf_name}")
    out.append(f"Страниц: {page_count}")
    out.append("")
    if not themes:
        out.append("(не удалось выделить вопросы)")
        return "\n".join(out)
    order = sorted(themes, key=lambda k: ([999], [0]) if k == "—" else
                   ([int(x) for x in k.split(".")], [0]) if re.match(r"^[\d.]+$", k) else ([999], [1]))
    for key in order:
        th = themes[key]
        head = f"Тема {key}. {th['title']}" if key != "—" else th["title"]
        out.append("=" * 70)
        out.append(head.strip())
        out.append("=" * 70)
        ans = answers.get(key, {})
        for q in th["questions"]:
            if q["kind"] == "match":
                out.append(f"\n{q['num']}-{q.get('num_to', q['num'])}. Установите соответствие")
                if q.get("left"):
                    out.append("  Левая колонка:")
                    for i, x in enumerate(q["left"], 1):
                        out.append(f"    {i}. {x}")
                if q.get("right"):
                    out.append("  Правая колонка:")
                    for i, x in enumerate(q["right"]):
                        out.append(f"    {letter(i)}. {x}")
                vals = q.get("answers_raw")
                if vals:
                    pairs = [f"{n}={v}" for n, v in zip(range(q["num"], q.get("num_to", q["num"]) + 1), vals) if v is not None]
                    if pairs:
                        out.append("  Ответ: " + "; ".join(pairs))
            else:
                out.append(f"\n{q['num']}. {q.get('text', '')}")
                for i, opt in enumerate(q.get("options") or [], 1):
                    out.append(f"    {i}) {opt}")
                if q.get("answer_raw"):
                    out.append(f"  Ответ: {q['answer_raw']}")
        if ans:
            out.append("\nЭталонные ответы темы:")
            for n in sorted(ans):
                out.append(f"  {n}={ans[n]}")
        out.append("")
    return "\n".join(out)


LEGACY_DIRS = {
    "chem1": ["Отсканированный документ 2"],
    "chem2": ["Отсканированный документ 3"],
    "chem3": ["Отсканированный документ"],
}


def load_text(stem):
    """Собираем распознанный текст: сначала цельный файл, потом страницы кэша."""
    combined = os.path.join(OUT, stem + ".txt")
    if os.path.exists(combined):
        return io.open(combined, encoding="utf-8", errors="ignore").read()
    parts = []
    cands = [stem]
    if stem != stem.rstrip(" ."):
        cands.append(stem.rstrip(" ."))
    for d in cands + LEGACY_DIRS.get(stem, []):
        p = os.path.join(OUT, d)
        if not os.path.isdir(p):
            continue
        try:
            files = os.listdir(p)
        except OSError:
            continue
        pages = sorted(f for f in files if re.match(r"page-\d+\.txt$", f))
        for f in pages:
            body = io.open(os.path.join(p, f), encoding="utf-8", errors="ignore").read()
            if "[OCR FAILED]" in body:
                continue
            n = int(f[5:7])
            parts.append(f"\n\n===== СТРАНИЦА {n} =====\n\n" + body)
        if parts:
            break
    return "".join(parts)


def main():
    pdfs = unique_pdfs()
    print("уникальных PDF:", len(pdfs))
    all_docs = {}
    for path in pdfs:
        stem = os.path.splitext(os.path.basename(path))[0]
        text = load_text(stem)
        if not text.strip():
            print(f"  !! нет распознанного текста для {stem} — пропуск")
            continue
        page_count = len(re.findall(r"^=====\s*СТРАНИЦА", text, re.M))
        themes, answers = parse_doc(text)
        nq = sum(len(t["questions"]) for t in themes.values())
        print(f"  {stem}: тем {len(themes)}, вопросов {nq}, эталонов {sum(len(v) for v in answers.values())}")

        txt_path = os.path.join(CHEM_DIR, stem + "_тесты.txt")
        io.open(txt_path, "w", encoding="utf-8", newline="\n").write(
            render_text(os.path.basename(path), page_count, themes, answers))
        json_path = os.path.join(CHEM_DIR, stem + "_тесты.json")
        io.open(json_path, "w", encoding="utf-8", newline="\n").write(
            json.dumps({"source": os.path.basename(path), "pages": page_count,
                        "themes": themes}, ensure_ascii=False, indent=1))
        all_docs[stem] = {"source": os.path.basename(path), "pages": page_count,
                          "themes": themes}
        print("    →", os.path.basename(txt_path), "|", os.path.basename(json_path))

    merged = os.path.join(CHEM_DIR, "Тесты_химия_все.json")
    io.open(merged, "w", encoding="utf-8", newline="\n").write(
        json.dumps(all_docs, ensure_ascii=False, indent=1))
    print("сводный →", merged)


if __name__ == "__main__":
    main()
