import zipfile, json, re, hashlib, html, subprocess
from pathlib import Path
from docx import Document

ZIP = Path("features.zip")
OUT = Path("histology_import_bundle.json")

def doc_text(z, n):
    if n.lower().endswith(".docx"):
        p = Path("/tmp/hist.docx")
        p.write_bytes(z.read(n))
        return "\n".join(x.text for x in Document(str(p)).paragraphs)
    p = Path("/tmp/hist.doc")
    p.write_bytes(z.read(n))
    return subprocess.run(["antiword", str(p)], capture_output=True, text=True, errors="replace", timeout=30).stdout

def sid(path):
    return "histology-" + hashlib.sha1(path.encode()).hexdigest()[:14]

def htmlify(text):
    out = []
    for block in re.split(r"\n\s*\n", text):
        lines = [x.strip() for x in block.splitlines() if x.strip()]
        if lines:
            out.append("<p>" + html.escape(" ".join(lines)) + "</p>")
    return "\n".join(out)

def answer_pairs(text):
    return [(int(m.group(1)), int(m.group(2)))
            for m in re.finditer(r"(?<!\d)(\d{1,3})\s*[–—-]\s*([1-5])(?!\d)", text)]

def parse_mcq(text):
    lines = text.splitlines()
    qs = []
    qstart = re.compile(r"^\s*(\d{1,3})[.)]\s+(.+)$")
    optstart = re.compile(r"^\s*([1-5])\s*[-.)]\s*(.+)$")
    i = 0
    while i < len(lines):
        m = qstart.match(lines[i])
        if not m:
            i += 1
            continue
        n = int(m.group(1))
        qhead = m.group(2).strip()
        j = i + 1
        first = None
        while j < min(len(lines), i + 35):
            om = optstart.match(lines[j])
            if om and int(om.group(1)) == 1:
                first = j
                break
            if j > i + 1 and qstart.match(lines[j]):
                break
            j += 1
        if first is None:
            i += 1
            continue
        opts = []
        qtxt = qhead
        for line in lines[i + 1:first]:
            if line.strip():
                qtxt += " " + line.strip()
        k = first
        expected = 1
        while k < min(len(lines), first + 80):
            om = optstart.match(lines[k])
            if om and int(om.group(1)) == expected:
                opts.append(om.group(2).strip())
                expected += 1
                k += 1
                while k < len(lines):
                    nm = optstart.match(lines[k])
                    qm = qstart.match(lines[k])
                    if nm and int(nm.group(1)) == expected:
                        break
                    if qm and len(opts) >= 3:
                        break
                    if lines[k].strip():
                        opts[-1] += " " + lines[k].strip()
                    k += 1
                if expected > 5:
                    break
            else:
                break
        if len(opts) >= 3:
            qs.append({"number": n, "text": qtxt, "options": opts[:5]})
            i = max(k, i + 1)
        else:
            i += 1
    return qs

def parse_topic_tests(text):
    rows = []
    markers = list(re.finditer(r"^\s*Ответы[^\n]*$", text, flags=re.I | re.M))
    if not markers:
        return rows
    prev = 0
    for idx, m in enumerate(markers):
        question_block = text[prev:m.start()]
        next_start = markers[idx + 1].start() if idx + 1 < len(markers) else len(text)
        answer_block = text[m.end():next_start]
        qs = parse_mcq(question_block)
        mp = {a: b - 1 for a, b in answer_pairs(answer_block)}
        for q in qs:
            if q["number"] in mp:
                rows.append({**q, "answer": mp[q["number"]]})
        prev = m.end()
    out, seen = [], set()
    for q in rows:
        key = (re.sub(r"\s+", " ", q["text"]).strip().lower(),
               tuple(o.strip().lower() for o in q["options"]))
        if key in seen:
            continue
        seen.add(key)
        out.append(q)
    return out

def parse_bare_closed_tests(text):
    out = []
    for title in ["ЦИТОЛОГИЯ", "ЭМБРИОЛОГИЯ"]:
        m = re.search(
            rf"(?is)^\s*{title}\s*\n\s*\(\s*тесты\s+закрытого\s+типа\s*\).*?(?=^\s*ОТВЕТЫ\s*$)",
            text, flags=re.M,
        )
        if not m:
            continue
        block = m.group(0)
        body = re.sub(
            r"^\s*.*?\(\s*тесты\s+закрытого\s+типа\s*\)\s*\n",
            "", block, count=1, flags=re.I | re.S
        )
        groups, cur = [], []
        for line in body.splitlines():
            if line.strip():
                cur.append(line.strip())
            elif cur:
                groups.append(cur)
                cur = []
        if cur:
            groups.append(cur)
        for idx, g in enumerate(groups, 1):
            if len(g) >= 6:
                out.append({"number": idx, "text": g[0], "options": g[1:6], "topic": title})
    return out

