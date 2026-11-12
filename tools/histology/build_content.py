# -*- coding: utf-8 -*-
"""Сборка банков тестовых заданий по гистологии из исходных .doc/.docx
(папка «Гистология») в формат контента, зеркалящий физиологию
(public/content/physiology/*.json).

Источники (read-only):
  3_Сборники тестовых заданий/Сборник тестовых заданий по цитологии и эмбриологии.doc  (ДВГМУ, 2007)
  3_Сборники тестовых заданий/Сборник тестовых заданий по общей гистологии.doc         (ДВГМУ, 2003)
  3_Сборники тестовых заданий/Сборник тест зад по общ. и частн. гист. 2008.doc         (открытые, без эталонов)
  База тестовых заданий/федеральные тесты стом.doc                                     (ключи в таблице)
  База тестовых заданий/федеральные тесты пед. и леч.doc                               (без эталонов)
  экзаменационные вопросы/задачи по гистологии.doc + эталоны ответов к задачам.docx
  экзаменационные вопросы/экзаменационные вопросы леч. пед.doc + экзам.вопросы стом.doc (открытые)
  Контрольные работы к диагностикам/контрольная работа к 1 диагностике леч.пед..doc    (открытые)
  Контрольные работы к диагностикам/контрольная работа 2 диагностика.doc               (открытые)

Выход: public/content/histology/index.json + {citologiya-embriologiya,
obschaya-gistologiya, chastnaya-gistologiya}.json.
Всё живёт в banks (группировка по занятиям не восстановима); открытые вопросы
— в банках с kind:"open" (options=[], answer = эталон-текст).

Запуск: python -E tools/histology/build_content.py [--check]
  --check  — только отчёт по источникам и покрытию эталонами, без записи JSON.
"""
import io
import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CONTENT = REPO / "public" / "content" / "histology"
# Корень исходников можно переопределить: HISTOLOGY_SOURCES=/путь
SRC = Path(os.environ.get("HISTOLOGY_SOURCES") or r"C:\Users\MISTACEN\Desktop\Гистология")

CHECK_ONLY = "--check" in sys.argv

# Ключ источника -> (путь относительно SRC, читаемое название)
SOURCES = {
    "cit": (
        "3_Сборники тестовых заданий/Сборник тестовых заданий по цитологии и эмбриологии.doc",
        "Тестовые задания по цитологии и эмбриологии (ДВГМУ, 2007)",
    ),
    "obs": (
        "3_Сборники тестовых заданий/Сборник тестовых заданий по общей гистологии.doc",
        "Сборник тестовых заданий по общей гистологии (ДВГМУ, 2003)",
    ),
    "fedped": (
        "База тестовых заданий/федеральные тесты пед. и леч.doc",
        "Федеральные тесты итоговой аттестации, лечебное дело и педиатрия",
    ),
    "fedstom": (
        "База тестовых заданий/федеральные тесты стом.doc",
        "Федеральные типовые тестовые задания по специальности «Стоматология»",
    ),
    "tasks": (
        "экзаменационные вопросы/задачи по гистологии.doc",
        "Экзаменационные задачи по гистологии (леч. и пед. факультеты)",
    ),
    "etalons": (
        "экзаменационные вопросы/эталоны ответов к задачам.docx",
        "Эталоны ответов к экзаменационным задачам",
    ),
    "h2008": (
        "3_Сборники тестовых заданий/Сборник тест зад по общ. и частн. гист. 2008.doc",
        "Гистология: сборник тестовых заданий (ДВГМУ, 2008, открытые)",
    ),
    "examlp": (
        "экзаменационные вопросы/экзаменационные вопросы леч. пед.doc",
        "Экзаменационные вопросы по гистологии (лечебное и педиатрическое дело)",
    ),
    "examstom": (
        "экзаменационные вопросы/экзам.вопросы стом.doc",
        "Экзаменационные вопросы по гистологии (стоматология)",
    ),
    "kontrol1": (
        "Контрольные работы к диагностикам/контрольная работа к 1 диагностике леч.пед..doc",
        "Контрольная работа к 1 диагностике (леч. и пед. факультеты)",
    ),
    "kontrol2": (
        "Контрольные работы к диагностикам/контрольная работа 2 диагностика.doc",
        "Вопросы к итоговой контрольной работе (2 диагностика)",
    ),
}

LEAD = re.compile(r"^(\s*)((?:\d{1,3}\s*[.\-)]\s*)+)(.*)$")
NUM_TOKEN = re.compile(r"(\d{1,3})\s*([.\-)])")


