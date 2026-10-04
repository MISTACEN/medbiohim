# HOTFIX trainings.php PG 42601 — historical record

Дата инцидента: 2026-09-30.

Причина была связана с literal `\\n` в старом PHP SQL payload. Исправленная реализация уже находится в текущем `backend/config/routes/trainings.php`.

Важно: инструкции про `spaceweb_upload/` и `docs/restore-trainings-gh.sh` устарели и больше не применяются.

Текущий deployment source:
- `backend/config/routes/trainings.php`
- `.github/workflows/deploy-backend.yml`

Этот документ сохраняется только как журнал инцидента.
