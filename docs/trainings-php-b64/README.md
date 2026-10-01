# trainings.php (fixed) — base64 parts

**Source of truth (full file):** local artifacts
- `spaceweb_upload/config/routes/trainings.php`
- `backend/config/routes/trainings.php`

## Assemble from these parts
```bash
cat docs/trainings-php-b64/part*.txt | tr -d '\n' | base64 -d > trainings.php
php -l trainings.php
grep -n 'correctSql\|force' trainings.php
```

## Features
- SQL boolean literals (`true`/`false`/`NULL`) — no 22P02
- `force: true` on POST /trainings
- Early complete → unanswered as is_skipped=true
- in_progress until user completes/cancels

## Frontend
- `frontend/src/lib/content-api.ts` — on GitHub
- HistologyTrainer + preparation page — artifacts (deploy Vercel)

## Docs
- `docs/SPACEWEB-BOOLEAN-FIX.md`
- `docs/SPACEWEB-TRAININGS-AND-SESSIONS.md`
