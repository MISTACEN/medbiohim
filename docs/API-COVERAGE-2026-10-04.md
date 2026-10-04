# MEDBIOHIM — API coverage / compatibility audit

Дата: 2026-10-04

## Реальные backend endpoints

Backend уже содержит реальные routes для:
- /auth/register
- /community/posts
- /lectures
- /lectures/{id}
- /lesson-plan
- /questions
- /questions/{id}
- /questions/{id}/report
- /files/{id}
- /admin/schedule
- /groups
- /subjects

## Ошибочная прослойка

Frontend src/lib/api.ts содержит исторические вызовы /api-compat/*.
Отдельный backend route /api-compat не найден.

Не нужно создавать новую compatibility-прослойку вместо исправления frontend.

## Migration rule

При переносе функции:
1. найти реальный backend endpoint;
2. привести payload/response к его контракту;
3. удалить старый (..._args: any[]) wrapper;
4. найти все imports/uses;
5. typecheck + smoke-test;
6. обновить ROADMAP и PHASES_STATUS.

## Особо критичные переходы

register → POST /auth/register
createCommunityPost → POST /community/posts
getLecture → GET /lectures/{id}
getLessonPlan → GET /lesson-plan
getQuestion → GET /questions/{id}
getFile → GET /files/{id}
reportQuestion → POST /questions/{id}/report
adminSaveSchedule → /admin/schedule
