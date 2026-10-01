# histology-gpt-package (данные для GPT)

Полный пакет SQL/JSON лежит в локальных `artifacts/docs/` и `artifacts/backend/data/`.

На GitHub уже есть:
- `docs/CHATGPT-HISTOLOGY-FULL.md` — полная инструкция для ChatGPT
- `docs/GPT-SUPABASE-HISTOLOGY-READY.md` — краткий чеклист
- `docs/20260928_dedupe_histology_em_cards.sql`
- `docs/import_histology_tickets_rest.py`
- `backend/data/tickets_bank.json`
- `backend/data/questions_by_subject/INDEX.json`

Если нужны **полные** SQL импорты (~350 билетов, 163 теста, 28 captions), возьми из artifacts или попроси Grok повторно залить крупные файлы частями (`docs/histology-sql-tickets/`, `docs/histology-sql-tests/`, `docs/histology-import/`).

Порядок для GPT — в `docs/CHATGPT-HISTOLOGY-FULL.md`.
