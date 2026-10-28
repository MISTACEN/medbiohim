"""One-off live check: new worker endpoints on production with a throwaway user.

Creates a temporary confirmed user through the Supabase admin API, signs in,
calls the new endpoints, then deletes the user.

Note: Supabase rejects a secret API key when the User-Agent looks like a
browser, while Cloudflare blocks non-browser User-Agents on the worker — so the
two calls use different UA values on purpose.
"""
from __future__ import annotations

import io
import json
import urllib.error
import urllib.request
import uuid

BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
SERVER_UA = "medbiohim-diag/1.0"


def env() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in io.open(".env.local", encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def request(url: str, *, method: str = "GET", headers: dict[str, str] | None = None, body=None, ua: str = SERVER_UA):
    data = json.dumps(body).encode() if body is not None else None
    merged = {"User-Agent": ua}
    merged.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=merged, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return response.status, response.headers.get("content-type", ""), response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.headers.get("content-type", ""), error.read().decode()


def main() -> int:
    values = env()
    supabase = values["SUPABASE_URL"].rstrip("/")
    service = values["SUPABASE_SERVICE_KEY"]
    anon = values["SUPABASE_ANON_KEY"]
    api = values["CLOUDFLARE_API_ORIGIN"].rstrip("/")
    admin_headers = {"apikey": service, "Authorization": "Bearer " + service, "Content-Type": "application/json"}

    email = f"dsh-check-{uuid.uuid4().hex[:10]}@example.com"
    password = "Check-" + uuid.uuid4().hex[:12]
    status, _, body = request(
        supabase + "/auth/v1/admin/users",
        method="POST",
        headers=admin_headers,
        body={"email": email, "password": password, "email_confirm": True},
    )
    print("create user:", status)
    if status >= 400:
        print(body[:300])
        return 1
    user_id = json.loads(body)["id"]

    try:
        status, _, body = request(
            supabase + "/auth/v1/token?grant_type=password",
            method="POST",
            headers={"apikey": anon, "Content-Type": "application/json"},
            body={"email": email, "password": password},
        )
        print("sign in:", status)
        if status >= 400:
            print(body[:300])
            return 1
        token = json.loads(body)["access_token"]
        auth = {"Authorization": "Bearer " + token, "apikey": anon}

        for label, path in (
            ("exam-questions histology", "/exam-questions?subject=histology&limit=2"),
            ("exam-questions summary", "/exam-questions/summary"),
            ("feed-link", "/schedule/feed-link"),
        ):
            status, ctype, body = request(api + path, headers=auth, ua=BROWSER_UA)
            print(f"\n{label}: {status} {ctype}")
            print(body[:400])

        status, ctype, body = request(api + "/exam-questions?subject=histology&limit=2", headers=auth, ua=BROWSER_UA)
        if status == 200:
            payload = json.loads(body).get("data", {})
            print("\nquestions total:", payload.get("total"), "topics:", len(payload.get("topics") or []))

        status, ctype, body = request(api + "/schedule/feed-link", headers=auth, ua=BROWSER_UA)
        if status == 200:
            path = json.loads(body)["data"]["path"]
            # path рассчитан на прокси Vercel (`/api/v1/...`), а здесь мы идём
            # прямо в воркер, где префикс уже есть в CLOUDFLARE_API_ORIGIN.
            worker_path = path.replace("/api/v1", "", 1)
            status, ctype, body = request(api + worker_path, ua=BROWSER_UA)
            print(f"\nical.ics: {status} {ctype}")
            print(body[:300].replace("\r\n", " | "))
            print(
                "events:",
                body.count("BEGIN:VEVENT"),
                "lines:",
                body.count("\r\n") + 1,
                "ends with END:VCALENDAR:",
                body.rstrip().endswith("END:VCALENDAR"),
            )

        # У свежего пользователя нет неподтверждённой смены почты: роут обязан
        # ответить 409, а не «отправить письмо в никуда».
        status, ctype, body = request(
            api + "/settings/email/resend", method="POST", headers=auth, body={}, ua=BROWSER_UA
        )
        print(f"\nsettings/email/resend: {status}")
        print(body[:200])
    finally:
        status, _, body = request(supabase + f"/auth/v1/admin/users/{user_id}", method="DELETE", headers=admin_headers)
        print("\ndelete user:", status)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