def antiword(doc: Path) -> str:
    raw = subprocess.run(["antiword", str(doc)], capture_output=True).stdout
    for enc in ("utf-8", "cp1251"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("cp1251", "ignore")


def fix_mojibake(s: str) -> str:
    """Чинит текст, в котором cp1251-байты были прочитаны как cp866
    (типично для docx-конвертаций этой кафедры)."""
    if any(0x2500 <= ord(c) <= 0x259F for c in s):
        try:
            return s.encode("cp866").decode("cp1251")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return s
    return s


def docx_paragraphs(path: Path) -> list[str]:
    from docx import Document  # python-docx

    return [
        fix_mojibake(p.text.strip())
        for p in Document(str(path)).paragraphs
        if p.text.strip()
    ]


def join_cont(prev: str, tail: str) -> str:
    tail = tail.strip()
    if not tail:
        return prev
    if prev.endswith("-"):
        return prev[:-1] + tail
    return prev + " " + tail


def lead_tokens(raw: str):
    """[(число, конец_токена_в_строке), ...] для ведущих числовых токенов."""
    m = LEAD.match(raw)
    if not m:
        return None
    return [(int(t.group(1)), t.end()) for t in NUM_TOKEN.finditer(m.group(2))], m


def text_after(raw: str, m, tok_end: int) -> str:
    """Текст после выбранного токена (m — совпадение LEAD)."""
    g2_end = m.end(2)
    g2_start = m.start(2)
    return raw[g2_start + tok_end:g2_end] + m.group(3)


NO_DOT_Q = re.compile(r"^(\d{1,3})\s+\S")


def parse_mcq_region(seg: str):
    """Разбор региона закрытых тестов. Вопросы — строки с 0-го столбца,
    чьё первое число == ожидаемый номер вопроса (или дальше — если номер
    в оригинале набран без точки: «25  На микроциты…»); варианты —
    «1-»/«1.»/«1)», включая артефакты автонумерации Word («334.        1. текст»)."""
    questions = []
    cur = None
    expected_q = 1
    expected_opt = 1
    for raw in seg.split("\n"):
        raw = raw.replace("\r", "")
        tokens = lead_tokens(raw)
        stripped = raw.strip()
        if tokens is None or not stripped:
            # вопрос с номером без точки: «25  На микроциты приходится»
            nd = NO_DOT_Q.match(stripped) if stripped else None
            if (nd and int(nd.group(1)) == expected_q
                    and (cur is None or len(cur["options"]) >= 2)):
                cur = {
                    "number": int(nd.group(1)),
                    "_text": stripped[len(nd.group(1)):].strip(),
                    "options": [],
                }
                questions.append(cur)
                expected_q += 1
                expected_opt = 1
                continue
            if cur is not None and stripped:
                if cur["options"]:
                    cur["options"][-1] = join_cont(cur["options"][-1], raw)
                else:
                    cur["_text"] = join_cont(cur["_text"], raw)
            continue
        nums, m = tokens
        at_col0 = len(raw) - len(raw.lstrip(" ")) == 0
        if cur is None or (at_col0 and len(nums) == 1 and nums[0][0] == expected_q):
            if nums[0][0] != expected_q:
                continue  # мусор до первого вопроса (титул, номер страницы)
            cur = {
                "number": nums[0][0],
                "_text": text_after(raw, m, nums[0][1]).strip(),
                "options": [],
            }
            questions.append(cur)
            expected_q += 1
            expected_opt = 1
            continue
        # внутри вопроса: ищем токен варианта == expected_opt
        opt = next(((n, e) for n, e in nums if 1 <= n <= 9 and n == expected_opt), None)
        if opt is not None:
            cur["options"].append(text_after(raw, m, opt[1]).strip())
            expected_opt += 1
        elif any(n == expected_q for n, _ in nums):
            # вопрос с артефактом автонумерации: «7. 60.  В эпидермисе…»
            tok = next((n, e) for n, e in nums if n == expected_q)
            cur = {
                "number": expected_q,
                "_text": text_after(raw, m, tok[1]).strip(),
                "options": [],
            }
            questions.append(cur)
            expected_q += 1
            expected_opt = 1
        elif cur["options"]:
            cur["options"][-1] = join_cont(cur["options"][-1], raw.strip())
        else:
            cur["_text"] = join_cont(cur["_text"], raw.strip())
    for q in questions:
        q["text"] = re.sub(r"\s+", " ", q.pop("_text")).strip()
    return questions


def parse_open_region(seg: str):
    """Открытые задания «N. текст … ( х )», многострочные."""
    items = []
    cur = None
    expected = 1
    for raw in seg.split("\n"):
        m = re.match(r"^\s{0,3}(\d{1,3})\s*[.\-)]\s*(.*)$", raw)
        if m and int(m.group(1)) == expected:
            cur = {"number": int(m.group(1)), "text": m.group(2).strip()}
            items.append(cur)
            expected += 1
        elif cur is not None:
            cur["text"] = join_cont(cur["text"], raw)
    for it in items:
        it["text"] = re.sub(r"\s+", " ", it["text"]).strip()
    return items


def parse_numbered_answers(seg: str):
    """Блок эталонов: строки «N- текст», перенос строки продолжает ответ."""
    items = []
    cur = None
    expected = 1
    for raw in seg.split("\n"):
        m = re.match(r"^\s*(\d{1,3})\s*[-.)]\s*(.*)$", raw)
        if m and int(m.group(1)) == expected:
            cur = {"number": int(m.group(1)), "text": m.group(2).strip()}
            items.append(cur)
            expected += 1
        elif cur is not None:
            cur["text"] = join_cont(cur["text"], raw)
    return {it["number"]: re.sub(r"\s+", " ", it["text"]).strip() for it in items}


def parse_pair_answers(seg: str):
    """Ключи «1-3, 2-2, …» / «1 – 3;» (закрытые тесты)."""
    keys = {}
    for q, a in re.findall(r"(\d{1,3})\s*[-–—]\s*(\d{1,3})", seg):
        keys.setdefault(int(q), a)
    return keys


# ---------------------------------------------------------------- источники

def source_cit():
    """Сборник 2007: закрытые + открытые тесты по цитологии и эмбриологии.
    Границы регионов ищем по заголовкам, а не по фиксированным смещениям."""
    text = antiword(SRC / SOURCES["cit"][0])

    def header(section, kind):
        for m in re.finditer(r"^\s*%s\s*$" % section, text, re.M):
            tail = text[m.end():m.end() + 90]
            if kind == "closed" and "закрытого" in tail:
                return m.start()
            if kind == "open" and "открытого" in tail:
                return m.start()
        raise SystemExit("cit: заголовок не найден: %s %s" % (section, kind))

    h_cc = header("ЦИТОЛОГИЯ", "closed")
    h_co = header("ЦИТОЛОГИЯ", "open")
    h_ec = header("ЭМБРИОЛОГИЯ", "closed")
    h_eo = header("ЭМБРИОЛОГИЯ", "open")

    answers = {}  # (тема, тип) -> (start, end)
    a_positions = [m.start() for m in re.finditer(r"^\s*ОТВЕТЫ\s*$", text, re.M)]
    for i, p in enumerate(a_positions):
        end = a_positions[i + 1] if i + 1 < len(a_positions) else len(text)
        block = text[p:end]
        theme = "ЦИТОЛОГИЯ" if "ЦИТОЛОГИЯ" in block[:400] else "ЭМБРИОЛОГИЯ"
        kind = "closed" if "закрытого" in block[:400] else "open"
        answers[(theme, kind)] = (p, end)

    banks = []
    for name, qspan, atype in (
        ("Цитология: тесты закрытого типа", (h_cc, h_co), ("ЦИТОЛОГИЯ", "closed")),
        ("Эмбриология: тесты закрытого типа", (h_ec, h_eo), ("ЭМБРИОЛОГИЯ", "closed")),
    ):
        qs = parse_mcq_region(text[qspan[0]:qspan[1]])
        keys = parse_pair_answers(text[answers[atype][0]:answers[atype][1]])
        for q in qs:
            q["answer"] = keys.get(q["number"], "")
        banks.append({"title": name, "questions": qs})

    for name, qspan, atype in (
        ("Цитология: тесты открытого типа", (h_co, h_ec), ("ЦИТОЛОГИЯ", "open")),
        ("Эмбриология: тесты открытого типа", (h_eo, a_positions[0] if a_positions else len(text)), ("ЭМБРИОЛОГИЯ", "open")),
    ):
        qs = parse_open_region(text[qspan[0]:qspan[1]])
        keys = parse_numbered_answers(text[answers[atype][0]:answers[atype][1]])
        for q in qs:
            q["answer"] = keys.get(q["number"], "")
            q["options"] = []
        banks.append({"title": name, "kind": "open", "questions": qs})
    return banks


def source_obs():
    """Сборник 2003: пять тем закрытых тестов, ключи в конце файла."""
    text = antiword(SRC / SOURCES["obs"][0])
    ans_start = text.find("Ответы к теме")
    theme_headers = [
        (m.start(), m.group(0).strip())
        for m in re.finditer(r"^\s*Тема:.*$", text, re.M)
        if m.start() < ans_start
    ]
    key_blocks = re.split(r"Ответы к теме", text[ans_start:])[1:]
    banks = []
    for i, (pos, name) in enumerate(theme_headers):
        end = theme_headers[i + 1][0] if i + 1 < len(theme_headers) else ans_start
        qs = parse_mcq_region(text[pos:end])
        title = re.sub(r"[«»“”.\s]+$", "", re.sub(r"^\s*Тема:\s*", "", name)).strip()
        keys = parse_pair_answers(key_blocks[i])
        for q in qs:
            q["answer"] = keys.get(q["number"], "")
        banks.append({"title": title, "questions": qs})
    return banks


def parse_federal(text):
    """Федеральные банки: вопросы «001.» / «0231.», варианты «1)» или «а)»."""
    questions = []
    cur = None
    for raw in text.split("\n"):
        qm = re.match(r"^(\d{3,4})\s*\.\s*(.*)$", raw)
        if qm:
            cur = {"number": int(qm.group(1)), "text": qm.group(2).strip(), "options": []}
            questions.append(cur)
            continue
        om = re.match(r"^\s*([а-её])\s*[.)\-]\s*(.*)$|^\s{2,}(\d)\s*[.)\-]\s*(.*)$", raw)
        if om and cur is not None:
            cur["options"].append((om.group(2) if om.group(1) else om.group(4)).strip())
            continue
        if cur is not None:
            if cur["options"]:
                cur["options"][-1] = join_cont(cur["options"][-1], raw)
            else:
                cur["text"] = join_cont(cur["text"], raw)
    for q in questions:
        q["text"] = re.sub(r"\s+", " ", q["text"]).strip()
        q["options"] = [re.sub(r"\s+", " ", o).strip() for o in q["options"]]
    return questions


def source_fedstom():
    text = antiword(SRC / SOURCES["fedstom"][0])
    qs = parse_federal(text)
    keys = {}
    am = re.search(r"^\s*Ответы:\s*$", text, re.M)
    if am:
        keys = parse_pair_answers(text[am.end():])
    for q in qs:
        q["answer"] = str(keys[q["number"]]) if q["number"] in keys else ""
    title = "Федеральные типовые тестовые задания (стоматология): болезни пародонта"
    return [{"title": title, "questions": qs}]


def source_fedped():
    text = antiword(SRC / SOURCES["fedped"][0])
    qs = parse_federal(text)
    for q in qs:  # эталоны в файле отсутствуют
        q["answer"] = ""
    title = "Федеральные тесты итоговой аттестации (лечебное дело, педиатрия)"
    return [{"title": title, "questions": qs}]


# ------------------------------------------------- открытые задания (без эталонов)

def open_bank(title: str, questions: list) -> dict:
    """Банк открытых заданий без эталонов (режим разбора)."""
    for q in questions:
        q["options"] = []
        q["answer"] = ""
    return {"title": title, "kind": "open", "questions": questions}


def parse_open_numbered(seg: str, indent_max: int = 10) -> list:
    """Пронумерованные текстовые задания «N. текст», многострочные.
    Строки таблиц («|…») и «[pic]» пропускаются. Артефакт двойной
    автонумерации («1. 1.Спинной мозг…») убирается."""
    items = []
    cur = None
    expected = 1
    for raw in seg.split("\n"):
        if "|" in raw or "[pic]" in raw:
            continue
        m = re.match(r"^ {0,%d}(\d{1,3})\s*[.\-)]\s*(.*)$" % indent_max, raw)
        if m and int(m.group(1)) == expected:
            text = m.group(2).strip()
            # «1. 1.Спинной мозг…» — артефакт двойной нумерации Word
            text = re.sub(r"^%d\s*[.)]\s*" % int(m.group(1)), "", text)
            cur = {"number": int(m.group(1)), "text": text}
            items.append(cur)
            expected += 1
        elif cur is not None and raw.strip():
            cur["text"] = join_cont(cur["text"], raw)
    for it in items:
        it["text"] = re.sub(r"\s+", " ", it["text"]).strip()
    return items


# ---------------------------------------------------------------- сборник 2008

# Темы-упражнения по карточкам/схемам: текстовых заданий не содержат
# (карточки с изображениями — импортировать в текстовый банк нельзя)
H2008_SKIP_THEMES = {
    "ЛЕЙКОЦИТАРНАЯ ФОРМУЛА И ЕЕ АНАЛИЗ",
    "СИСТЕМА СПИННОГО МОЗГА (В СХЕМАХ)",
    "КРОВЕТВОРЕНИЕ",
}


def source_h2008() -> dict:
    """Сборник 2008: открытые задания «…( х )» без эталонов. Внутренние
    темы сборника делятся на эмбриологию, общую и частную гистологию;
    точка деления — тема «СИСТЕМА СПИННОГО МОЗГА (в схемах)» (первая
    тема частной части). «ВОПРОСНИК … за полный курс» — отдельный
    смешанный банк (частичная дубликация тематических заданий снимается
    общей дедупликацией)."""
    text = antiword(SRC / SOURCES["h2008"][0])

    def norm_title(t: str) -> str:
        return re.sub(r"\s+", " ", t).strip().rstrip(".").upper()

    vop = re.search(r"^\s*ВОПРОСНИК\s*$", text, re.M)
    oglavl = text.find("ОГЛАВЛЕНИЕ")
    assert vop and oglavl > vop.start(), "h2008: ВОПРОСНИК/ОГЛАВЛЕНИЕ не найдены"
    themes = [
        (m.start(), norm_title(m.group(1)))
        for m in re.finditer(r"(?m)^\s*Тема[.:]\s+(.+)$", text)
        if m.start() < vop.start()
    ]
    split = next(p for p, n in themes if "В СХЕМАХ" in n)

    emb, obs, chast = [], [], []
    for i, (pos, name) in enumerate(themes):
        end = themes[i + 1][0] if i + 1 < len(themes) else vop.start()
        qs = parse_open_numbered(text[pos:end])
        if name in H2008_SKIP_THEMES:
            continue
        if "ЭМБРИОЛОГИ" in name and pos < split:
            emb += qs
        elif pos < split:
            obs += qs
        else:
            chast += qs
    voprosnik = parse_open_numbered(text[vop.start():oglavl])

    # контроль детерминированности разбора
    for name, qs, expected in (
        ("эмбриология", emb, 42),
        ("общая", obs, 200),
        ("частная", chast, 412),
        ("вопросник", voprosnik, 102),
    ):
        if len(qs) != expected:
            raise SystemExit("h2008: %s: %d заданий вместо %d" % (name, len(qs), expected))

    return {
        "cit": [open_bank("Основы сравнительной эмбриологии (2008, открытые)", emb)],
        "obs": [open_bank("Общая гистология (2008, открытые)", obs)],
        "chas": [
            open_bank("Частная гистология (2008, открытые)", chast),
            open_bank("Вопросник за полный курс (2008, открытые)", voprosnik),
        ],
    }


# ------------------------------------------------- экзаменационные вопросы

EXAM_LP_SECTIONS = [  # заголовок раздела -> manual part
    ("Цитология", "cit"),
    ("Эмбриология", "cit"),
    ("Общая гистология", "obs"),
    ("Нервная система", "chas"),
    ("Сердечно-сосудистая система", "chas"),
    ("Кроветворение", "chas"),
    ("Эндокринная система", "chas"),
    ("Пищеварительная система", "chas"),
    ("Дыхательная система. Система кожных покровов", "chas"),
    ("Мочевая система", "chas"),
    ("Половая система", "chas"),
]
EXAM_STOM_SECTIONS = [
    ("Вопросы по цитологии", "cit"),
    ("Вопросы по эмбриологии", "cit"),
    ("Вопросы по общей гистологии", "obs"),
    ("Вопросы по частной гистологии", "chas"),
    ("Профильные", "chas"),
]
# ожидаемое число вопросов по разделам — страховка от сбоя разбора
EXAM_EXPECTED = {
    "examlp": {"cit": 32, "obs": 44, "chas": 57},
    "examstom": {"cit": 12, "obs": 36, "chas": 39, "prof": 38},
}


def source_exam_list(source_key: str, sections, titles) -> dict:
    text = antiword(SRC / SOURCES[source_key][0])
    marks = []
    for header, part in sections:
        for m in re.finditer(r"(?m)^\s*%s\s*[.]?\s*$" % re.escape(header), text):
            marks.append((m.start(), part))
    marks.sort()
    result = {"cit": [], "obs": [], "chas": [], "prof": []}
    for i, (pos, part) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        result[part] += parse_open_numbered(text[pos:end], indent_max=6)
    for part, expected in EXAM_EXPECTED[source_key].items():
        got = len(result[part])
        if got != expected:
            raise SystemExit(
                "%s: раздел %s: %d вопросов вместо %d" % (source_key, part, got, expected)
            )
    out = {}
    for part, title in titles.items():
        if result[part]:
            out[part] = [open_bank(title, result[part])]
    return out


def source_examlp() -> dict:
    return source_exam_list(
        "examlp",
        EXAM_LP_SECTIONS,
        {
            "cit": "Экзаменационные вопросы (лечебное дело). Цитология и эмбриология",
            "obs": "Экзаменационные вопросы (лечебное дело). Общая гистология",
            "chas": "Экзаменационные вопросы (лечебное дело). Частная гистология",
        },
    )


def source_examstom() -> dict:
    return source_exam_list(
        "examstom",
        EXAM_STOM_SECTIONS,
        {
            "cit": "Экзаменационные вопросы (стоматология). Цитология и эмбриология",
            "obs": "Экзаменационные вопросы (стоматология). Общая гистология",
            "chas": "Экзаменационные вопросы (стоматология). Частная гистология",
            "prof": "Экзаменационные вопросы (стоматология). Профильные (зубочелюстная система)",
        },
    )


# ------------------------------------------------- контрольные работы

KONTROL_EXPECTED = {"kontrol1": 39, "kontrol2": 40}


def source_kontrol(source_key: str) -> list:
    """Контрольная работа: разделы «I./1. заголовок», задания — пункты
    «• …». Каждый пункт становится отдельным открытым заданием; разделы
    без пунктов — одним заданием. Эталонов нет."""
    text = antiword(SRC / SOURCES[source_key][0])
    questions = []
    header = None    # накопленный текст заголовка раздела
    bullet = None    # накопленный текст текущего пункта

    def flush_bullet():
        nonlocal bullet
        if bullet is not None:
            questions.append({"text": join_cont(header, bullet)})
            bullet = None

    def flush_section():
        nonlocal header, bullet
        flush_bullet()
        if header is not None:
            questions.append({"text": header})
        header = None

    for raw in text.split("\n"):
        s = raw.strip()
        if not s:
            continue
        m = re.match(r"^\s*((?:[IVX]{1,5})|\d{1,2})\s*[.)]\s+(.*)$", raw)
        if m:
            flush_section()
            header = m.group(2).strip()
            continue
        if s.startswith("•"):
            flush_bullet()
            bullet = s.lstrip("•").strip()
            continue
        if bullet is not None:
            bullet = join_cont(bullet, s)
        elif header is not None:
            header = join_cont(header, s)
    flush_section()
    for q in questions:
        q["text"] = re.sub(r"\s+", " ", q["text"]).strip()
    if len(questions) != KONTROL_EXPECTED[source_key]:
        raise SystemExit(
            "%s: %d заданий вместо %d" % (source_key, len(questions), KONTROL_EXPECTED[source_key])
        )
    title = {
        "kontrol1": "Контрольная работа №1 (диагностика)",
        "kontrol2": "Контрольная работа №2 (диагностика)",
    }[source_key]
    return [open_bank(title, questions)]


def source_kontrol_all() -> dict:
    """Контрольная №1 (цитология, эмбриология и общая гистология) —
    manual citologiya-embriologiya; итоговая контрольная №2 (общая и
    частная гистология) — manual chastnaya-gistologiya."""
    return {
        "cit": source_kontrol("kontrol1"),
        "chas": source_kontrol("kontrol2"),
    }


# ---------------------------------------------------------------- задачи

TASK_SECTIONS = [  # заголовок раздела -> (банк, manual-slug)
    ("Цитология", "Экзаменационные задачи. Цитология", "citologiya-embriologiya"),
    ("Ткани.", "Экзаменационные задачи. Ткани", "obschaya-gistologiya"),
    ("Кроветворение и иммунная системы.", "Экзаменационные задачи. Кроветворение и иммунная система", "obschaya-gistologiya"),
    ("Нервная система и органы чувств", "Экзаменационные задачи. Нервная система и органы чувств", "chastnaya-gistologiya"),
    ("Сосудистая и эндокринная системы", "Экзаменационные задачи. Сосудистая и эндокринная системы", "chastnaya-gistologiya"),
    ("Органы пищеварения и дыхания", "Экзаменационные задачи. Органы пищеварения и дыхания", "chastnaya-gistologiya"),
    ("Мочевыделительная и половая системы.", "Экзаменационные задачи. Мочевыделительная и половая системы", "chastnaya-gistologiya"),
    ("Эмбриогенез.", "Экзаменационные задачи. Эмбриогенез", "citologiya-embriologiya"),
]
TASK_HEADER_RE = re.compile(
    r"^\s*(Цитология|Ткани\.|Кроветворение и иммунная системы\.|"
    r"Нервная система и органы чувств|Сосудистая и эндокринная системы|"
    r"Органы пищеварения и дыхания|Мочевыделительная и половая системы\.|"
    r"Эмбриогенез\.)\s*$",
    re.M,
)


def source_tasks():
    """Задачи 1..57 + эталоны по порядку (docx-эталоны: 58 абзацев,
    один ответ разбит на два абзаца — задача 19)."""
    text = antiword(SRC / SOURCES["tasks"][0])
    # документ содержит повторный список задач; берём строго последовательные номера
    tasks = []
    cur = None
    expected = 1
    offset = 0
    for raw in text.split("\n"):
        m = re.match(r"^\s{0,3}(\d{1,2})\.\s*(.*)$", raw)
        if m and int(m.group(1)) == expected:
            cur = {"number": int(m.group(1)), "text": m.group(2).strip(), "_pos": offset}
            tasks.append(cur)
            expected += 1
        elif cur is not None and not re.match(r"^\s{0,3}\d{1,2}\.\s", raw):
            cur["text"] = join_cont(cur["text"], raw)
        offset += len(raw) + 1

    et = docx_paragraphs(SRC / SOURCES["etalons"][0])
    # первые абзацы — заголовок «Эталоны ответов…»
    et = [p for p in et if not re.match(r"^(Эталоны|ответов к задачам|лечебного и педиатрического)", p)]
    if len(et) == len(tasks) + 1:
        # задача 19: ответ разбит на два абзаца («…Т-хелперы,» + «В-лимфоциты…»)
        et[18] = join_cont(et[18], et[19])
        del et[19]
    if len(et) != len(tasks):
        raise SystemExit(
            "tasks/etalons mismatch: %d tasks vs %d etalons" % (len(tasks), len(et))
        )

    marks = [(m.start(), m.group(1)) for m in TASK_HEADER_RE.finditer(text)]
    banks = {}  # раздел -> банк
    for _, title, _slug in TASK_SECTIONS:
        banks[title] = {"title": title, "kind": "open", "questions": [], "_slug": _slug}
    for q in tasks:
        q["answer"] = et[q["number"] - 1]
        q["options"] = []
        q["text"] = re.sub(r"\s+", " ", q["text"]).strip()
        section = "Цитология"
        for i, (hpos, hname) in enumerate(marks):
            nxt = marks[i + 1][0] if i + 1 < len(marks) else len(text)
            if hpos <= q["_pos"] < nxt:
                section = hname
                break
        title = next(t for h, t, _ in TASK_SECTIONS if h == section)
        banks[title]["questions"].append(q)
    result = []
    for _, title, _slug in TASK_SECTIONS:
        b = banks[title]
        if not b["questions"]:
            continue
        for q in b["questions"]:
            q.pop("_pos", None)
        result.append(b)
    return result


# ---------------------------------------------------------------- сборка

MANUALS = [
    {
        "slug": "citologiya-embriologiya",
        "title": "Цитология и эмбриология",
        "subtitle": "Клетка и органоиды, жизненный цикл клетки, половые клетки, оплодотворение и эмбриогенез человека",
        "hours": 16,
        "bank_sources": ["cit", "fedped"],
    },
    {
        "slug": "obschaya-gistologiya",
        "title": "Общая гистология",
        "subtitle": "Эпителиальные, соединительные, скелетные, мышечные и нервная ткани; кровь и кроветворение",
        "hours": 30,
        "bank_sources": ["obs"],
    },
    {
        "slug": "chastnaya-gistologiya",
        "title": "Частная гистология",
        "subtitle": "Нервная система, органы чувств, сосудистая и эндокринная системы, пищеварение, дыхание, мочеполовая система",
        "hours": 42,
        "bank_sources": ["fedstom"],
    },
]


def norm_key(text: str) -> str:
    s = text.lower()
    return re.sub(r"[\s.,;:!?()«»„“\"'\-–—…]", "", s)


# Новые источники открытых заданий (задача «импортировать все вопросы»):
# порядок добавления банков в каждый manual и их раскладка по manual'ам.
NEW_BANK_PARTS = {
    "citologiya-embriologiya": [
        ("h2008", "cit"),
        ("examlp", "cit"),
        ("examstom", "cit"),
        ("kontrol", "cit"),
    ],
    "obschaya-gistologiya": [
        ("h2008", "obs"),
        ("examlp", "obs"),
        ("examstom", "obs"),
    ],
    "chastnaya-gistologiya": [
        ("h2008", "chas"),
        ("examlp", "chas"),
        ("examstom", "chas"),
        ("examstom", "prof"),
        ("kontrol", "chas"),
    ],
}


def build():
    per_source = {
        "cit": source_cit(),
        "obs": source_obs(),
        "fedstom": source_fedstom(),
        "fedped": source_fedped(),
        "h2008": source_h2008(),
        "examlp": source_examlp(),
        "examstom": source_examstom(),
        "kontrol": source_kontrol_all(),
    }
    task_banks = source_tasks()  # список банков по разделам (с _slug)

    manuals = []
    seen = set()  # norm_key вопросов (дедупликация между источниками)
    dropped = []
    assembled = []  # (manual spec, banks, new_banks)
    for spec in MANUALS:
        old_banks = []
        for src_key in spec["bank_sources"]:
            for b in per_source[src_key]:
                old_banks.append(dict(b, questions=list(b["questions"])))
        for tb in task_banks:
            if tb["_slug"] == spec["slug"]:
                old_banks.append(dict(tb, questions=list(tb["questions"])))
        new_banks = []
        for key, part in NEW_BANK_PARTS[spec["slug"]]:
            for b in per_source[key][part]:
                new_banks.append(dict(b, questions=list(b["questions"])))
        assembled.append((spec, old_banks, new_banks))

    # Дедупликация по нормализованному тексту вопроса. Сначала все
    # прежние банки (приоритет 0) — в прежнем порядке, поэтому
    # содержимое существующих банков при добавлении источников не
    # меняется; дубликаты снимаются только из новых банков.
    for spec, old_banks, _new in assembled:
        for bank in old_banks:
            unique = []
            for q in bank["questions"]:
                key = norm_key(q["text"])
                if key in seen:
                    dropped.append((bank["title"], q["text"][:60]))
                    continue
                seen.add(key)
                unique.append(q)
            bank["questions"] = unique
    for _spec, _old, new_banks in assembled:
        for bank in new_banks:
            unique = []
            for q in bank["questions"]:
                key = norm_key(q["text"])
                if key in seen:
                    dropped.append((bank["title"], q["text"][:60]))
                    continue
                seen.add(key)
                unique.append(q)
            bank["questions"] = unique

    for spec, old_banks, new_banks in assembled:
        banks = [b for b in old_banks + new_banks if b["questions"]]
        # перенумерация внутри банка
        for bank in banks:
            bank.pop("_slug", None)
            for i, q in enumerate(bank["questions"], 1):
                q["number"] = i
        answered = sum(1 for b in banks for q in b["questions"] if q["answer"])
        total = sum(len(b["questions"]) for b in banks)
        src_key = spec["bank_sources"][0]
        manuals.append({
            "slug": spec["slug"],
            "title": spec["title"],
            "subtitle": spec["subtitle"],
            "semester": 3,
            "year": 2026,
            "hours": spec["hours"],
            "source": {
                "file": SOURCES[src_key][0],
                "title": SOURCES[src_key][1],
            },
            "sections": [],
            "lessons": [],
            "banks": banks,
            "stats": {"questions": total, "answered": answered},
        })

    index = {
        "subject": "histology",
        "manuals": [
            {
                "slug": m["slug"],
                "title": m["title"],
                "subtitle": m["subtitle"],
                "semester": m["semester"],
                "year": m["year"],
                "hours": m["hours"],
                "source": m["source"],
                "content": m["slug"] + ".json",
                "stats": m["stats"],
            }
            for m in manuals
        ],
    }
    return index, manuals, dropped


def dump(path: Path, data) -> None:
    text = json.dumps(data, ensure_ascii=False, indent=1)
    io.open(path, "w", encoding="utf-8", newline="\n").write(text + "\n")


def report(manuals, dropped):
    print("== otchet ==")
    print("SRC:", SRC)
    for key, (rel, title) in SOURCES.items():
        exists = (SRC / rel).exists()
        print("  [%s] %s" % ("OK" if exists else "!!", rel))
    print()
    for m in manuals:
        print("%s: questions=%d answered=%d (%.1f%%)" % (
            m["slug"], m["stats"]["questions"], m["stats"]["answered"],
            100.0 * m["stats"]["answered"] / max(1, m["stats"]["questions"])))
        for b in m["banks"]:
            ans = sum(1 for q in b["questions"] if q["answer"])
            noans = [q["number"] for q in b["questions"] if not q["answer"]]
            kind = b.get("kind", "mcq")
            noans_show = (" (показаны первые %d из %d): %s" % (len(noans[:15]), len(noans), noans[:15])
                          if len(noans) > 15 else ((" bez etalona: %s" % noans) if noans else ""))
            print("  [%s] %s: %d (answered %d)%s" % (
                kind, b["title"], len(b["questions"]), ans, noans_show))
            opt_counts = {}
            for q in b["questions"]:
                opt_counts[len(q["options"])] = opt_counts.get(len(q["options"]), 0) + 1
            print("      options:", dict(sorted(opt_counts.items())))
    total_q = sum(m["stats"]["questions"] for m in manuals)
    total_a = sum(m["stats"]["answered"] for m in manuals)
    print("\nTOTAL: %d questions, %d answered (%.1f%%)" % (total_q, total_a, 100.0 * total_a / max(1, total_q)))
    print("Duplicates dropped: %d" % len(dropped))
    for bank, text in dropped[:30]:
        print("  [%s] %s" % (bank, text))


def main():
    index, manuals, dropped = build()
    if CHECK_ONLY:
        report(manuals, dropped)
        return
    CONTENT.mkdir(parents=True, exist_ok=True)
    dump(CONTENT / "index.json", index)
    for m in manuals:
        dump(CONTENT / (m["slug"] + ".json"), m)
    report(manuals, dropped)
    print("\nWritten: %s" % CONTENT)


if __name__ == "__main__":
    main()
