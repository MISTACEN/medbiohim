#!/usr/bin/env python3
"""Apply histology ticket questions to Supabase REST.
Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python3 docs/import_histology_tickets_rest.py
Reads docs/histology-import/questions-part*.json
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

banks = [
  {"id":"bank-histology-lech-ped","subject_name":"Гистология, цитология","subject_slug":"histology","title":"Билеты — Гистология (леч./пед.)","mode":"exam"},
  {"id":"bank-histology-stom","subject_name":"Гистология, цитология","subject_slug":"histology","title":"Билеты — Гистология (стом.)","mode":"exam"},
  {"id":"bank-histology-cases","subject_name":"Гистология, цитология","subject_slug":"histology","title":"Ситуационные задачи — Гистология","mode":"exam"},
  {"id":"bank-histology-preparations","subject_name":"Гистология, цитология","subject_slug":"histology","title":"Экзаменационные препараты — Гистология","mode":"exam"},
  {"id":"bank-histology-all","subject_name":"Гистология, цитология","subject_slug":"histology","title":"Билеты — Гистология (полный банк)","mode":"exam"},
]
print("banks", req("POST", "ticket_banks", banks))

parts = sorted((BASE / "histology-import").glob("questions-part*.json"))
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
    for i in range(0, len(rows), 50):
        chunk = rows[i:i+50]
        st = req("POST", "exam_questions", chunk)
        n += len(chunk)
        print(p.name, i, st, "total", n)
print("done", n)
