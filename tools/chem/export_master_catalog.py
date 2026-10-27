# -*- coding: utf-8 -*-
"""Собирает распарсенные тесты по химии в сид chemistry_master_documents.

Источники:
  tools/chem/part1-questions.json          — Часть I (темы 1.1+, с ответами «N=…»)
  <chem dir>/Тесты_химия_все.json          — Части II–III (chem2/chem3)

Выход: docs/20261028_chemistry_master_v2_seed.sql — аддитивный upsert новой
версии каталога (2026-10-28-v2-tests), прод-банки (tests/questions) не трогает.
Формулы не додумываются: текст OCR сохраняется как есть, в т.ч. пометки
«[СТРУКТУРА: …]» для последующей постраничной сверки со сканом.

Запуск: PYTHONIOENCODING=utf-8 python tools/chem/export_master_catalog.py
"""
import glob
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
DOCS = os.path.join(REPO, "docs")
CHEM_DIR = os.path.dirname(REPO)  # ../на сайт/химия
OUT_SQL = os.path.join(DOCS, "20261028_chemistry_master_v2_seed.sql")

SUBJECT_SLUG = "organic_chemistry"
VERSION = "2026-10-28-v2-tests"
TITLE = ("Органическая и физическая химия. Сборник тестовых заданий, части I–III "
         "(ДВГМУ, 2016) — распознано с печатных копий")

FORMULA_MARKERS = re.compile(r"[→⇌≡⁻⁺²³₀-₉]|\b(?:CH|C)\d|\bH\d|\[СТРУКТУРА")


def sql_quote(s: str) -> str:
    return s.replace("'", "''")


def item_from_part1(theme_key: str, theme: dict, q: dict, idx: int) -> dict:
    answer_raw = (q.get("answer_raw") or "").strip()
    text = " ".join([q.get("text", ""), " ".join(q.get("options") or [])])
    return {
        "item_key": f"tests-p1-{theme_key}-{q.get('num', idx)}",
        "kind": "mcq" if q.get("options") else ("match" if q.get("kind") == "match" else q.get("kind", "open")),
        "question": q.get("text", ""),
        "options": q.get("options") or (q.get("left") and {"left": q["left"], "right": q["right"]}) or None,
        "answer": answer_raw or None,
        "answer_status": "prepared_from_text" if answer_raw else "unprepared",
        "topic": f"Тема {theme_key}. {theme.get('title', '')}".strip(),
        "source": "Сборник тестовых заданий, часть I (ДВГМУ, 2016)",
        "source_number": str(q.get("num", "")),
        "source_page": q.get("page"),
        "formula_preserved": bool(FORMULA_MARKERS.search(text or "")),
    }


def item_from_tests(doc_name: str, theme_key: str, theme: dict, q: dict, idx: int) -> dict:
    answer_raw = (q.get("answer_raw") or q.get("answer") or "").strip()
    text = " ".join([q.get("text", ""), " ".join(q.get("options") or [])])
    part = {"chem2": "часть II", "chem3": "часть III"}.get(doc_name, doc_name)
    if q.get("kind") == "match":
        options = {"left": q.get("left") or [], "right": q.get("right") or []}
    else:
        options = q.get("options") or None
    return {
        "item_key": f"tests-{doc_name}-{theme_key}-{q.get('num', idx)}",
        "kind": q.get("kind", "open"),
        "question": q.get("text", ""),
        "options": options,
        "answer": answer_raw or None,
        "answer_status": "prepared_from_text" if answer_raw else "unprepared",
        "topic": (f"Тема {theme_key}. {theme.get('title', '')}" if theme_key != "—"
                  else theme.get("title", "")),
        "source": f"Сборник тестовых заданий, {part} (ДВГМУ, 2016)",
        "source_number": str(q.get("num", "")),
        "source_page": q.get("page"),
        "formula_preserved": bool(FORMULA_MARKERS.search(text or "")),
    }


def main() -> int:
    items = []

    part1_path = os.path.join(HERE, "part1-questions.json")
    if not os.path.exists(part1_path):
        print("!! нет", part1_path)
        return 1
    part1 = json.load(io.open(part1_path, encoding="utf-8"))
    for theme_key, theme in (part1.get("themes") or {}).items():
        for i, q in enumerate(theme.get("questions", []), 1):
            items.append(item_from_part1(theme_key, theme, q, i))

    all_path = None
    for cand in glob.glob(os.path.join(CHEM_DIR, "на сайт", "химия", "Тесты_химия_все.json")) + \
                glob.glob(os.path.join(CHEM_DIR, "*", "Тесты_химия_все.json")):
        all_path = cand
        break
    if all_path:
        docs = json.load(io.open(all_path, encoding="utf-8"))
        for doc_name, doc in docs.items():
            for theme_key, theme in (doc.get("themes") or {}).items():
                for i, q in enumerate(theme.get("questions", []), 1):
                    items.append(item_from_tests(doc_name, theme_key, theme, q, i))
    else:
        print("!! не найден Тесты_химия_все.json — сею только часть I")

    # Дедуп по item_key (двойной разбор одного вопроса в разных темах не создаёт копий)
    seen, unique = set(), []
    for it in items:
        if it["item_key"] in seen:
            continue
        seen.add(it["item_key"])
        unique.append(it)

    answered = sum(1 for it in unique if it["answer"])
    content = json.dumps(unique, ensure_ascii=False, separators=(",", ":"))
    source_docs = json.dumps(
        [{"source_key": "dvamu_tests_2016", "title": TITLE,
          "note": "OCR Gemini + ручные транскрипции; формулы не верифицированы по сканам"}],
        ensure_ascii=False)

    sql = f"""-- Химия: аддитивный сид каталога chemistry_master_documents
-- Версия {VERSION} · items: {len(unique)} (с ответом: {answered})
-- Источник: печатный сборник ДВГМУ 2016, части I–III (tools/chem — OCR + парсеры).
-- Прод-банки tests/questions/exam_questions не изменяются. Каталог читает
-- GET /tests/chemistry-master (вкладка «Химия» в /tests).
-- Формулы сохранены в текстовом виде как распознаны; пометки [СТРУКТУРА: …]
-- требуют постраничной сверки со сканом до попадания в scoring.

insert into public.chemistry_master_documents
  (subject_slug, title, version, source_archive, source_documents, item_count, content, formula_policy)
values
  ('{SUBJECT_SLUG}', '{sql_quote(TITLE)}', '{VERSION}', 'на сайт/химия',
   '{sql_quote(source_docs)}'::jsonb, {len(unique)},
   '{sql_quote(content)}'::jsonb,
   'text_preserved_ocr_not_image_verified')
on conflict (subject_slug, version) do update set
  source_documents = excluded.source_documents,
  item_count = excluded.item_count,
  content = excluded.content,
  updated_at = now();
"""
    io.open(OUT_SQL, "w", encoding="utf-8", newline="\n").write(sql)
    print(f"OK: {len(unique)} позиций (с ответом {answered}), SQL: {OUT_SQL} ({len(sql) // 1024} КБ)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
