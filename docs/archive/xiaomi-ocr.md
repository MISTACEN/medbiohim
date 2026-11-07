# OCR документов через Xiaomi-OCR-0

## Что уже сделано

- `POST /api/v1/my-tools/extract-pdf` — текстовый слой PDF (unpdf в Worker).
- `POST /api/v1/my-tools/ocr` — распознавание фото/скана через внешний шлюз.
- Импорт в занятие: Мастерская → «Занятия» → «Импорт документа» (.md, .txt, .docx, .pdf, фото).

## Почему нужен внешний сервер

Xiaomi-OCR-0 (Apache 2.0, ~0.87B параметров, веса `xiaomi-research/Xiaomi-OCR-0`)
не запускается в Cloudflare Workers: V8-изолят без GPU. Публичного hosted API у
модели нет — HF Space `xiaomi-research/Xiaomi-OCR-0` статический, inference
providers отсутствуют. Поэтому Worker выступает прокси, а модель живёт на своём
GPU-сервере с OpenAI-совместимым `/v1/chat/completions`.

## Запуск сервера

```bash
# vLLM (рекомендуется), GPU 4–8 ГБ VRAM
vllm serve SeerRay-Lab/Xiaomi-OCR-0 --max-model-len 16384 --port 8000
# или Ollama (экспериментально)
ollama pull longwayxu/xiaomi-ocr-0:bf16
```

Закройте сервер Cloudflare Tunnel / Access и не отдавайте его в интернет напрямую.

## Настройка Worker

Секреты Cloudflare для `medbiohim-api`:

| Переменная | Значение |
| --- | --- |
| `OCR_API_URL` | `https://ocr.internal/v1/chat/completions` |
| `OCR_API_KEY` | токен вашего шлюза (если требуется) |
| `OCR_MODEL` | `xiaomi-ocr-0` (по умолчанию) |

Без `OCR_API_URL` ручка отвечает `503 OCR_NOT_CONFIGURED`, импорт фото
показывает это же сообщение, остальные форматы работают.

## Ограничения

- Русский язык у модели официально не заявлен: проверьте 20–30 своих страниц
  (печатных и рукописных) перед тем, как полагаться на OCR.
- Плотная страница распознаётся секунды-десятки секунд; запрос ограничен 60 с.
- Для сканов PDF без текстового слоя используйте OCR по изображению.
