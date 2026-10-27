# -*- coding: utf-8 -*-
"""Парсер «Органическая и физическая химия. Сборник тестовых заданий. Часть I»
(ДВГМУ, 2016) из транскрипций tools/chem/{ocr,transcripts}.

Выход: tools/chem/part1-questions.json
  { themes: {«1.1»: {title, questions: [{kind, num, text, options, left, right, answer}] } }
Ответы: «N=значение;» под заголовками «Тема X.Y» (value — номер варианта, буква,
текст или последовательность типа 213).
"""
import glob
import io
import json
import os
import re
import sys
import unicodedata

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHEM = os.path.join(REPO, "tools", "chem")

SOURCES = []
# 1) Gemini OCR doc2 (темы 3.5–3.10): tools/chem/ocr/<mojibake>/page-*.txt + combined
for d in glob.glob(os.path.join(CHEM, "ocr", "*")):
    if os.path.isdir(d):
        SOURCES.append(("doc2", sorted(glob.glob(os.path.join(d, "page-*.txt")))))
# 2) Ручные транскрипции
for name in ["chem2-12-17.txt", "chem2-18-24.txt", "chem3-01-12.txt", "chem3-13-24.txt"]:
    p = os.path.join(CHEM, "transcripts", name)
    if os.path.exists(p):
        SOURCES.append((name[:-4], [p]))
    else:
        print(f"!! нет {p}")

THEME_RE = re.compile(r"^\s*Тема\s+(\d+(?:\.\d+)?)\.?\s*(.*)$")
QNUM_RE = re.compile(r"^\s*(\d{1,3})[.)]\s+(.*)$")
MATCH_RE = re.compile(r"^\s*(\d{1,3})\s*[-–]\s*(\d{1,3})\.\s*(?:Установите соответствие|Установите  соответствие)", re.I)
OPT_SPLIT = re.compile(r"(?:^|\s)([1-9])\)\s*")
LETTER = {"А": "A", "Б": "B", "В": "C", "Г": "D", "Д": "E", "Е": "F"}


