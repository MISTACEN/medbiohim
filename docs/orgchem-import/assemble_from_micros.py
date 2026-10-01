#!/usr/bin/env python3
"""Assemble organic_chemistry.json from docs/orgchem-import/micro/m*.json"""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
micro = root / "docs" / "orgchem-import" / "micro"
items = []
for p in sorted(micro.glob("m*.json")):
    d = json.loads(p.read_text(encoding="utf-8"))
    items.extend(d.get("items") or [])
items.sort(key=lambda x: x.get("task_number") or 0)
out = {
    "subject_slug": "organic_chemistry",
    "subject": "Органическая и физическая химия",
    "count": len(items),
    "kind": "ticket",
    "for_exam": True,
    "items": items,
}
for dest in [
    root / "backend" / "data" / "questions_by_subject" / "organic_chemistry.json",
    root / "spaceweb_upload" / "data" / "questions_by_subject" / "organic_chemistry.json",
]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", dest, "count", len(items))
