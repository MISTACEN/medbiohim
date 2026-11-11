# -*- coding: utf-8 -*-
"""Вставка ```image блоков в лекции физиологии по якорям-заголовкам.

Якорь: заголовок с заданным префиксом (### N.N. ...), далее пропускаем
offset параграфов после заголовка и вставляем image-блок после него.
Idempotent: если блок с этим url уже есть в файле — пропуск.

Запуск: python -E tools/physiology/insert_figs.py
"""
import io
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LECT = REPO / "public" / "content" / "lectures" / "physiology"
BASE = "/library/lectures/vozbudimye-sistemy/figs"

# (файл лекции, префикс заголовка, offset параграфов, url, caption)
INSERTS = [
    ("lec-44db6ebee0344e24.md", "### 3.2.", 0, f"{BASE}/t1-fig1-metody-issledovaniya.png",
     "Рис. 2 (методичка, занятие 1). Физиологические методы исследования: наблюдение, эксперимент, моделирование"),
    ("lec-44db6ebee0344e24.md", "### 3.4.", 0, f"{BASE}/t1-fig2-osnovnye-ponyatiya.png",
     "Рис. 4 (методичка, занятие 1). Основные понятия физиологии: функции, состояния, раздражители, возбудимые клетки"),
    ("lec-7f9d0be106de460f.md", "### 3.1.", 0, f"{BASE}/t1-fig4-stroenie-membrany.png",
     "Строение биологической мембраны: липидный бислой, интегральные белки, ионные каналы, гликоликадиды и холестерол"),
    ("lec-7f9d0be106de460f.md", "### 3.2.", 0, f"{BASE}/t1-fig5-transport-cherez-membranu.png",
     "Транспортные пути через клеточную мембрану: простая и облегчённая диффузия, активный транспорт"),
    ("lec-7f9d0be106de460f.md", "### 3.7.", 0, f"{BASE}/t1-fig6-ionnye-kanaly-pd.png",
     "Рис. 3 (методичка, занятие 1). Состояние ионных каналов при возникновении потенциала действия: m- и h-ворота, деполяризация и реполяризация"),
    ("lec-7f9d0be106de460f.md", "### 3.7.", 1, f"{BASE}/t1-fig7-pd-provodimosti.png",
     "Потенциал действия (А) и изменения проводимости мембраны для Na⁺ и K⁺ (Б); КУД — критический (пороговый) потенциал"),
    ("lec-7f9d0be106de460f.md", "### 3.8.", 0, f"{BASE}/t1-fig8-pd-vozbudimost.png",
     "График потенциала действия и график возбудимости: фазы 1–5 (латентный период, укорочение… рефрактерность и экзальтация)"),
    ("lec-8c7c3b4980a04971.md", "### 3.4.", 0, f"{BASE}/t1-fig3-apparatura.png",
     "Рис. 3 (методичка, занятие 1). Аппаратура физиологического эксперимента: стимуляторы, регистраторы, электроды, преобразователи, усилители"),
    ("lec-7689425cf2c14023.md", "### 3.6.", 0, f"{BASE}/t3-fig1-neironogrammy.png",
     "Нейронограммы нейронов с разными видами импульсной активности; стрелкой отмечено раздражение (методичка, занятие 3)"),
    ("lec-7689425cf2c14023.md", "### 3.8.", 0, f"{BASE}/t3-fig2-impulsy-nervnogo-volokna.png",
     "Осциллограммы потенциалов действия, распространяющихся по нервному волокну (методичка, занятие 3–4)"),
    ("lec-f032784e3caf4e67.md", "### 3.5.", 0, f"{BASE}/t4-fig3-miogramma.jpg",
     "Миограмма сокращений скелетной мышцы при разной частоте раздражения: одиночные сокращения переходят в зубчатый и гладкий тетанус (методичка, занятие 4)"),
    ("lec-f032784e3caf4e67.md", "### 3.12.", 0, f"{BASE}/t4-fig2-emg.png",
     "Образец записи интерференционной электромиограммы (шкала: 142 мкВ, 0,02 с)"),
]


def find_heading(lines, prefix):
    for i, line in enumerate(lines):
        if line.startswith(prefix):
            return i
    return -1


def paragraph_end(lines, start):
    """Индекс строки, где кончается параграф, начавшийся на start (до пустой/заголовка/фенса)."""
    i = start
    while i < len(lines) and lines[i].strip() and not lines[i].startswith("```") and not lines[i].startswith("#"):
        i += 1
    return i


def main() -> None:
    by_file = {}
    for f, h, off, url, cap in INSERTS:
        by_file.setdefault(f, []).append((h, off, url, cap))

    for fname, blocks in by_file.items():
        path = LECT / fname
        text = io.open(path, encoding="utf-8").read()
        if "```image" in text and fname == "lec-f032784e3caf4e67.md":
            pass
        lines = text.split("\n")
        for anchor, offset, url, caption in blocks:
            if url in text:
                print(f"{fname}: {url} уже вставлен, пропуск")
                continue
            hi = find_heading(lines, anchor)
            if hi < 0:
                print(f"{fname}: !! якорь не найден: {anchor}")
                continue
            # пропускаем заголовок и offset параграфов
            i = hi + 1
            inserted = 0
            while i < len(lines) and inserted <= offset:
                if lines[i].strip() and not lines[i].startswith("#") and not lines[i].startswith("```"):
                    end = paragraph_end(lines, i)
                    if inserted == offset:
                        block = ["```image", json.dumps({"url": url, "caption": caption}, ensure_ascii=False), "```"]
                        lines[end:end] = ["", *block]
                        print(f"{fname}: вставлен после строки {end}: {url.split('/')[-1]}")
                        break
                    inserted += 1
                    i = end
                else:
                    i += 1
            else:
                print(f"{fname}: !! не найден параграф {offset} после {anchor}")
        io.open(path, "w", encoding="utf-8", newline="\n").write("\n".join(lines))


if __name__ == "__main__":
    main()