def norm_text(s: str) -> str:
    s = unicodedata.normalize("NFC", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def load_lines():
    for tag, files in SOURCES:
        for path in files:
            text = io.open(path, encoding="utf-8", errors="ignore").read()
            yield tag, path, text


def split_theme_blocks(lines):
    """[(theme_key, theme_title, [block lines])] — заголовок Тема X.Y начинает блок."""
    blocks = []
    cur_key, cur_title, cur = None, "", []
    for line in lines:
        m = THEME_RE.match(line)
        if m and (m.group(1).count(".") == 1 or "." not in m.group(1)):
            if cur_key:
                blocks.append((cur_key, cur_title, cur))
            cur_key = m.group(1)
            title = re.sub(r"ОТВЕТЫ ТЕСТОВОГО КОНТРОЛЯ|ОТВЕТЫ", "", m.group(2), flags=re.I).strip(" .:-")
            cur_title = norm_text(title) or cur_title
            cur = []
            continue
        if cur_key is not None:
            cur.append(line)
    if cur_key:
        blocks.append((cur_key, cur_title, cur))
    return blocks


def parse_questions(block_lines):
    """Возвращает [{num, text, options|left/right, is_match}] из текста блока темы."""
    # Нормализуем строки: склеиваем переносы вопросов позже.
    items = []
    i = 0
    n = len(block_lines)
    while i < n:
        line = block_lines[i].strip()
        mm = MATCH_RE.match(line)
        qm = QNUM_RE.match(line)
        if mm:
            num_a, num_b = int(mm.group(1)), int(mm.group(2))
            left, right, mode = [], [], None  # mode: left|right
            i += 1
            while i < n:
                l2 = block_lines[i].strip()
                if MATCH_RE.match(l2) or (QNUM_RE.match(l2) and not re.match(r"^\s*1[.)]\s", l2) and not re.match(r"^\s*А[.)]", l2)):
                    # новый вопрос/блок — но осторожно: пункты левого списка тоже «1. …»
                    # критерий конца: строка-вопрос со следующим номером > num_b, или заголовок
                    m2 = QNUM_RE.match(l2)
                    if m2 and int(m2.group(1)) > num_b and not l2.lower().startswith(("источник", "вид ")):
                        break
                if re.match(r"^\s*[А-ДЁ][.)]\s*", l2):
                    mode = "right"
                    right.append(re.sub(r"^\s*[А-ДЁ][.)]\s*", "", l2).strip())
                    i += 1
                    continue
                m_left = re.match(r"^\s*(\d)[.)]\s*(.+)$", l2)
                if m_left:
                    mode = "left"
                    left.append(m_left.group(2).strip())
                    i += 1
                    continue
                if l2 and mode == "left" and left:
                    left[-1] += " " + l2
                    i += 1
                    continue
                if l2 and mode == "right" and right:
                    right[-1] += " " + l2
                    i += 1
                    continue
                i += 1
            items.append({"kind": "match", "num": num_a, "num_to": num_b, "left": left, "right": right})
            continue
        if qm:
            num = int(qm.group(1))
            text_parts = [qm.group(2)]
            i += 1
            options = []
            while i < n:
                l2 = block_lines[i].strip()
                if MATCH_RE.match(l2):
                    break
                q_next = QNUM_RE.match(l2)
                # inline-варианты в той же строке: «1) а 2) б …»
                if not options and OPT_SPLIT.search(l2) and re.match(r"^\s*1\)\s", l2):
                    parts = [p.strip() for p in re.split(r"(?:^|\s)(?=[1-9]\)\s)", l2) if p.strip()]
                    for p in parts:
                        om = re.match(r"([1-9])\)\s*(.*)$", p)
                        if om:
                            options.append(om.group(2).strip())
                    i += 1
                    continue
                om = re.match(r"^\s*([1-9])\)\s*(.*)$", l2)
                if om:
                    options.append(om.group(2).strip())
                    i += 1
                    continue
                if q_next and int(q_next.group(1)) == num + 1:
                    break
                if q_next and int(q_next.group(1)) > num:
                    break
                if l2.startswith(("Тема ", "ПРИЛОЖЕНИЯ", "ОТВЕТЫ")):
                    break
                if l2:
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


def parse_answers():
    """theme -> {num: answer} из всех источников (блоки «Тема X.Y» + строки N=значение;)."""
    keys = {}
    for tag, path, text in load_lines():
        lines = text.replace("\r", "").split("\n")
        cur = None
        for line in lines:
            m = THEME_RE.match(line.strip())
            if m and not QNUM_RE.match(line.strip()):
                cur = m.group(1)
                continue
            if cur is None:
                continue
            for pair in re.findall(r"(\d{1,3})\s*=\s*([^;|=]{1,120});", line):
                keys.setdefault(cur, {})[int(pair[0])] = norm_text(pair[1])
    return keys


def main():
    keys = parse_answers()
    print("тем с эталонами:", len(keys), "| всего эталонов:", sum(len(v) for v in keys.values()))

    themes = {}
    seen = set()
    duplicates = 0
    for tag, path, text in load_lines():
        lines = [l.replace("\r", "") for l in text.split("\n")]
        # маркеры страниц убираем
        lines = [l for l in lines if not re.match(r"^\s*=+\s*(СТРАНИЦА|chem\d)", l)]
        for key, title, block in split_theme_blocks(lines):
            for q in parse_questions(block):
                qkey = (key, norm_text(q.get("text") or (q.get("left") and "|".join(q["left"])) or str(q["num"])))
                if qkey in seen:
                    duplicates += 1
                    continue
                seen.add(qkey)
                theme = themes.setdefault(key, {"title": title, "questions": []})
                q["source"] = tag
                theme["questions"].append(q)

    total = 0
    for key in sorted(themes):
        th = themes[key]
        ans = keys.get(key, {})
        matched = 0
        for q in th["questions"]:
            if q["kind"] == "mcq":
                a = ans.get(q["num"])
                if a:
                    q["answer_raw"] = a
                    matched += 1
            elif q["kind"] == "match":
                vals = [ans.get(n) for n in range(q["num"], q["num_to"] + 1)]
                if any(vals):
                    q["answers_raw"] = vals
                    matched += 1
        total += len(th["questions"])
        print(f"  Тема {key}: {len(th['questions'])} вопросов, эталонов под них {matched}, назв.: {th['title'][:50]}")
    print(f"ИТОГО вопросов: {total} (дублей снято: {duplicates})")

    out = os.path.join(CHEM, "part1-questions.json")
    io.open(out, "w", encoding="utf-8", newline="\n").write(
        json.dumps({"themes": themes}, ensure_ascii=False, indent=1))
    print("→", out)


if __name__ == "__main__":
    main()
