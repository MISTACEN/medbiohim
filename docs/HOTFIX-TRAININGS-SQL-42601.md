# HOTFIX trainings.php PG 42601 (2026-09-30)

## Bug
Single-quoted PHP strings contained literal `\\n` (backslash + n).
PostgreSQL received:
```
UPDATE public.training_answers\\n SET user_answer...
```
→ SQLSTATE[42601] syntax error at or near "\\"

## Fix
Replace literal `\\n` with **real newlines** in all SQL strings in:
- `backend/config/routes/trainings.php`
- `spaceweb_upload/config/routes/trainings.php`

## Deploy NOW (SpaceWeb)
Upload fixed file from artifacts:
`spaceweb_upload/config/routes/trainings.php`

Local artifacts are correct. After upload, answer endpoint works again.
