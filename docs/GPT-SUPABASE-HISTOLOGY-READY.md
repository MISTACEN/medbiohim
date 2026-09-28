# Инструкции для GPT + Supabase: гистология

**Полная инструкция:** [`docs/CHATGPT-HISTOLOGY-FULL.md`](./CHATGPT-HISTOLOGY-FULL.md)

Дата: 2026-09-28 · Репо: `MISTACEN/medbiohim` main

## Чеклист для GPT (по порядку)

1. `docs/20260928_sync_histology_em_captions.sql` — captions 28 ЭМ  
2. `docs/20260928_sync_histology_em_captions_by_name.sql` — fallback  
3. `docs/20260928_dedupe_histology_em_cards.sql` — дубли ЭМ  
4. `docs/20260928_import_histology_tests.sql` — тесты цито+эмбрио (163 MCQ)  
5. `docs/20260928_import_histology_ticket_questions.sql` — билеты (~350) + ticket_banks  

## Проверки

```sql
SELECT COUNT(*) FROM exam_questions WHERE subject_slug='histology';
SELECT id, title FROM ticket_banks WHERE subject_slug='histology';
SELECT id, title FROM tests WHERE subject_slug='histology';
SELECT COUNT(*) FROM trainer_feed_cards WHERE subject_slug='histology' AND (mode_set='electronogram' OR tags @> ARRAY['electronogram']::text[]);
```

## Важно

- `subject_slug = histology`
- Не DELETE без фильтра по histology
- SpaceWeb: залить `data/tests.json`, `data/tickets_bank.json`, `data/questions_bank.json`, `data/questions_by_subject/histology.json`, boolean-fix в trainings.php
- Vercel не деплоит PHP

## Уже на фронте

Микропрепараты (атлас+тренажёр), билеты histology включены (`subjectSlug.ts`), дедуп ЭМ на клиенте.

## Ещё не импортировано

Сборники общей гистологии / 2008 / федеральные тесты; schemes; methodics; captions световых препаратов.
