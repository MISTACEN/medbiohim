#!/usr/bin/env python3
"""Assemble organic_chemistry.json from docs/orgchem-import parts."""
import json
from pathlib import Path
root = Path(__file__).resolve().parents[1]
parts = sorted((root/"docs/orgchem-import").glob("questions-part*.json"))
items=[]
for p in parts:
    d=json.loads(p.read_text(encoding="utf-8"))
    items.extend(d["items"])
out={
  "subject_slug":"organic_chemistry",
  "subject":"Органическая и физическая химия",
  "count":len(items),
  "kind":"ticket",
  "for_exam":True,
  "items":items,
}
for dest in [
  root/"backend/data/questions_by_subject/organic_chemistry.json",
  root/"spaceweb_upload/data/questions_by_subject/organic_chemistry.json",
]:
  dest.parent.mkdir(parents=True, exist_ok=True)
  dest.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
  print("wrote", dest, len(items))
