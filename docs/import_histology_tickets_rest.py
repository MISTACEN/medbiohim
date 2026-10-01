#!/usr/bin/env python3
"""Import histology exam_questions into Supabase REST.

Usage:
  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python3 docs/import_histology_tickets_rest.py

Reads (in order):
  docs/histology-import/slim01.json ... slim10.json
  or docs/histology-import/questions-part*.json

Does NOT insert ticket_banks (live DB uses UUID ids; 5 banks already exist).
Questions attach to banks via subject_slug=histology.
"""
import json, os, sys, urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent
URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
if not URL or not KEY:
    print("Set SUPABASE_URL and SUPABASE_SERVICE_KEY"); sys.exit(1)

def req(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    r = urllib.request.Request(
        f"{URL}/rest/v1/{path}",
        data=data,
        method=method,
        headers={
            "apikey": KEY,
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    with urllib.request.urlopen(r) as resp:
        return resp.status

imp = BASE / "histology-import"
parts = sorted(imp.glob("slim*.json")) or sorted(imp.glob("questions-part*.json"))
if not parts:
    print("No JSON parts in", imp); sys.exit(1)

n = 0
for p in parts:
    items = json.loads(p.read_text(encoding="utf-8"))
    rows = []
    for it in items:
        rows.append({
            "id": it["id"],
            "subject_name": it.get("subject") or "Гистология, цитология",
            "subject_slug": "histology",
            "topic": it.get("topic") or "",
            "text": it["text"],
            "answer": it.get("answer") or "",
            "kind": "ticket",
            "type": it.get("type") or "open",
            "for_exam": True,
            "for_ticket": True,
            "source": it.get("source") or "features/exam-questions",
            "is_published": True,
        })
    for i in range(0, len(rows), 40):
        chunk = rows[i:i+40]
        st = req("POST", "exam_questions", chunk)
        n += len(chunk)
        print(p.name, i, "status", st, "total", n)
print("done", n)
