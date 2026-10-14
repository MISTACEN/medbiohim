# SpaceWeb PHP API — полный инвентарь

**Назначение:** единый список того, что реализовано на SpaceWeb (PHP), чтобы сверять паритет с Cloudflare Worker.

**Источник:** `backend/config/routes.php` + файлы в `backend/config/routes/`.
**Дата снимка:** 2026-10-14.

Колонка **CF** — статус на Cloudflare Worker (обновлять вручную при миграции):

| Символ | Значение |
|--------|----------|
| ✅ | Есть на Worker, контракт сверен |
| 🟡 | Есть частично / shadow / без live RLS smoke |
| 🔴 | Нет на Worker |
| 🔒 | Намеренно заблокировано (fail-closed) |
| — | Не планируется / admin later |

---

## Health / meta

| Method | Path | Файл | Auth | CF |
|--------|------|------|------|-----|
| GET | `/health` | health.php | public | 🟡 |
| GET | `/api/v1/health` | health.php | public | 🟡 |
| GET | `/api/v1` | health.php | public | 🟡 |
| GET | `/api/v1/ping` | health.php | public | 🟡 |

---

## Auth

| Method | Path | Файл | Auth | CF |
|--------|------|------|------|-----|
| POST | `/api/v1/auth/login` | auth.php | public + rate limit | 🔒 |
| POST | `/api/v1/auth/register` | auth.php | public + rate limit | 🔒 |
| POST | `/api/v1/auth/refresh` | auth.php | public | 🔴 |
| POST | `/api/v1/auth/logout` | auth.php | token | 🔴 |
| POST | `/api/v1/auth/recover` | auth.php | public | 🔴 |
| GET | `/api/v1/auth/me` | auth.php | RequireAuth | 🟡 |
| GET | `/api/v1/me` | domain_rest.php | RequireAuth | 🟡 |

---

## Groups & subjects

| Method | Path | Файл | Auth | CF |
|--------|------|------|------|-----|
| GET | `/api/v1/groups` | domain.php | RequireAuth | 🟡 |
| POST | `/api/v1/groups` | domain.php | teacher+ | 🔴 |
| GET | `/api/v1/groups/{id}` | domain_rest.php | RequireAuth | 🔴 |
| PATCH | `/api/v1/groups/{id}` | domain_rest.php | teacher+ | 🔴 |
| DELETE | `/api/v1/groups/{id}` | domain_rest.php | admin/moderator | 🔴 |
| POST | `/api/v1/groups/{id}/members` | domain_rest.php | teacher+ | 🔴 |
| GET | `/api/v1/subjects` | domain.php | RequireAuth + SpecialtyAccess | 🟡 |
| POST | `/api/v1/subjects` | domain.php | teacher+ | 🔴 |
| GET | `/api/v1/subjects/{id}` | domain_rest.php | RequireAuth | 🟡 |
| PATCH | `/api/v1/subjects/{id}` | domain_rest.php | teacher+ | 🔴 |
| DELETE | `/api/v1/subjects/{id}` | domain_rest.php | admin/moderator | 🔴 |
| GET | `/api/v1/subjects/{id}/gradebook` | domain.php | RequireAuth + SpecialtyAccess | 🔴 |

---

## Dashboard, schedule, curriculum

| Method | Path | Файл | Auth | CF |
|--------|------|------|------|-----|
| GET | `/api/v1/dashboard` | platform.php | RequireAuth | 🟡 |
| GET | `/api/v1/schedule` | platform.php (+ schedule services) | RequireAuth | 🟡 |
| GET | `/api/v1/schedule/meta` | (schedule) | RequireAuth | 🟡 |
| GET | `/api/v1/curriculum` | platform / ContentStore | RequireAuth | 🟡 |
| GET | `/api/v1/subjects-catalog` | plans_rest.php | RequireAuth | 🟡 |
| GET | `/api/v1/subject-plans` | plans_rest.php | RequireAuth | 🟡 |
| GET | `/api/v1/subject-plans/{slug}` | plans_rest.php | RequireAuth | 🟡 |
| GET | `/api/v1/subject-materials` | (content) | RequireAuth + specialty | 🟡 |

*Точные schedule admin endpoints — в admin.php / admin schedule routes.*

---

## Homework

| Method | Path | Файл | Auth | CF |
|--------|------|------|------|-----|
| GET | `/api/v1/homeworks` | homework.php | RequireAuth + group | 🟡 |
| POST | `/api/v1/homeworks` | homework.php | auth (staff или member группы) | 🔴 |
| POST | `/api/v1/homeworks/{id}/submit` | homework.php | RequireAuth | 🔴 |
| POST | `/api/v1/submissions/{id}/grade` | homework.php | teacher+ | 🔴 |
| POST | `/api/v1/homeworks/{id}/progress` | (если есть в planner) | student-owned | 🟡 |

---

## Tests & attempts

