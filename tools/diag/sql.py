"""Run a read-only SQL query against the live Supabase project.

Usage:
    python tools/diag/sql.py "select table_name, column_name from information_schema.columns where table_name = 'schedule_entries'"

Rows are wrapped with to_jsonb() into a helper table and read through PostgREST,
because the import_legacy_sql RPC does not return result sets.
"""
from __future__ import annotations

import io
import json
import sys
import time
import urllib.error
import urllib.request

TABLE = "_diag_sql_result"


def env() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in io.open(".env.local", encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def rpc(url: str, key: str, sql: str) -> None:
    payload = json.dumps({"sql_text": sql}).encode()
    request = urllib.request.Request(
        url + "/rest/v1/rpc/import_legacy_sql",
        data=payload,
        headers={"Content-Type": "application/json", "apikey": key, "Authorization": "Bearer " + key},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        response.read()


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    query = sys.argv[1]
    values = env()
    url = values["SUPABASE_URL"].rstrip("/")
    key = values["SUPABASE_SERVICE_KEY"]
    headers = {"apikey": key, "Authorization": "Bearer " + key}

    rpc(url, key, f"drop table if exists public.{TABLE};")
    rpc(url, key, f"create table public.{TABLE} as select to_jsonb(q) as row from ({query}) q;")
    try:
        rows = None
        # PostgREST picks up a freshly created table only after its schema cache
        # reload; retry briefly instead of failing the whole query.
        for attempt in range(10):
            try:
                request = urllib.request.Request(url + f"/rest/v1/{TABLE}?select=row&limit=1000", headers=headers)
                with urllib.request.urlopen(request, timeout=60) as response:
                    rows = json.load(response)
                break
            except urllib.error.HTTPError as error:
                if error.code != 404 or attempt == 9:
                    raise
                time.sleep(2)
        assert rows is not None
        for item in rows:
            print(json.dumps(item["row"], ensure_ascii=False))
        print(f"-- rows: {len(rows)}", file=sys.stderr)
    finally:
        rpc(url, key, f"drop table if exists public.{TABLE};")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
