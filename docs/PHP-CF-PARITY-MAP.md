# PHP ↔ Cloudflare Worker — полный parity-map

**Дата:** 2026-10-15  
**Источник PHP:** `backend/config/routes.php` + `backend/config/routes/*`  
**Источник CF:** `integrations/cloudflare-api/src/index.js` + модули  
**Цель:** единый снимок паритета для cutover «только Cloudflare» (student-facing).

Легенда статуса CF:

| Символ | Значение |
|--------|----------|
| ✅ | Есть в Worker, контракт по коду совпадает с PHP |
| 🟡 | Есть в Worker; нужен live student-JWT smoke / RLS acceptance |
| 🔒 | Код есть, fail-closed до конфига (rate-limit bindings и т.п.) |
| 🔴 | Нет в Worker |
| — | Admin / вне student cutover / отдельный Worker |

---

## Health / meta

| Method | Path | PHP | CF | Notes |
|--------|------|-----|-----|-------|
| GET | `/health` | health.php | 🟡 | mode: shadow |
| GET | `/api/v1/health` | health.php | 🟡 | |
| GET | `/api/v1` | health.php | 🟡 | metadata envelope |
| GET | `/api/v1/ping` | health.php | 🟡 | |

## Auth

| Method | Path | CF |
|--------|------|-----|
| POST | `/api/v1/auth/login` | 🔒 rate-limit binding |
| POST | `/api/v1/auth/register` | 🔒 rate-limit binding |
| POST | `/api/v1/auth/refresh` | 🟡 |
| POST | `/api/v1/auth/logout` | 🟡 |
| POST | `/api/v1/auth/recover` | 🟡 |
| GET | `/api/v1/auth/me`, `/api/v1/me` | 🟡 |

## Groups & subjects

| Method | Path | CF |
|--------|------|-----|
| GET | `/api/v1/groups`, `/subjects`, `/subjects/{id}`, `/subjects/{id}/gradebook` | 🟡 |
| POST/PATCH/DELETE groups & subjects | 🔴 teacher/admin |

## Dashboard / schedule / curriculum / plans

| Paths | CF |
|-------|-----|
| dashboard, schedule, schedule/meta, schedule/entries, admin/schedule, curriculum, subjects-catalog, subject-plans, subject-materials, site-content, lesson-plan | 🟡 |

## Homework / attendance

| Paths | CF |
|-------|-----|
| homeworks GET/POST, progress, submit | 🟡 |
| submissions/{id}/grade | 🔴 teacher |
| attendance/{id} | 🟡 |

## Tests / attempts / preparation

| Paths | CF |
|-------|-----|
| tests, curriculum-map, chemistry-master, tests/{id}, start, answers, finish, my/attempts, bank, preparation/* | 🟡 |

## Questions / search / mini-quiz / reports

| Paths | CF |
|-------|-----|
| questions, questions/subjects, search, mini-quiz, mini-quiz/check, questions/{id}/report | 🟡 |

## Trainings + trainer feed

| Paths | CF |
|-------|-----|
| trainings CRUD lifecycle (RPC) | 🟡 |
| trainers/feed, answer, image | 🟡 |

## Lectures / materials / files / histology

| Paths | CF |
|-------|-----|
| lectures, materials, materials/{id}/file, files/{id}, histology/source-* | 🟡 |
| POST files/upload | 🔴 |

## Sessions (learning_sessions) — ported 2026-10-15

| Method | Path | CF | Notes |
|--------|------|-----|-------|
| GET | `/api/v1/sessions` | ✅ | `?status=` |
| POST | `/api/v1/sessions` | ✅ | create |
| GET | `/api/v1/sessions/{id}` | ✅ | ownership |
| PATCH | `/api/v1/sessions/{id}` | ✅ | finished→finished_at |

## Notes / favorites / SRS / progress / planner / academic

| Paths | CF |
|-------|-----|
| notes, favorites, srs/*, progress, planner, academic/* | 🟡 |

## Community / settings / presence / calculators / AI / tutor / tickets / chemistry

| Domain | CF |
|--------|-----|
| community/posts, settings/*, presence, calculators, ai/*, tutor/*, tickets, chemistry/resolve | 🟡 |

## Out of first student cutover

- Admin DB / content / import / users —
- Telegram webhook (отдельный Worker) —
- Group/subject teacher writes 🔴
- File upload storage 🔴 (B2 не трогаем сейчас)

## Сводка

Student routes в Worker ~100+. Fail-closed: login/register. Реальные пробелы student: file upload, group by id. `SPACEWEB-API-INVENTORY.md` устарел. Дальше: live JWT smoke, rate-limit bindings, media secrets, Vercel deploy.
