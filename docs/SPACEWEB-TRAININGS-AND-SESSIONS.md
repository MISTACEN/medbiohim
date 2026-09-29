# Trainings + sessions (актуально 2026-09-29)

## SpaceWeb: `config/routes/trainings.php`

### Boolean 22P02
`PDO::ATTR_EMULATE_PREPARES=true` → `PARAM_BOOL false` становится `""`.
В UPDATE answer **только SQL-литералы**:
```php
$correctSql = $correct === null ? 'NULL' : ((bool)$correct ? 'true' : 'false');
$skippedSql = (bool)$isSkipped ? 'true' : 'false';
// is_correct = {$correctSql}, is_skipped = {$skippedSql}
```

### Незавершённые сессии
- Статус `in_progress` хранится, пока пользователь сам не завершит/не отменит.
- `POST /trainings` без `force` → 409 `TRAINING_IN_PROGRESS` + `existing_training_id`.
- `POST /trainings` с `"force": true` → отмена всех in_progress, создание новой.
- `POST /trainings/{id}/complete` — в любой момент (досрочно); неотвеченные → `is_skipped=true`.
- `POST /trainings/{id}/cancel` — отмена без оценки.

### Деплой SpaceWeb
Залить: `spaceweb_upload/config/routes/trainings.php`  
(то же содержимое в `backend/config/routes/trainings.php`).

## Frontend
- `src/components/trainers/HistologyTrainer.tsx` — досрочно / отмена / force start / «К выбору (сохранить)»
- `src/app/tests/preparation/[id]/page.tsx` — «Сохранить и выйти» (не завершает), «Завершить досрочно»
- `src/lib/content-api.ts` — `createHistologyTraining({ force?: boolean })`

## GPT / Supabase import
См. `docs/GPT-FULL-TASK-HISTOLOGY-IMPORT.md`  
SQL (локально / artifacts, крупные файлы):
- `docs/20260929_import_histology_exam_questions_uuid.sql`
- `docs/20260928_import_histology_tests.sql`
