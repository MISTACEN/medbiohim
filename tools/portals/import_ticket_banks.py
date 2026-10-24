# -*- coding: utf-8 -*-
"""Конвертация билетных банков questions_by_subject в статические банки
public/content/portals/ticket-banks (канонические slug предметов сайта).

Источник: <workspace>/на сайт/public_html/data/questions_by_subject
Запуск: python tools/portals/import_ticket_banks.py [src_dir]
"""
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(REPO, "public", "content", "portals", "ticket-banks")
DEFAULT_SRC = os.path.join(os.path.dirname(REPO), "на сайт", "public_html", "data", "questions_by_subject")

MOJIBAKE = re.compile(r"[\u2500-\u25ff]")

def fix_encoding(s):
    if not isinstance(s, str) or not MOJIBAKE.search(s):
        return s
    for codec in ("cp866", "cp1251"):
        try:
            repaired = s.encode(codec).decode("utf-8")
            if not MOJIBAKE.search(repaired):
                return repaired
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
    return s

def deep_fix(obj):
    if isinstance(obj, str):
        return fix_encoding(obj)
    if isinstance(obj, list):
        return [deep_fix(x) for x in obj]
    if isinstance(obj, dict):
        return {k: deep_fix(v) for k, v in obj.items()}
    return obj

# Файл-источник → канонический slug предмета сайта (src/lib/subjectSlug.ts)
SLUG_MAP = {
    "histology": "histology",
    "inorganic": "inorganic_chemistry",
    "chemistry": "organic_chemistry",
    "chemistry_organic_physical": "organic_chemistry",
    "organic_chemistry": "organic_chemistry",
    "biology": "biology",
    "physics": "physics",
    "math": "math",
    "математический_анализ": "math",
    "математический_анализ": "math",
    "history": "history",
    "physiology": "physiology",
}

U_ESCAPE = re.compile(r"#U([0-9a-fA-F]{4})")

def decode_name(name: str) -> str:
    """'#U043c#U0430…' (git-экранирование юникода) → нормальный текст."""
    if "#U" not in name:
        return name
    return U_ESCAPE.sub(lambda m: chr(int(m.group(1), 16)), name)

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    if not os.path.isdir(src):
        sys.exit(f"Источник не найден: {src}")
    os.makedirs(OUT, exist_ok=True)
    banks = {}
    for fname in sorted(os.listdir(src)):
        if not fname.endswith(".json"):
            continue
        base = fname[:-5]
        key = decode_name(base)
        slug = SLUG_MAP.get(key) or SLUG_MAP.get(base)
        if not slug:
            print(f"  !! нет маппинга для {fname}, пропуск")
            continue
        with open(os.path.join(src, fname), encoding="utf-8") as f:
            d = deep_fix(json.load(f))
        items = d.get("items", [])
        for it in items:
            it.setdefault("subject_slug", d.get("subject_slug") or key)
        bank = banks.setdefault(slug, {"subject_slug": slug, "subject": "", "items": []})
        bank["items"].extend(items)
        if not bank["subject"]:
            bank["subject"] = d.get("subject") or (items[0].get("subject") if items and items[0].get("subject") else slug)
    index = []
    for slug, bank in sorted(banks.items()):
        bank["count"] = len(bank["items"])
        path = os.path.join(OUT, f"{slug}.json")
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(bank, f, ensure_ascii=False, indent=1)
        index.append({"subject_slug": slug, "subject": bank["subject"], "count": bank["count"]})
        print(f"  {slug}.json: {bank['count']} вопросов")
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump({"banks": index}, f, ensure_ascii=False, indent=1)
    total = sum(b["count"] for b in index)
    print(f"\nГотово: {total} вопросов → public/content/portals/ticket-banks/")

if __name__ == "__main__":
    main()
