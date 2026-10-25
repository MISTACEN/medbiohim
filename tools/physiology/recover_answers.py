# -*- coding: utf-8 -*-
"""Восстановление эталонов ответов из печатных ключей «Эталоны ответов к
тестовым заданиям» в .doc методичках (antiword).

Ключи — таблицы пар (№ теста | ответ); antiword отдаёт колонку № пустой,
поэтому ответы собираются последовательностью и мапятся на сквозные номера
тестов банка. Мульти-ответы вида «1,4,5» сохраняются; точка в «1.5» -> «1,5».

Запуск: python tools/physiology/recover_answers.py          # обновить JSON + БД
        python tools/physiology/recover_answers.py --check  # только показать статы
"""
import hashlib
import io
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LIB = REPO / "public" / "library" / "physiology"
CONTENT = REPO / "public" / "content" / "physiology"
CHECK_ONLY = "--check" in sys.argv

PHYSIOLOGY_SUBJECT = "6957e370-029e-4a9d-a6d2-fedf645328a9"
SKIP_TOKENS = {"", "№", "Ответ", "тестового", "задания"}
TOKEN_RE = re.compile(r"\d{1,2}(?:,\d)*")
HDR_RE = re.compile(r"Эталоны ответов к тестовым заданиям[^\n]*")


def antiword(doc: Path) -> str:
    return subprocess.run(["antiword", str(doc)], capture_output=True).stdout.decode("utf-8", "ignore")


def extract_answers(text: str) -> tuple[list[str], int]:
    """Собирает ответы из реальных блоков ключей, не задваивая таблицы
    с повторившимися заголовками (разрыв страницы)."""
    answers: list[str] = []
    blocks = 0
    span_end = 0
    for m in HDR_RE.finditer(text):
        if m.start() < span_end:
            continue  # заголовок-повтор внутри уже собранного блока
        started = False
        count_before = len(answers)
        offset = m.end()
        for line in text[m.end():].split("\n"):
            offset += len(line) + 1
            if "|" in line:
                started = True
                for tok in line.split("|"):
                    t = tok.strip().replace(".", ",")
                    if t in SKIP_TOKENS:
                        continue
                    if TOKEN_RE.fullmatch(t):
                        answers.append(t)
            elif started:
                if re.search(r"[А-Яа-я]{4,}", line):
                    span_end = offset
                    break
        else:
            span_end = len(text)
        blocks += 1
    return answers, blocks


def keys_by_number(answers: list[str]) -> dict[int, str]:
    return {i + 1: a for i, a in enumerate(answers)}


def main() -> None:
    for name in ("cns", "krov-endokrin"):
        json_path = CONTENT / f"{name}.json"
        manual = json.loads(io.open(json_path, encoding="utf-8").read())
        bank = (manual.get("banks") or [None])[0]
        if not bank:
            print(f"{name}: нет банка, пропуск")
            continue
        numbers = [q["number"] for q in bank["questions"]]
        max_num = max(numbers)

        answers, blocks = extract_answers(antiword(LIB / f"{name}.doc"))
        print(f"{name}: блоков ключей {blocks}, значений {len(answers)} (номера тестов до {max_num})")
        if len(answers) < max_num:
            print(f"  !! ключей меньше, чем тестов ({len(answers)} < {max_num}) — мапим только найденные")
        if CHECK_ONLY:
            continue

        keys = keys_by_number(answers)
        updated = 0
        db_updates = []
        for q in bank["questions"]:
            key = keys.get(q["number"])
            if not key or q.get("answer"):
                continue
            q["answer"] = key
            updated += 1
            src = "phys_mcq:" + hashlib.sha1(f"mcq:{q['text']}".encode("utf-8")).hexdigest()[:12]
            db_updates.append((src, f"Верный ответ: {key}"))

        io.open(json_path, "w", encoding="utf-8", newline="\n").write(
            json.dumps(manual, ensure_ascii=False, indent=1)
        )
        print(f"  JSON: обновлено эталонов {updated}")
        with io.open(REPO / ".tmp-answer-updates.tsv", "a", encoding="utf-8", newline="
") as f:
            for src, answer in db_updates:
                f.write(f"{src}\t{answer}\n")

    if not CHECK_ONLY:
        print("DB-обновления записаны в .tmp-answer-updates.tsv (применяются apply_answer_updates.mjs)")


if __name__ == "__main__":
    main()
