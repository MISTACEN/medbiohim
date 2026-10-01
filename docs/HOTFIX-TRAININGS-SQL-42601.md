# HOTFIX trainings.php PG 42601 (2026-09-30)

## Error
```
SQLSTATE[42601]: Syntax error at or near "\"
LINE 1: UPDATE public.training_answers\n SET user_an...
```

## Cause
In PHP **single-quoted** strings, `\n` is **literal** backslash + n, not a newline.
PostgreSQL received the characters `\\` and rejected the query.

## Fix (done in artifacts)
All SQL strings in `trainings.php` now use **real newlines**.

Files (upload to SpaceWeb **now**):
- `spaceweb_upload/config/routes/trainings.php`
- `backend/config/routes/trainings.php`

## GitHub main
If `backend/config/routes/trainings.php` shows placeholder text, restore:
```bash
bash docs/restore-trainings-gh.sh spaceweb_upload/config/routes/trainings.php
```
(requires `gh auth login`)
