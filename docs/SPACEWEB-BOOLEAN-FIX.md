# SpaceWeb: SQLSTATE 22P02 boolean `""`

## Симптом
```text
SQLSTATE[22P02]: invalid input syntax for type boolean: ""
... is_correct='', is_skipped=...
```
Номер `opt-...` меняется; баг один — в boolean уходит пустая строка.

## Причина
`PDO::ATTR_EMULATE_PREPARES => true` → `PDO::PARAM_BOOL` false/null часто подставляется как `""`.

## Исправление
Не биндить boolean. Только SQL-литералы `true` / `false` / `NULL`:
```php
$correctSql = $correct === null ? 'NULL' : ((bool)$correct ? 'true' : 'false');
$skippedSql = (bool)$isSkipped ? 'true' : 'false';
```

## Файлы
- `spaceweb_upload/config/routes/trainings.php` — answer UPDATE
- `spaceweb_upload/config/routes/platform.php` — trainer_feed_answers
- `spaceweb_upload/config/routes/preparation.php` — test_preparation_results (`$okSql`)
- зеркала в `backend/config/routes/`

## Деплой
Залить три route-файла на SpaceWeb. Миграции БД не нужны.

## Сессии / force / досрочно
См. `docs/SPACEWEB-TRAININGS-AND-SESSIONS.md`.
