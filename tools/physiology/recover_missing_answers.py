# -*- coding: utf-8 -*-
"""Восстановление последних пустых эталонов в serdce-sosudistaya и
dyhanie-vydelenie из .doc методичек (antiword).

serdce-sosudistaya — ключи в отдельных таблицах «№|Ответ» с якорными номерами
(антиворд вырезает часть №), поэтому колонки мапятся по якорям: первый
явный номер в колонке задаёт диапазон всей колонки, смежные колонки
продолжают нумерацию.

dyhanie-vydelenie — эталон напечатан в последней ячейке строки вопроса
(иногда «сползает» на строку последнего варианта), поэтому банк разбирается
поблочно, вопрос сопоставляется с JSON по нормализованному тексту.

Запуск: python tools/physiology/recover_missing_answers.py [--check]
"""
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

TOKEN_RE = re.compile(r"\d{1,2}(?:\s*,\s*\d)*\.?")


def antiword(doc: Path) -> str:
    raw = subprocess.run(["antiword", str(doc)], capture_output=True).stdout
    for enc in ("utf-8", "cp1251"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("cp1251", "ignore")


def norm(s: str) -> str:
    return re.sub(r"\s+", "", s.lower()).strip("«».,:;—-")


def fill_empty(manual, answers_by_number: dict[int, str], source: str) -> list[tuple[dict, str]]:
    """Проставляет answer только там, где он пуст и есть ключ в source."""
    filled = []
    for l in manual.get("lessons", []):
        for t in l.get("tests", []):
            for q in t.get("questions", []):
                key = answers_by_number.get(q["number"])
                if key and not q.get("answer"):
                    q["answer"] = key
                    filled.append((q, f"{source} №{q['number']}"))
        for b in l.get("banks", []):
            for q in b.get("questions", []):
                key = answers_by_number.get(q["number"])
                if key and not q.get("answer"):
                    q["answer"] = key
                    filled.append((q, f"{source} №{q['number']}"))
    for b in manual.get("banks", []):
        for q in b.get("questions", []):
            key = answers_by_number.get(q["number"])
            if key and not q.get("answer"):
                q["answer"] = key
                filled.append((q, f"{source} №{q['number']}"))
    return filled


def recover_serdce(text: str) -> dict[int, str]:
    """Таблица «Сердечный цикл. Методы исследования.»: 3 колонки пар №|Ответ."""
    idx = text.index("Сердечный цикл. Методы исследования.")
    section = text[idx:text.index("Физиология регуляции сердечной деятельности")]
    rows = []
    for line in section.split("\n"):
        cells = [c.strip() for c in line.split("|")]
        cells = cells[1:-1] if cells and cells[0] == "" else cells
        if not cells or len(cells) < 2 or all(not c for c in cells):
            continue
        if any(re.search(r"[А-Яа-я]{3}", c) and "№" not in c for c in cells):
            continue  # шапка таблицы
        rows.append(cells)
    # пары (№, ответ) по колонкам; колонка = 2 соседних ячейки
    columns: list[list[tuple[int | None, str]]] = [[], [], []]
    for cells in rows:
        for col in range(3):
            if 2 * col + 1 >= len(cells):
                continue
            num_raw = cells[2 * col].replace(".", "").strip()
            ans_raw = cells[2 * col + 1].strip()
            if not ans_raw or not TOKEN_RE.fullmatch(ans_raw.replace(".", ",").replace(" ", "") or ans_raw.replace(" ", "")):
                continue
            num = int(num_raw) if num_raw.isdigit() else None
            ans = ans_raw.replace(".", ",").replace(" ", "")
            columns[col].append((num, ans))
    result: dict[int, str] = {}
    # первый явный якорь каждой колонки (для вывода соседних без якорей)
    anchor_of = []
    for col in columns:
        exp = [(i, n) for i, (n, _) in enumerate(col) if n is not None]
        anchor_of.append(exp[0] if exp else None)
    for ci, col in enumerate(columns):
        if not col:
            continue
        explicit = [(i, n) for i, (n, _) in enumerate(col) if n is not None]
        if explicit:
            first_i, first_n = explicit[0]
            for i, (n, a) in enumerate(col):
                number = n if n is not None else first_n - (first_i - i)
                result[number] = a
            continue
        # без якоря: старт выводим из первой колонки справа с якорем (start - длина)…
        inferred = None
        for cj in range(ci + 1, len(columns)):
            if anchor_of[cj]:
                inferred = anchor_of[cj][1] - len(col)
                break
        if inferred is None:  # …или из конца колонки слева
            for cj in range(ci - 1, -1, -1):
                if anchor_of[cj]:
                    start_i, start_n = anchor_of[cj]
                    inferred = start_n + (len(columns[cj]) - start_i)
                    break
        if inferred is None:
            continue
        for i, (_, a) in enumerate(col):
            result[inferred + i] = a
    return result


def dyhanie_by_text(text: str) -> dict[str, str]:
    """Нормализованное начало текста вопроса → эталон. Банки с инлайн-эталонами:
    строка вопроса «| N. | текст | X |», эталон может стоять в любой строке
    блока вопроса (сползает на последнюю строку вариантов)."""
    out: dict[str, str] = {}
    cur_norm: str | None = None
    cur_key: str | None = None

    def key_of(cell: str) -> str | None:
        k = cell.replace(".", ",").replace(" ", "")
        return k if k and TOKEN_RE.fullmatch(k) else None

    for line in text.split("\n"):
        if "|" not in line:
            continue
        cells = [c.strip() for c in line.split("|")]
        cells = cells[1:-1] if cells and cells[0] == "" else cells
        if len(cells) < 3:
            continue
        num_m = re.match(r"^(\d{1,3})\.$", cells[0].strip())
        if num_m:
            if cur_norm and cur_key:
                out.setdefault(cur_norm, cur_key)
            cur_norm = norm(cells[1])[:40]
            cur_key = key_of(cells[-1])
        elif cur_norm:
            k = key_of(cells[-1])
            if k:
                cur_key = k
    if cur_norm and cur_key:
        out.setdefault(cur_norm, cur_key)
    return out


def main() -> None:
    # --- serdce-sosudistaya ---
    serdce_text = antiword(LIB / "serdce-sosudistaya.doc")
    serdce_keys = recover_serdce(serdce_text)
    print("serdce: извлечено ключей:", len(serdce_keys),
          "| целевые:", {n: serdce_keys.get(n) for n in (59, 71, 72, 74, 83, 90)})
    assert serdce_keys.get(71) == "6,7,2,3,5,1,4", f"якорь 71: {serdce_keys.get(71)}"
    assert serdce_keys.get(72) == "3,1,2,4,5", f"якорь 72: {serdce_keys.get(72)}"
    assert serdce_keys.get(90) == "4", f"якорь 90: {serdce_keys.get(90)}"

    # --- dyhanie-vydelenie (сопоставление по тексту) ---
    dyh_text = antiword(LIB / "dyhanie-vydelenie.doc")
    dyh_keys = dyhanie_by_text(dyh_text)
    print("dyhanie: извлечено ключей по текстам:", len(dyh_keys))

    for name, keys_fn, by_text in (
        ("serdce-sosudistaya", serdce_keys, None),
        ("dyhanie-vydelenie", None, dyh_keys),
    ):
        path = CONTENT / f"{name}.json"
        manual = json.loads(io.open(path, encoding="utf-8").read())
        filled = []
        for l in manual.get("lessons", []):
            for t in l.get("tests", []):
                for q in t.get("questions", []):
                    if q.get("answer"):
                        continue
                    if by_text is None:
                        key = keys_fn.get(q["number"])
                    else:
                        key = by_text.get(norm(q["text"])[:40])
                    if key:
                        q["answer"] = key
                        filled.append((q["number"], key))
        if CHECK_ONLY:
            print(f"{name}: (check) нашли бы эталоны для {len(filled)}:", filled)
            continue
        io.open(path, "w", encoding="utf-8", newline="\n").write(
            json.dumps(manual, ensure_ascii=False, indent=1)
        )
        print(f"{name}: JSON обновлён, проставлено {len(filled)}:", filled)


if __name__ == "__main__":
    main()