with zipfile.ZipFile(ZIP) as z:
    names = [n for n in z.namelist() if not n.endswith("/") and "/~$" not in n and not n.endswith(".tmp")]
    pkg = json.loads(z.read("features/histology-content/content-package/package.json"))

    feed = []
    for fn in ["feed-cards.json", "electronograms-feed-cards.json"]:
        feed += json.loads(z.read("features/histology-content/content-package/" + fn))["items"]

    lectures = json.loads(z.read("features/histology-content/content-package/lectures-skeleton.json"))["items"]

    docs = []
    for n in names:
        if not n.lower().endswith((".doc", ".docx")):
            continue
        try:
            txt = doc_text(z, n)
        except Exception:
            continue
        if not txt.strip():
            continue
        ext = Path(n).suffix.lower()[1:]
        docs.append({
            "id": sid(n),
            "title": Path(n).stem,
            "source_path": n,
            "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" if ext == "docx" else "application/msword",
            "original_format": ext,
            "source_archive": "features.zip",
            "note": "Исходный Word-файл из features.zip.",
            "content_html": htmlify(txt),
        })

    tests = []
    known = [
        ("features/histology-content/tests/federal/База тестовых заданий/федеральные тесты стом.doc", "Федеральные тесты: стоматология", "direct"),
        ("features/histology-content/tests/collections/3_Сборники тестовых заданий/Сборник тестовых заданий по цитологии и эмбриологии.docx", "Сборник тестовых заданий по цитологии и эмбриологии", "topic"),
        ("features/histology-content/tests/collections/3_Сборники тестовых заданий/Сборник тестовых заданий по общей гистологии.doc", "Сборник тестовых заданий по общей гистологии", "topic"),
    ]

    for n, title, mode in known:
        if n not in names:
            continue
        txt = doc_text(z, n)
        qs = parse_mcq(txt) if mode == "direct" else parse_topic_tests(txt)

        if "цитологии и эмбриологии" in title.lower():
            bare = parse_bare_closed_tests(txt)
            extra = []
            answer_blocks = list(re.finditer(r"(?im)^\s*ОТВЕТЫ\s*$", txt))
            for ai, mk in enumerate(answer_blocks):
                nxt = answer_blocks[ai + 1].start() if ai + 1 < len(answer_blocks) else len(txt)
                block = txt[mk.end():nxt]
                pairs = answer_pairs(block)
                if not pairs:
                    continue
                topic = "ЭМБРИОЛОГИЯ" if "эмбриолог" in block.lower() and "цитолог" not in block.lower() else "ЦИТОЛОГИЯ"
                amap = {a: b - 1 for a, b in pairs}
                for q in bare:
                    if q.get("topic") == topic and q["number"] in amap:
                        extra.append({**q, "answer": amap[q["number"]]})
            qs += extra

        if mode == "direct":
            answer_text = txt[txt.lower().find("ответы"):]
            mp = {a: b - 1 for a, b in answer_pairs(answer_text)}
            qs = [{**q, "answer": mp[q["number"]]} for q in qs if q["number"] in mp]

        qrows = []
        for i, q in enumerate(qs):
            answer = int(q.get("answer", -1))
            if not 0 <= answer < len(q.get("options", [])):
                continue
            qrows.append({
                "source_key": sid(n) + "-q-" + str(i + 1).zfill(5),
                "text": q["text"], "type": "mcq", "answer": answer,
                "options": q["options"], "difficulty": 2,
            })
        if qrows:
            tests.append({
                "source_key": sid(n),
                "title": title, "subject_slug": "histology", "specialty_slug": "mbh",
                "is_published": True, "max_attempts": 3, "questions": qrows,
            })

bundle = {
    "package_id": pkg["packageId"], "version": pkg["version"], "specialty_slug": "mbh",
    "subject_slug": "histology",
    "stats": {
        "trainer_cards": len(feed), "documents": len(docs), "lectures": len(lectures),
        "tests": len(tests), "test_questions": sum(len(x["questions"]) for x in tests),
    },
    "trainer_cards": feed, "lectures": lectures,
    "sources": [{
        "id": d["id"], "title": d["title"], "source_path": d["source_path"],
        "mime_type": d["mime_type"], "original_format": d["original_format"],
        "source_archive": "features.zip", "note": d["note"],
    } for d in docs],
    "materials": [{
        "source_key": d["id"], "title": d["title"],
        "type": "docx" if d["original_format"] == "docx" else "other",
        "content_html": d["content_html"], "order_index": i, "is_published": True,
        "source_id": d["id"],
    } for i, d in enumerate(docs)],
    "tests": tests,
}
OUT.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(bundle["stats"], ensure_ascii=False))
