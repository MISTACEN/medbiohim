# -*- coding: utf-8 -*-
"""Проверка, что все ```image ссылки в лекциях резолвятся в файлы public/.

Запуск: python -E tools/physiology/check_fig_links.py
Выход: 0 если все ссылки валидны, 1 если есть битые.
"""
import io
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LECTURES = REPO / "public" / "content" / "lectures"
PUBLIC = REPO / "public"

IMG_FENCE = re.compile(r"```image\s*\n(.*?)\n```", re.S)
REMOTE_OK = re.compile(r"^https?://", re.I)


def main() -> None:
    total = broken = remote = 0
    for md in sorted(LECTURES.rglob("*.md")):
        text = io.open(md, encoding="utf-8").read()
        for m in IMG_FENCE.finditer(text):
            try:
                data = json.loads(m.group(1))
            except json.JSONDecodeError as e:
                broken += 1
                print(f"BROKEN JSON {md.relative_to(REPO)}: {e}")
                continue
            url = data.get("url", "")
            if not url:
                if data.get("trainerId"):
                    remote += 1  # картинка через API: /trainers/feed/:id/image (Drive→Upstash)
                    continue
                broken += 1
                print(f"NO URL {md.relative_to(REPO)}")
                continue
            if REMOTE_OK.match(url):
                remote += 1
                continue
            total += 1
            path = PUBLIC / url.lstrip("/")
            if not path.exists():
                broken += 1
                print(f"BROKEN {md.relative_to(REPO)}: {url}")
    print(f"\nлокальных ссылок: {total}, внешних (https): {remote}, битых: {broken}")
    sys.exit(1 if broken else 0)


if __name__ == "__main__":
    main()
