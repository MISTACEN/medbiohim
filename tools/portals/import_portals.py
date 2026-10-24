# -*- coding: utf-8 -*-
"""Импорт легаси-порталов (ХОБА, паразитология, legacy MC-тесты) в public/content/portals.

Источник по умолчанию — архив прошлых итераций сайта:
  <workspace>/на сайт/public_html/data

Запуск: python tools/portals/import_portals.py [src_dir]
"""
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(REPO, "public", "content", "portals")
DEFAULT_SRC = os.path.join(os.path.dirname(REPO), "на сайт", "public_html", "data")

MOJIBAKE = re.compile(r"[\u2500-\u25ff]")

def fix_encoding(s: str) -> str:
    """Чинит двойное UTF-8 кодирование (байты UTF-8, прочитанные как CP866/CP1251)."""
    if not isinstance(s, str) or not MOJIBAKE.search(s):
        return s
    for codec in ("cp866", "cp1251"):
        try:
            repaired = s.encode(codec, errors="strict").decode("utf-8", errors="strict")
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

def load(path):
    with open(path, encoding="utf-8") as f:
        return deep_fix(json.load(f))

def save(name, data):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"  {name}: {os.path.getsize(path)//1024} КБ")

def strip_meta(d):
    d = dict(d)
    for k in ("migration_status", "source_archive", "source_path"):
        d.pop(k, None)
    return d

def import_hoba(src):
    print("ХОБА (общая и неорганическая химия):")
    for kind, fname in (("theory", "hoba-theory.json"), ("practical", "hoba-practical.json"), ("tasks", "hoba-tasks.json")):
        d = strip_meta(load(os.path.join(src, "legacy", "hoba", f"{kind}.json")))
        items = d.get("items", [])
        d["items"] = items
        save(fname, d)
        print(f"    {kind}: {len(items)} записей")

PARA_LABELS = [
    ("type", "Тип / группа"),
    ("species", "Вид (возбудитель)"),
    ("morphology", "Морфология"),
    ("transmission", "Заражение / переносчик"),
    ("localization", "Локализация"),
    ("diagnostics", "Диагностика"),
    ("geography", "География"),
    ("prevention", "Профилактика"),
]

def import_parasitology(src):
    print("Паразитология:")
    bank = load(os.path.join(src, "trainers_bank.json"))
    tests = []
    for item in bank.get("items", []):
        if not str(item.get("id", "")).startswith("parasitology-"):
            continue
        cols = item.get("columns", [])
        rows = item.get("rows", [])
        labeled = [{"key": c, "label": dict(PARA_LABELS).get(c, c)} for c in cols]
        tests.append({
            "id": item["id"],
            "title": item.get("title", item["id"]),
            "columns": labeled,
            "rows": rows,
        })
        print(f"    {item['id']}: {len(rows)} строк, {len(cols)} колонок")
    # Датасеты test2-4 из legacy/trainers, которых нет в trainers_bank в полном виде
    legacy_dir = os.path.join(src, "legacy", "parasitology", "trainers")
    have = {t["id"] for t in tests}
    for n in (2, 3, 4):
        tid = f"parasitology-test{n}"
        if tid in have:
            continue
        path = os.path.join(legacy_dir, f"test{n}.json")
        if not os.path.exists(path):
            continue
        d = strip_meta(load(path))
        keys = list(d["items"][0].keys()) if d.get("items") else []
        labeled = [{"key": k, "label": dict(PARA_LABELS).get(k, k)} for k in keys]
        tests.append({"id": tid, "title": f"Паразитология · test{n}", "columns": labeled, "rows": d["items"]})
        print(f"    {tid} (из legacy): {len(d['items'])} строк")
    tests.sort(key=lambda t: t["id"])
    save("parasitology-tests.json", {"subject": "Биология → Паразитология", "tests": tests})

def import_mc_tests(src):
    print("Legacy MC-тесты:")
    mc_dir = os.path.join(src, "legacy", "tests", "mc")
    index = []
    for fname in sorted(os.listdir(mc_dir)):
        if not fname.endswith(".json"):
            continue
        d = strip_meta(load(os.path.join(mc_dir, fname)))
        tid = d.get("id") or fname[:-5]
        questions = d.get("questions", [])
        slim = {
            "id": tid,
            "title": d.get("title", tid),
            "subject": d.get("subject", ""),
            "subjectId": d.get("subjectId") or d.get("subject_slug") or "",
            "course": d.get("course"),
            "semester": d.get("semester"),
            "topic": d.get("topic", ""),
            "questions": [
                {k: q.get(k) for k in ("id", "text", "options", "correct", "answer", "topic") if q.get(k) is not None}
                for q in questions
            ],
        }
        save(f"mc-{tid}.json", slim)
        index.append({"id": tid, "title": slim["title"], "subject": slim["subject"],
                      "subjectId": slim["subjectId"], "topic": slim["topic"], "count": len(questions)})
        print(f"    {tid}: {len(questions)} вопросов")
    save("mc-index.json", {"tests": index})

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    if not os.path.isdir(src):
        sys.exit(f"Источник не найден: {src}")
    print(f"Источник: {src}\n")
    import_hoba(src)
    print()
    import_parasitology(src)
    print()
    import_mc_tests(src)
    print("\nГотово → public/content/portals/")

if __name__ == "__main__":
    main()
