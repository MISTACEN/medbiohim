# SpaceWeb fix: SQLSTATE 22P02 boolean ""

## Cause
`Connection.php` sets `PDO::ATTR_EMULATE_PREPARES => true`.
With emulated prepares, `PDO::PARAM_BOOL` **false** (and sometimes null) is substituted as empty string `""`.
PostgreSQL then fails:

```text
SQLSTATE[22P02]: invalid input syntax for type boolean: ""
is_correct='', is_skipped=...
```

Option id in the message changes every time; the bug is always empty string for boolean.

## Fix
Never bind boolean parameters. Embed SQL literals only:

```php
$correctSql = $correct === null ? 'NULL' : ((bool)$correct ? 'true' : 'false');
$skippedSql = (bool)$isSkipped ? 'true' : 'false';
// ... is_correct = {$correctSql}, is_skipped = {$skippedSql}
```

## Files updated
- `spaceweb_upload/config/routes/trainings.php` — POST `/api/v1/trainings/{id}/answer`
- `spaceweb_upload/config/routes/platform.php` — trainer_feed_answers insert
- `spaceweb_upload/config/routes/preparation.php` — test_preparation_results
- same under `backend/config/routes/`

## Deploy SpaceWeb
Upload/replace on hosting:
1. `config/routes/trainings.php`
2. `config/routes/platform.php`
3. `config/routes/preparation.php`

No DB migration. Restart PHP-FPM if needed.

## Verify
Answer any training question (correct or wrong) — should return 200, no 22P02.
