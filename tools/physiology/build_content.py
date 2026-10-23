#!/usr/bin/env python3
"""Build the physiology practice dataset from the six department manuals.

Source files are committed under public/library/physiology (the same files the
site offers for download).  The script normalises them into

    public/content/physiology/<slug>.json
    public/content/physiology/index.json

Structure per manual: sections -> lessons -> self-study questions, practical
work, situational tasks, reference notes; plus question banks whose answers are
recovered from the printed answer keys when they are machine-readable.

Requires: python-docx and antiword (for legacy .doc sources).
Run: python tools/physiology/build_content.py
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIB = ROOT / "public" / "library" / "physiology"
OUT = ROOT / "public" / "content" / "physiology"

MANUALS = [
    {
        "slug": "vozbudimye-sistemy",
        "title": "Физиология возбудимых систем",
        "subtitle": "Введение в физиологию, физиология клетки, возбудимых тканей, мышц и синапсов",
        "semester": 3,
        "file": "vozbudimye-sistemy.docx",
        "kind": "docx",
        "year": 2023,
        "hours": 44,
    },
    {
        "slug": "cns",
        "title": "Физиология центральной нервной системы",
        "subtitle": "Рефлекс, координация, соматическая и вегетативная нервная система",
        "semester": 3,
        "file": "cns.doc",
        "kind": "doc",
        "year": 2023,
        "hours": 37,
    },
    {
        "slug": "krov-endokrin",
        "title": "Физиология крови и эндокринной системы",
        "subtitle": "Система крови, гемостаз, иммунитет, гуморальная регуляция",
        "semester": 3,
        "file": "krov-endokrin.doc",
        "kind": "doc",
        "year": 2022,
        "hours": 40,
        "extra_anchors": [
            {
                "needle": "Методики подсчёта эритроцитов и лейкоцитов",
                "marker": "Тема занятия 2. Физиология форменных элементов крови",
            }
        ],
    },
    {
        "slug": "dyhanie-vydelenie",
        "title": "Физиология дыхания и выделения",
        "subtitle": "Внешнее дыхание, газообмен, регуляция дыхания, почки и выделение",
        "semester": 4,
        "file": "dyhanie-vydelenie.doc",
        "kind": "doc",
        "year": 2023,
        "hours": 34,
    },
    {
        "slug": "pishchevarenie-obmen",
        "title": "Физиология пищеварения, обмена веществ и терморегуляции",
        "subtitle": "Пищеварительный конвейер, обмен энергии, питание, терморегуляция",
        "semester": 4,
        "file": "pishchevarenie-obmen.docx",
        "kind": "docx",
        "year": 2023,
        "hours": 48,
    },
    {
        "slug": "sensornye-vnd",
        "title": "Физиология сенсорных систем и высшей нервной деятельности",
        "subtitle": "Сенсорные системы, психофизиология, ВНД, поведение",
        "semester": 4,
        "file": "sensornye-vnd.doc",
        "kind": "doc",
        "year": 2023,
        "hours": 48,
    },
]

REFERENCE = {
    "title": "Основы физиологии человека. Том 1",
    "author": "Н. А. Агаджанян и др.",
    "file": "agadzhanyan-fiziologiya-t1.pdf",
}


# ---------------------------------------------------------------------------
# extraction


def clean(text: str) -> str:
    text = text.replace("\u00a0", " ").replace("\t", " ")
    text = re.sub(r"[ ]{2,}", " ", text)
    return text.strip().strip("|").strip()


def docx_lines(path: Path) -> list[str]:
    import docx  # python-docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    document = docx.Document(str(path))
    lines: list[str] = []
    for child in document.element.body.iterchildren():
        tag = child.tag.split("}")[-1]
        if tag == "p":
            text = Paragraph(child, document).text.strip()
            if text:
                lines.append(text)
        elif tag == "tbl":
            table = Table(child, document)
            for row in table.rows:
                cells = [clean(c.text) for c in row.cells]
                line = " | ".join(cells).strip(" |")
                if line:
                    lines.append(line)
    return lines


def doc_lines(path: Path) -> list[str]:
    try:
        raw = subprocess.run(
            ["antiword", "-w", "0", "-m", "UTF-8.txt", str(path)],
            check=True,
            capture_output=True,
        ).stdout
    except (OSError, subprocess.CalledProcessError) as exc:  # pragma: no cover
        raise SystemExit(f"antiword is required to read {path.name}: {exc}") from exc
    return raw.decode("utf-8", errors="replace").splitlines()


def load_lines(manual: dict) -> list[str]:
    path = LIB / manual["file"]
    raw_lines = docx_lines(path) if manual["kind"] == "docx" else doc_lines(path)
    out: list[str] = []
    for raw in raw_lines:
        raw = raw.replace(chr(0xFFFD), "").replace(chr(0), "")
        table = raw.lstrip().startswith("|") or raw.count("|") >= 2
        line = clean(raw)
        if not line or re.fullmatch(r"\d{1,3}", line):
            continue
        out.append("TABLE| " + line if table else line)
    anchors = manual.get("extra_anchors") or []
    if anchors:
        expanded: list[str] = []
        for line in out:
            for anchor in anchors:
                if anchor["needle"] in line:
                    expanded.append(anchor["marker"])
                    break
            expanded.append(line)
        out = expanded
    return out


# ---------------------------------------------------------------------------
# markers

RE_SECTION = re.compile(r"^Раздел\s+(\d+)[.:]?\s*(.*)$", re.I)
RE_TOPIC = re.compile(
    r"^(?:Тема|ТЕМА)\s*(?:заняти[яе]|ЗАНЯТИЯ|ЗАНЯТИЕ)\s*[№:]?\s*(\d*)[.:]?\s*(.*)$"
)
RE_FINAL = re.compile(r"^(?:Итоговое|ИТОГОВОЕ)\s+занятие\s*[№:]?\s*(\d*)[.:]?\s*(.*)$", re.I)
RE_ACT = re.compile(r"^Актуальность\s+(?:темы|раздела)", re.I)
RE_GOALS = re.compile(r"^Учебные цели", re.I)
RE_QUEST = re.compile(
    r"^(?:Контрольные вопросы|Вопросы для самоподготовки|Вопросы для самостоятельной)",
    re.I,
)
RE_LIT = re.compile(r"^Рекомендуемая литература", re.I)
RE_NOTEBOOK = re.compile(r"^В тетради\b", re.I)
RE_REFS = re.compile(r"^Темы рефератов|^Тематика рефератов", re.I)
RE_INFO = re.compile(r"^Информационный блок", re.I)
RE_PRACT = re.compile(r"^(?:Практические работы|ПРАКТИЧЕСКИЕ РАБОТЫ)", re.I)
RE_SIT = re.compile(r"^Ситуационные задачи", re.I)
RE_BANK = re.compile(r"^(?:Банк тестовых заданий|БАНК ТЕСТОВЫХ ЗАДАНИЙ)", re.I)
RE_WORK = re.compile(r"^(?:Работа|РАБОТА)\s*(\d+)[.:]?\s*(.*)$")
RE_TOC = re.compile(r"^(?:Содержание|Оглавление)\s*:?\s*$", re.I)
RE_ANSWER_HEAD = re.compile(
    r"^(?:Эталоны ответов|Ответы на тестовые|Ответы к тестовым|Эталоны ответа)", re.I
)
RE_TEST_HEAD = re.compile(
    r"^(?:Тестовые задания|ТЕСТОВЫЕ ЗАДАНИЯ|Банк тестовых заданий|БАНК ТЕСТОВЫХ ЗАДАНИЙ|"
    r"Общие вопросы|Общая физиология|Частная физиология|Психофизиологические|"
    r"Тема\s*\d|Занятие\s*№?\s*\d|ЗАНЯТИЕ\s*№?\s*\d)",
    re.I,
)

STOP_MARKERS = (
    RE_ACT,
    RE_GOALS,
    RE_QUEST,
    RE_LIT,
    RE_NOTEBOOK,
    RE_REFS,
    RE_INFO,
    RE_PRACT,
    RE_SIT,
    RE_BANK,
)


def is_marker(line: str) -> bool:
    return any(pattern.match(line) for pattern in STOP_MARKERS)


def topic_match(line: str):
    return RE_TOPIC.match(line) or RE_FINAL.match(line)


def strip_table(line: str) -> str:
    return line[6:].strip() if line.startswith("TABLE|") else line


# ---------------------------------------------------------------------------
# study part


def split_title(lines: list[str], start: int, limit: int = 3) -> tuple[str, int]:
    parts: list[str] = []
    index = start
    while index < len(lines) and len(parts) < limit:
        line = strip_table(lines[index])
        if is_marker(line) or topic_match(line) or RE_SECTION.match(line):
            break
        if lines[index].startswith("TABLE|") or len(line) > 400:
            break
        parts.append(line)
        index += 1
        if line.endswith(".") and len(line) > 60:
            break
    return clean(" ".join(parts)), index


def numbered_items(block: list[str]) -> list[str]:
    items: list[list[str]] = []
    for line in block:
        if line.startswith("TABLE|"):
            continue
        match = re.match(r"^(\d{1,3})[.)]\s*(.*)$", line)
        if match:
            items.append([match.group(2).strip()])
        elif items:
            items[-1].append(line)
        else:
            items.append([line])
    return [clean(" ".join(item)) for item in items if len(clean(" ".join(item))) > 3]


def paragraph_items(block: list[str]) -> list[str]:
    items = []
    for line in block:
        if line.startswith("TABLE|"):
            continue
        text = re.sub(r"^\d{1,3}[.)]\s*", "", line).strip()
        if len(text) > 3:
            items.append(text)
    return items


def parse_practical(block: list[str]) -> list[dict]:
    works: list[dict] = []
    current: dict | None = None
    for line in block:
        if line.startswith("TABLE|"):
            if current is not None:
                current["body"].append(strip_table(line))
            continue
        match = RE_WORK.match(line)
        if match:
            if current:
                works.append(current)
            current = {"number": int(match.group(1)), "title": clean(match.group(2)), "body": []}
            continue
        if current is not None:
            current["body"].append(line)
    if current:
        works.append(current)
    for work in works:
        work["body"] = [line for line in work["body"] if len(line) > 2]
        if not work["title"]:
            work["title"] = work["body"][0][:180] if work["body"] else f"Работа {work['number']}"
            work["body"] = work["body"][1:]
    return works


def parse_study(lines: list[str], manual: dict) -> tuple[list[dict], list[dict]]:
    sections: list[dict] = []
    lessons: list[dict] = []
    section = {"number": 0, "title": "", "lesson_ids": []}
    sections.append(section)

    current: dict | None = None
    bucket: str | None = None
    buffers: dict[str, list[str]] = {}

    def push_bucket(name: str | None) -> None:
        if current is None or name is None:
            return
        block = buffers.get(name) or []
        if name == "actuality":
            current["actuality"] = clean(" ".join(block))[:4000]
        elif name == "goals":
            current["goals"] = clean(" ".join(block))[:4000]
        elif name == "questions":
            current["questions"] = paragraph_items(block)
        elif name == "tasks":
            current["tasks"] = paragraph_items(block)
        elif name == "essays":
            current["essays"] = paragraph_items(block)
        elif name == "notes":
            current["notes"] = [strip_table(line) for line in block]
        elif name == "practical":
            current["practical"] = parse_practical(block)
        elif name == "situational":
            current["situational"] = numbered_items(block)
        buffers[name] = []

    def start_lesson(title: str, number: int) -> dict:
        lesson = {
            "number": number,
            "title": title,
            "id": f"{manual['slug']}-{section['number']}-{number}",
            "actuality": "",
            "goals": "",
            "questions": [],
            "tasks": [],
            "practical": [],
            "situational": [],
            "essays": [],
            "notes": [],
        }
        lessons.append(lesson)
        section["lesson_ids"].append(lesson["id"])
        return lesson

    def finish_lesson() -> None:
        nonlocal current, bucket
        push_bucket(bucket)
        if current is not None:
            current["title"] = clean(re.sub(r"\s+", " ", current["title"]))
            current["notes"] = [part for part in current["notes"] if len(part) > 2][:400]
        current = None
        bucket = None

    index = 0
    while index < len(lines):
        line = lines[index]
        if RE_TOC.match(line):
            break

        section_match = RE_SECTION.match(line)
        if section_match:
            title = clean(section_match.group(2))
            if title and len(title) > 8:
                finish_lesson()
                section = {
                    "number": int(section_match.group(1)),
                    "title": title,
                    "lesson_ids": [],
                }
                sections.append(section)
            index += 1
            continue

        match = topic_match(line)
        if match:
            finish_lesson()
            number = int(match.group(1)) if match.group(1) else len(section["lesson_ids"]) + 1
            raw_title = clean(match.group(2))
            if raw_title:
                title, index = raw_title, index + 1
            else:
                title, index = split_title(lines, index + 1)
            current = start_lesson(title, number)
            continue

        if current is not None and (RE_ACT.match(line) or RE_GOALS.match(line)):
            if current.get("actuality") or current.get("goals"):
                finish_lesson()
                title = ""
                for back in range(index - 1, max(index - 6, -1), -1):
                    candidate = strip_table(lines[back])
                    if (
                        12 < len(candidate) < 180
                        and not is_marker(candidate)
                        and not candidate.endswith("?")
                        and not re.match(r"^\d", candidate)
                    ):
                        title = candidate
                        break
                number = len(section["lesson_ids"]) + 1
                current = start_lesson(title or f"Занятие {number}", number)

        if current is None:
            index += 1
            continue

        if RE_BANK.match(line):
            finish_lesson()
            break

        marker = None
        if RE_ACT.match(line):
            marker = "actuality"
        elif RE_GOALS.match(line):
            marker = "goals"
        elif RE_QUEST.match(line):
            marker = "questions"
        elif RE_NOTEBOOK.match(line):
            marker = "tasks"
        elif RE_REFS.match(line):
            marker = "essays"
        elif RE_INFO.match(line):
            marker = "notes"
        elif RE_PRACT.match(line):
            marker = "practical"
        elif RE_SIT.match(line):
            marker = "situational"
        elif RE_LIT.match(line):
            push_bucket(bucket)
            bucket = None
            index += 1
            continue

        if marker:
            push_bucket(bucket)
            bucket = marker
            inline = re.sub(
                r"^(?:Актуальность (?:темы|раздела)|Учебные цели|Контрольные вопросы[^:]*|"
                r"Вопросы для самоподготовки|В тетради[^:]*|Темы рефератов|Тематика рефератов|"
                r"Информационный блок|Практические работы|Ситуационные задачи[^:]*)[:.]?\s*",
                "",
                line,
                flags=re.I,
            ).strip()
            buffers[marker] = [inline] if inline else []
            index += 1
            continue

        if bucket:
            buffers.setdefault(bucket, []).append(line)
        index += 1

    finish_lesson()
    sections = [entry for entry in sections if entry["lesson_ids"]]
    for lesson in lessons:
        lesson["practical"] = [work for work in lesson["practical"] if work["title"]]
    return sections, lessons


# ---------------------------------------------------------------------------
# question banks


def split_inline_options(text: str) -> tuple[str, list[str]]:
    parts = re.split(r"\s+(?=\d{1,2}[).]\s)", " " + text)
    parts = [part.strip() for part in parts if part.strip()]
    if len(parts) < 3:
        return text, []
    stem = parts[0]
    options = [re.sub(r"^\d{1,2}[).]\s*", "", part).strip() for part in parts[1:]]
    return stem, [option for option in options if option]


RE_OPTION = re.compile(r"^(\d{1,2})[.)]\s+(.*)$")
RE_QUESTION_NUM = re.compile(r"^(\d{1,3})[.)]\s+(.+)$")


def parse_answer_tables(lines: list[str]) -> tuple[dict[int, str], list[str]]:
    answers: dict[int, str] = {}
    sequence: list[str] = []
    for line in lines:
        if not line.startswith("TABLE|"):
            continue
        cells = [clean(cell) for cell in strip_table(line).split("|")]
        index = 0
        while index + 1 < len(cells):
            number, value = cells[index], cells[index + 1]
            if re.fullmatch(r"\d{1,3}", number) and re.fullmatch(r"[\d,\s]+", value):
                answers[int(number)] = re.sub(r"\s+", "", value)
                index += 2
            else:
                index += 1
        for cell in cells:
            if re.fullmatch(r"\d{1,2}(?:\s*,\s*\d{1,2})*", cell):
                sequence.append(re.sub(r"\s+", "", cell))
    return answers, sequence


def parse_table_questions(lines: list[str]) -> list[dict]:
    questions: list[dict] = []
    current: dict | None = None
    for line in lines:
        if not line.startswith("TABLE|"):
            continue
        cells = [clean(cell) for cell in strip_table(line).split("|") if clean(cell)]
        if not cells:
            continue
        if re.fullmatch(r"\d{1,3}\.", cells[0]) and len(cells) >= 2:
            if current:
                questions.append(current)
            answer = cells[2] if len(cells) > 2 and re.fullmatch(r"[\d,\s]+", cells[2]) else ""
            current = {
                "number": int(cells[0].rstrip(".")),
                "text": cells[1],
                "options": [],
                "answer": answer,
            }
            continue
        if current is None:
            continue
        option = cells[0]
        match = re.match(r"^(\d{1,2})[.)]\s*(.*)$", option)
        if match:
            if match.group(2).strip():
                current["options"].append(match.group(2).strip())
        elif not re.fullmatch(r"[\d,\s]+", option):
            if current["options"]:
                current["options"][-1] += " " + option
            else:
                current["text"] += " " + option
    if current:
        questions.append(current)
    return [question for question in questions if question["text"] and len(question["options"]) >= 2]


def parse_linear_questions(lines: list[str]) -> list[dict]:
    questions: list[dict] = []
    current: dict | None = None

    def open_question(number: int, text: str) -> None:
        nonlocal current
        if current:
            questions.append(current)
        current = {"number": number, "text": "", "options": [], "answer": "", "star": []}
        stem, inline = split_inline_options(text)
        current["text"] = stem
        current["options"].extend(inline)

    def add_option(text: str) -> None:
        assert current is not None
        text = text.strip()
        if text.endswith("*"):
            current["star"].append(str(len(current["options"]) + 1))
            text = text.rstrip("*").strip()
        current["options"].append(text)

    for raw in lines:
        if raw.startswith("TABLE|"):
            continue
        line = clean(raw)
        if not line:
            continue

        if current is not None:
            inline_question = re.search(r"\s(\d{1,3})\.\s+([А-ЯЁ][^.]{10,})$", line)
            if inline_question and int(inline_question.group(1)) == current["number"] + 1 and current["options"]:
                prefix = line[: inline_question.start()].strip()
                if prefix:
                    add_option(re.sub(r"^\d{1,2}[).]\s*", "", prefix))
                open_question(int(inline_question.group(1)), inline_question.group(2))
                continue

        match = RE_OPTION.match(line)
        if match and current is not None:
            number, text = int(match.group(1)), match.group(2).strip()
            if number == len(current["options"]) + 1 and len(current["options"]) < 8:
                stem, inline = split_inline_options(text)
                if inline:
                    for option in inline:
                        add_option(option)
                else:
                    add_option(text)
                continue

        question_match = RE_QUESTION_NUM.match(line)
        if question_match:
            number, text = int(question_match.group(1)), question_match.group(2).strip()
            if current is None or number == current["number"] + 1 or number >= len(questions) + 1:
                open_question(number, text)
                continue

        if current is None:
            open_question(len(questions) + 1, line)
            continue

        stem, inline = split_inline_options(line)
        if inline and not current["options"]:
            current["text"] = clean(current["text"] + " " + stem)
            for option in inline:
                add_option(option)
        elif (
            current["options"]
            and len(line) > 20
            and re.match(r"^[А-ЯЁ]", line)
            and line.endswith((":", "?"))
        ):
            open_question(current["number"] + 1, line)
        elif current["options"]:
            current["options"][-1] = clean(current["options"][-1] + " " + line)
        else:
            current["text"] = clean(current["text"] + " " + line)

    if current:
        questions.append(current)

    result = []
    for question in questions:
        question["text"] = clean(re.sub(r"\s+", " ", question["text"]))
        question["options"] = [clean(option) for option in question["options"] if clean(option)]
        if len(question["text"]) > 8 and 2 <= len(question["options"]) <= 8:
            result.append(question)
    return result


def parse_token_stream(lines: list[str]) -> list[dict]:
    """Parse sources where questions and options are packed into running text."""
    text = " ".join(line for line in lines if not line.startswith("TABLE|"))
    text = re.sub(r"\s+", " ", text)
    segments = re.split(r"\s+(?=\d{1,3}[).]\s)", text)
    questions: list[dict] = []
    current: dict | None = None
    for segment in segments:
        segment = segment.strip()
        if not segment:
            continue
        match = re.match(r"^(\d{1,3})([).])\s*(.*)$", segment)
        if not match:
            if current is None:
                continue
            if current["options"]:
                current["options"][-1] = clean(current["options"][-1] + " " + segment)
            else:
                current["text"] = clean(current["text"] + " " + segment)
            continue
        number, delim, text_part = int(match.group(1)), match.group(2), match.group(3).strip()
        if (
            delim == ")"
            and current is not None
            and number == len(current["options"]) + 1
            and len(current["options"]) < 8
        ):
            current["options"].append(text_part)
            continue
        if delim == "." and current is not None and number == 1 and not current["options"]:
            current["options"].append(text_part)
            continue
        if current is not None and delim == "." and number > current["number"]:
            questions.append(current)
            current = {"number": number, "text": text_part, "options": [], "answer": ""}
            continue
        if current is None:
            current = {"number": number, "text": text_part, "options": [], "answer": ""}
            continue
        if delim == ")" and number <= len(current["options"]):
            current["options"][number - 1] = clean(current["options"][number - 1] + " " + text_part)
            continue
        if current["options"]:
            current["options"][-1] = clean(current["options"][-1] + " " + segment)
        else:
            current["text"] = clean(current["text"] + " " + segment)
    if current:
        questions.append(current)
    result = []
    for question in questions:
        question["text"] = clean(re.sub(r"\s+", " ", question["text"]))
        question["options"] = [clean(option) for option in question["options"] if clean(option)]
        if len(question["text"]) > 8 and 2 <= len(question["options"]) <= 8:
            result.append(question)
    return result


def collect_blocks(lines: list[str]) -> list[tuple[str, list[str]]]:
    blocks: list[tuple[str, list[str]]] = []
    mode, buffer = "body", []
    for line in lines:
        if RE_TOC.match(line):
            break
        probe = strip_table(line)
        if RE_ANSWER_HEAD.match(probe):
            if buffer:
                blocks.append((mode, buffer))
            mode, buffer = "answers", []
            continue
        if RE_TEST_HEAD.match(probe) and len(probe) < 220:
            if buffer:
                blocks.append((mode, buffer))
            blocks.append(("head", [probe]))
            mode, buffer = "body", []
            continue
        buffer.append(line)
    if buffer:
        blocks.append((mode, buffer))
    return blocks


def normalise_answer(answer: str, options: int) -> str:
    if not answer:
        return ""
    selected = [part for part in re.findall(r"\d{1,2}", answer)]
    if not selected:
        return ""
    if all(1 <= int(part) <= options for part in selected):
        return ",".join(selected)
    return ""


def group_tests(lines: list[str], mode: str) -> list[dict]:
    groups: list[dict] = []
    current: dict | None = None

    def open_group(title: str) -> dict:
        group = {"title": title, "lines": [], "answer_blocks": []}
        groups.append(group)
        return group

    for kind, block in collect_blocks(lines):
        if kind == "head":
            current = open_group(clean(block[0]))
            continue
        if kind == "answers":
            target = current or (groups[-1] if groups else open_group("Банк тестовых заданий"))
            target["answer_blocks"].append(block)
            current = None
            continue
        if current is None:
            current = open_group("Банк тестовых заданий")
        current["lines"].extend(block)

    result = []
    for group in groups:
        body = group["lines"]
        table_mode = sum(1 for line in body if line.startswith("TABLE|")) >= max(3, len(body) // 2)
        if table_mode:
            questions = parse_table_questions(body)
        elif mode == "token":
            questions = parse_token_stream(body)
        else:
            questions = parse_linear_questions(body)
        if not questions:
            continue

        explicit: dict[int, str] = {}
        sequence: list[str] = []
        for block in group["answer_blocks"]:
            found, seq = parse_answer_tables(block)
            explicit.update(found)
            if len(seq) > len(sequence):
                sequence = seq

        for question in questions:
            answer = question.get("answer") or explicit.get(question["number"], "")
            if not answer and question.get("star"):
                answer = ",".join(question["star"])
            question["answer"] = normalise_answer(answer, len(question["options"]))
            question.pop("star", None)

        missing = [question for question in questions if not question["answer"]]
        if missing and sequence and len(sequence) == len(questions):
            for question, value in zip(questions, sequence):
                if not question["answer"]:
                    question["answer"] = normalise_answer(value, len(question["options"]))

        result.append(
            {
                "title": group["title"],
                "questions": questions,
                "answered": sum(1 for question in questions if question["answer"]),
            }
        )
    return result


def lesson_number_from_title(title: str) -> int | None:
    match = re.search(r"(?:Тема|ТЕМА|Занятие|ЗАНЯТИЕ)\s*№?\s*(\d{1,2})", title)
    return int(match.group(1)) if match else None


def assign_bank(groups: list[dict], lessons: list[dict]) -> None:
    stop = {
        "физиология", "тестовые", "задания", "раздел", "раздела", "тема", "теме",
        "занятие", "занятию", "банк", "ответы", "эталоны", "общая", "частная",
        "человека", "системы", "систем", "физиологии",
    }

    def words(text: str) -> set[str]:
        return {word for word in re.findall(r"[а-яёa-z]{5,}", text.lower()) if word not in stop}

    by_number = {lesson["number"]: lesson for lesson in lessons}
    for group in groups:
        number = lesson_number_from_title(group["title"])
        if number and number in by_number:
            group["lesson_id"] = by_number[number]["id"]
            continue
        group_words = words(group["title"])
        best, score = None, 0
        for lesson in lessons:
            overlap = len(group_words & words(lesson["title"]))
            if overlap > score:
                best, score = lesson, overlap
        group["lesson_id"] = best["id"] if best and score >= 2 else None


def find_test_start(lines: list[str]) -> int | None:
    seen_lesson = False
    for index, line in enumerate(lines):
        if topic_match(line):
            seen_lesson = True
        if not seen_lesson:
            continue
        if RE_BANK.match(line):
            return index
        if line.lower().startswith(("тестовые задания", "тестовые задания")):
            return index
    return None


# ---------------------------------------------------------------------------
# assembly


def build_manual(manual: dict) -> dict:
    lines = load_lines(manual)
    start = find_test_start(lines)
    study_lines = lines[:start] if start is not None else lines
    sections, lessons = parse_study(study_lines, manual)
    mode = "token" if manual["kind"] == "doc" else "lines"
    groups = group_tests(lines[start:], mode) if start is not None else []
    assign_bank(groups, lessons)

    for lesson in lessons:
        attached = [group for group in groups if group.get("lesson_id") == lesson["id"]]
        lesson["tests"] = [
            {"title": group["title"], "questions": group["questions"]} for group in attached
        ]

    unattached = [
        {"title": group["title"], "questions": group["questions"]}
        for group in groups
        if not group.get("lesson_id")
    ]

    return {
        "slug": manual["slug"],
        "title": manual["title"],
        "subtitle": manual["subtitle"],
        "semester": manual["semester"],
        "year": manual["year"],
        "hours": manual["hours"],
        "source": {
            "file": manual["file"],
            "url": f"/library/physiology/{manual['file']}",
            "title": manual["title"] + ": учебно-методическое пособие",
        },
        "sections": [
            {
                "number": section["number"],
                "title": clean(section["title"]) or manual["title"],
                "lesson_ids": section["lesson_ids"],
            }
            for section in sections
        ],
        "lessons": lessons,
        "banks": unattached,
        "stats": {
            "lessons": len(lessons),
            "groups": len(groups),
            "questions": sum(len(group["questions"]) for group in groups),
            "answered": sum(group["answered"] for group in groups),
        },
    }


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    report = []
    for manual in MANUALS:
        data = build_manual(manual)
        path = OUT / f"{manual['slug']}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        report.append(
            {
                "slug": manual["slug"],
                "lessons": data["stats"]["lessons"],
                "questions": data["stats"]["questions"],
                "answered": data["stats"]["answered"],
                "banks": len(data["banks"]),
                "bytes": path.stat().st_size,
                "titles": [lesson["title"][:80] for lesson in data["lessons"]],
            }
        )
        print(
            f"{manual['slug']}: {data['stats']['lessons']} lessons, "
            f"{data['stats']['questions']} tests ({data['stats']['answered']} with answers), "
            f"{len(data['banks'])} shared banks"
        )
    (ROOT / "tools" / "physiology" / "build-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    (OUT / "index.json").write_text(
        json.dumps(
            {
                "subject": "physiology",
                "manuals": [
                    {
                        "slug": manual["slug"],
                        "title": manual["title"],
                        "subtitle": manual["subtitle"],
                        "semester": manual["semester"],
                        "hours": manual["hours"],
                        "file": f"/content/physiology/{manual['slug']}.json",
                        "source_url": f"/library/physiology/{manual['file']}",
                    }
                    for manual in MANUALS
                ],
                "reference": {
                    "title": REFERENCE["title"],
                    "author": REFERENCE["author"],
                    "url": f"/library/physiology/{REFERENCE['file']}",
                },
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
