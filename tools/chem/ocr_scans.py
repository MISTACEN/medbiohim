# -*- coding: utf-8 -*-
"""OCR отсканированных методичек химии (развороты) через Gemini vision.
Запуск: python tools/chem/ocr_scans.py
Вход:  C:/Users/MISTACEN/Downloads/Telegram Desktop/Отсканированный документ*.pdf
Выход: tools/chem/ocr/<basename>/page-NN.txt + <basename>.txt (всё вместе)
"""
import base64
import io
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

import pymupdf

REPO = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "ocr"
SRC_DIR = Path(r"C:\Users\MISTACEN\Downloads\Telegram Desktop")

env = {}
for line in io.open(REPO / ".env.local", encoding="utf-8").read().splitlines():
    m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
    if m:
        env[m.group(1)] = m.group(2)

KEY = env.get("GEMINI_API_KEY")
MODEL = env.get("GEMINI_MODEL", "gemini-2.0-flash")
if not KEY:
    sys.exit("Нет GEMINI_API_KEY в .env.local")

PROMPT = (
    "Это разворот отсканированной страницы учебной методички по химии на русском. "
    "Распознай ВЕСЬ текст с этого разворота (обе страницы), точно сохраняя структуру: "
    "заголовки тем («Тема N...»), номера вопросов («1.», «6-7.»), варианты ответов («1) ... 2) ...»), "
    "таблицы эталонов ответов (№/Ответ), формулы перепечатывай текстом как есть. "
    "Не добавляй комментариев, только распознанный текст. Используй русскую орфографию из скана."
)


MODELS = [MODEL, "gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"]


def ocr_openrouter(api_key: str, png_bytes: bytes, mime: str = "image/png") -> str:
    model = env.get("OPENROUTER_VISION_MODEL", "google/gemini-2.5-flash")
    data_url = f"data:{mime};base64,{base64.b64encode(png_bytes).decode()}"
    body = json.dumps({
        "model": model,
        "max_tokens": 8192,
        "temperature": 0.1,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": PROMPT},
            {"type": "image_url", "image_url": {"url": data_url}},
        ]}],
    }).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST")
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.load(r)
    return (data.get("choices", [{}])[0].get("message", {}) or {}).get("content", "").strip()


def ocr_image(api_key: str, png_bytes: bytes, mime: str = "image/png") -> str:
    or_key = env.get("OPENROUTER_API_KEY")
    body = json.dumps({
        "contents": [{"parts": [
            {"text": PROMPT},
            {"inline_data": {"mime_type": mime, "data": base64.b64encode(png_bytes).decode()}},
        ]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 8192},
    }).encode()
    models = list(dict.fromkeys(MODELS))
    last_error: Exception | None = None
    for model in models:
        req = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
            data=body, headers={"Content-Type": "application/json"}, method="POST")
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    data = json.load(r)
                parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                text = "".join(p.get("text", "") for p in parts).strip()
                if text:
                    return text
                break
            except urllib.error.HTTPError as e:
                last_error = e
                if e.code in (404, 400):  # модель недоступна для ключа — пробуем следующую
                    print(f"    {model}: HTTP {e.code} → следующая модель", flush=True)
                    break
                wait = 5 * (attempt + 1)
                print(f"    retry {attempt + 1}: {e} (ждём {wait}с)", flush=True)
                time.sleep(wait)
            except Exception as e:  # noqa: BLE001
                last_error = e
                wait = 5 * (attempt + 1)
                print(f"    retry {attempt + 1}: {e} (ждём {wait}с)", flush=True)
                time.sleep(wait)
    if last_error:
        print(f"    все модели Gemini не сработали: {last_error}", flush=True)
    if or_key:  # фолбэк: OpenRouter vision
        for attempt in range(3):
            try:
                text = ocr_openrouter(or_key, png_bytes, mime)
                if text:
                    print("    OpenRouter: OK", flush=True)
                    return text
            except Exception as e:  # noqa: BLE001
                wait = 5 * (attempt + 1)
                print(f"    OpenRouter retry {attempt + 1}: {e} (ждём {wait}с)", flush=True)
                time.sleep(wait)
    return "[OCR FAILED]"


def process(pdf_path: Path, ascii_name: str) -> None:
    base = re.sub(r"\.pdf$", "", pdf_path.name, flags=re.I)
    page_dir = OUT / base
    page_dir.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(pdf_path)
    out_all = []
    for i, page in enumerate(doc):
        done_marker = page_dir / f"page-{i + 1:02d}.done"
        txt_path = page_dir / f"page-{i + 1:02d}.txt"
        if done_marker.exists() and txt_path.exists():
            text = io.open(txt_path, encoding="utf-8").read()
            print(f"  стр {i + 1}: кэш", flush=True)
        else:
            pix = page.get_pixmap(dpi=150)
            png = pix.tobytes("png")
            print(f"  стр {i + 1}: {len(png) // 1024} КБ → OCR…", flush=True)
            text = ocr_image(KEY, png)
            io.open(txt_path, "w", encoding="utf-8", newline="\n").write(text)
            io.open(done_marker, "w").write("1")
        out_all.append(f"\n\n===== СТРАНИЦА {i + 1} =====\n\n" + text)
        time.sleep(0.4)
    io.open(OUT / f"{ascii_name}.txt", "w", encoding="utf-8", newline="\n").write("".join(out_all))
    print(f"  → {OUT / (ascii_name + '.txt')}")


def main() -> None:
    targets = []
    for f in sorted(os.listdir(SRC_DIR)):
        if f.startswith("Отсканированн") and f.lower().endswith(".pdf"):
            targets.append(SRC_DIR / f)
    if len(sys.argv) > 1:
        targets = [t for t in targets if sys.argv[1] in t.name]
    for idx, t in enumerate(targets, 1):
        print(f"== {t.name} ({pymupdf.open(t).page_count} стр)")
        process(t, f"doc{idx}")


if __name__ == "__main__":
    main()
