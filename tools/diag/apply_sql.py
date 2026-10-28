"""Apply a SQL migration file to the live Supabase project via import_legacy_sql.

Usage: python tools/diag/apply_sql.py database/migrations/20261028_user_calendar_events.sql
"""
from __future__ import annotations

import io
import json
import sys
import urllib.request


def env() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in io.open(".env.local", encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    values = env()
    url = values["SUPABASE_URL"].rstrip("/")
    key = values["SUPABASE_SERVICE_KEY"]
    sql = io.open(sys.argv[1], encoding="utf-8").read()
    request = urllib.request.Request(
        url + "/rest/v1/rpc/import_legacy_sql",
        data=json.dumps({"sql_text": sql}).encode(),
        headers={"Content-Type": "application/json", "apikey": key, "Authorization": "Bearer " + key},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        print(sys.argv[1], "->", response.read().decode()[:120])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
