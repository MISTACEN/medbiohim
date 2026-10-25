# -*- coding: utf-8 -*-
"""Диагностика 503 на /tests/preparation/:id/finish.
Проверяет схему test_preparation_sessions и воспроизводит PATCH завершения
сервисным ключом, печатая точную ошибку PostgREST.

Запуск: python tools/diag/test_prep_finish_diag.py [session_id]
session_id по умолчанию: cb84a0ec-f85c-4eb0-a442-2908aeb8e1bc
"""
import io
import json
import os
import re
import sys
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

env = {}
for line in io.open(os.path.join(REPO, ".env.local"), encoding="utf-8").read().splitlines():
    m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
    if m:
        env[m.group(1)] = m.group(2)

BASE = env["SUPABASE_URL"].rstrip("/")
KEY = env.get("SUPABASE_SECRET_KEY") or env.get("SUPABASE_SERVICE_KEY")
SESSION = sys.argv[1] if len(sys.argv) > 1 else "cb84a0ec-f85c-4eb0-a442-2908aeb8e1bc"


def rest(path, method="GET", body=None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.load(e)
        except Exception:
            return e.code, {}


def main():
    print("=== Колонки test_preparation_sessions:")
    status, cols = rest("/rest/v1/information_schema.columns?select=column_name,data_type&table_schema=eq.public&table_name=eq.test_preparation_sessions")
    if isinstance(cols, list):
        for c in cols:
            print("  ", c.get("column_name"), "|", c.get("data_type"))
    else:
        print("  ответ:", cols)

    print("\n=== Сессия", SESSION)
    status, rows = rest(f"/rest/v1/test_preparation_sessions?select=id,status,current_index&id=eq.{SESSION}&limit=1")
    print("  ", status, rows)

    print("\n=== Пробный PATCH (как в finish):")
    status, res = rest(f"/rest/v1/test_preparation_sessions?id=eq.{SESSION}", method="PATCH",
                       body={"status": "completed", "completed_at": "2026-10-25T12:00:00Z", "last_saved_at": "2026-10-25T12:00:00Z", "current_index": 1})
    print("  PATCH полный:", status, res)
    if status >= 400:
        status2, res2 = rest(f"/rest/v1/test_preparation_sessions?id=eq.{SESSION}", method="PATCH",
                             body={"status": "completed", "last_saved_at": "2026-10-25T12:00:00Z"})
        print("  PATCH минимальный:", status2, res2)

    print("\n=== Результаты сессии:")
    status, res = rest(f"/rest/v1/test_preparation_results?select=question_id,is_correct&session_id=eq.{SESSION}&limit=100")
    print("  ", status, "строк:", len(res) if isinstance(res, list) else res)


if __name__ == "__main__":
    main()