| Method | Path | Файл | Auth | CF |
|--------|------|------|------|-----|
| GET | `/api/v1/tests` | tests.php | RequireAuth | 🟡 |
| GET | `/api/v1/tests/curriculum-map` | tests.php | RequireAuth | 🔴 |
| GET | `/api/v1/tests/chemistry-master` | tests.php | RequireAuth | 🔴 |
| GET | `/api/v1/tests/{id}` | tests.php | RequireAuth (без answer key в options) | 🟡 |
| POST | `/api/v1/tests/{id}/start` | tests.php | RequireAuth | 🔒 |
| POST | `/api/v1/tests/{id}/attempts` | tests.php | RequireAuth | 🔒 |
| POST | `/api/v1/tests/attempts/{id}/answers` | tests.php | RequireAuth | 🔒 |
| POST | `/api/v1/tests/attempts/{id}/answers/{questionId}/regrade` | tests.php | RequireAuth | 🔒 |
| POST | `/api/v1/tests/attempts/{id}/finish` | tests.php | RequireAuth | 🔒 |
| GET | `/api/v1/my/attempts` | tests.php | RequireAuth | 🔴 |

Server-authoritative: snapshot вопросов, score на сервере, free-text сначала детерминированно.

---

## Questions / reports / search

| Method | Path | Файл | Auth | CF |
|--------|------|------|------|-----|
| GET | `/api/v1/questions` | questions_rest.php | RequireAuth | 🟡 |
| GET | `/api/v1/questions/subjects` | questions_rest.php | RequireAuth | 🟡 |
| GET | `/api/v1/search` | search_rest.php | RequireAuth | 🟡 |
| (reports) | `/api/v1/questions/{id}/report` и admin | question_reports.php | auth / staff | 🔴 |

---

## Trainer (гистология и др.)

| Method | Path | Файл | Auth | CF |
|--------|------|------|------|-----|
| GET | `/api/v1/trainers/feed` | platform.php | RequireAuth + SpecialtyAccess (МБХ) | 🔴 |
| GET | `/api/v1/trainers/feed/{id}` | platform.php | RequireAuth | 🔴 |
| POST | `/api/v1/trainers/feed/answer` | platform.php | RequireAuth | 🔴 |
| GET | `/api/v1/trainers/feed/{id}/image` | platform.php | RequireAuth → file/B2 | 🔴 |

Таблицы: `trainer_feed_cards`, `trainer_feed_answers`.

---

## Lectures

| Method | Path | Файл | Auth | CF |
|--------|------|------|------|-----|
| GET | `/api/v1/lectures` | lectures_rest.php | RequireAuth | 🟡 |
| GET | `/api/v1/lectures/{id}` | lectures_rest.php | RequireAuth | 🟡 |

---

## Files / materials / histology sources

| Method | Path | Файл | Auth | CF |
|--------|------|------|------|-----|
| (files) | `/api/v1/files/*` upload/download/meta | files.php | RequireAuth + ownership | 🟡 read / 🔴 upload |
| (materials) | `/api/v1/materials/{id}/file` | material_viewer.php | RequireAuth + MBH where needed | 🔴 |
| (histology) | histology source-file / sources | histology_sources.php | RequireAuth + specialty | 🔴 |

Физические media: SpaceWeb path `/public_html/content/histology/` и/или B2.
Наличие строки в Supabase ≠ наличие файла (проверять HTTP 200 + MIME).

---

## Preparation / trainings / sessions / SRS / progress

| Domain | Файл | CF |
|--------|------|-----|
| preparation start/save/finish/review | preparation.php | 🔴 |
| trainings | trainings.php | 🔴 |
| sessions | sessions_rest.php | 🔴 |
| SRS | srs_rest.php | 🔴 |
| progress | progress_rest.php | 🔴 |
| student planner | student_planner.php | 🔴 |
| academic planning | academic_planning.php | 🔴 |

---

## Community / settings / presence / calculators / AI

| Domain | Файл | CF |
|--------|------|-----|
| community | community_rest.php | 🔴 |
| settings (+ Telegram link) | settings_rest.php | 🔴 |
| presence heartbeat | presence.php | 🔴 |
| calculators | calculators_rest.php | 🔴 |
| AI chat | ai_chat.php | 🔴 |

---

## Telegram

| Domain | Файл | CF |
|--------|------|-----|
| user Telegram routes | telegram.php | 🔴 (отдельный CF Worker-прототип) |
| admin Telegram | admin_telegram.php | 🔴 |

---

## Admin (высокий приоритет безопасности)

Файлы: `admin.php`, `admin_rest.php`, `admin_database.php`, `admin_questions.php`,
`admin_content_package.php`, `00_admin_import_atomic.php`, `import_rest.php`,
`content_integration.php`.

Примеры семейств:

- `/api/v1/admin/schedule` (GET/PUT)
- `/api/v1/admin/database/*`, `/api/v1/admin/db/*`
- `/api/v1/admin/content/*`, `/api/v1/admin/questions/*`
- `/api/v1/admin/users/*`, `/api/v1/admin/telegram/*`
- import / content package / atomic import

**CF:** — (не мигрировать до явных role guards, audit, least-privilege).

---

## Как обновлять этот файл

1. При добавлении PHP-маршрута — строка сюда в тот же PR.
2. При переносе на Worker — сменить CF-символ и коротко дату/коммит в STATUS.md.
3. Перед cutover: все student-facing строки не 🔴/🔒 без осознанного решения.

## Связанные документы

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [STATUS.md](STATUS.md)
- [../backend/MODULE-INTEGRATION.md](../backend/MODULE-INTEGRATION.md)
- Исторические Cloudflare pass-notes в `docs/` (будут в `docs/history/`)
