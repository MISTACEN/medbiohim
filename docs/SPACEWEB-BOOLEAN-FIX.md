# SpaceWeb: SQLSTATE 22P02 boolean `""`

## Симптом

На **любом** ответе в тренажёре:

```text
SQLSTATE[22P02]: invalid input syntax for type boolean: ""
... SET user_answer='opt-XXXX',is_correct='',is_skipped=...
```

Номер `opt-...` меняется — это id варианта. Баг **один**: в boolean уходит пустая строка.

## Причина

В `src/Database/Connection.php`:

```php
PDO::ATTR_EMULATE_PREPARES => true
```

При emulated prepares `false` / `null` для boolean часто подставляются как `""` → PostgreSQL 22P02.

## Исправление (обязательно на SpaceWeb)

В `config/routes/trainings.php` в хендлере `POST /api/v1/trainings/{id}/answer`
**заменить** блок UPDATE на:

```php
// ATTR_EMULATE_PREPARES=true turns PDO::PARAM_BOOL false into "" → PG 22P02.
// Embed boolean as SQL literals only (never bind boolean / never use '').
$correctSql = $correct === null ? 'NULL' : ((bool)$correct ? 'true' : 'false');
$skippedSql = (bool)$isSkipped ? 'true' : 'false';
$up = $db->prepare(
    'UPDATE public.training_answers
     SET user_answer = :answer,
         is_correct = ' . $correctSql . ',
         is_skipped = ' . $skippedSql . ',
         answered_at = now()
     WHERE id = :id
     RETURNING *'
);
if ($answer !== null) {
    $up->bindValue(':answer', (string)$answer, PDO::PARAM_STR);
} else {
    $up->bindValue(':answer', null, PDO::PARAM_NULL);
}
$up->bindValue(':id', (string)$current['id'], PDO::PARAM_STR);
$up->execute();
```

Аналогично:
- `platform.php` — insert в `trainer_feed_answers`
- `preparation.php` — `is_correct` через `$okSql` (`true`/`false`) — **уже на GitHub**

Полные файлы локально: `spaceweb_upload/config/routes/{trainings,platform,preparation}.php`

## Деплой

1. Залить на SpaceWeb из `spaceweb_upload/config/routes/`:
   - `trainings.php` (главный — ошибка на ответе)
   - `platform.php`
   - `preparation.php`
2. Миграции БД **не нужны**.
3. Проверить: ответить на вопрос → 200, без 22P02.

## Не чинить в SQL/Supabase

Это не схема БД и не фронт. Только PHP binding на SpaceWeb.
