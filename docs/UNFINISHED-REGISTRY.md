# MEDBIOHIM — реестр незавершённого и лишнего

Дата: 2026-10-04

| ID | Severity | Объект | Тип | Статус | Следующее действие |
|---|---|---|---|---|---|
| P0-1 | P0 | src/components/trainers/HistologyTrainer.tsx:248 | literal \n | 🔴 | убрать |
| P0-2 | P0 | src/lib/api.ts | /api-compat layer | 🔴 | перейти на реальные API |
| P0-3 | P0 | tests/bank ↔ preparation | flow mismatch | 🔴 | восстановить sequential |
| P0-4 | P0 | preparation UI | question/options mismatch | 🔴 | синхронизировать с backend |
| P0-5 | P0 | homework/page.tsx | production mock fallback | 🔴 | убрать mock runtime |
| P0-6 | P0 | admin schedule | save через api-compat | 🔴 | direct /admin/schedule |
| P1-1 | P1 | .github/workflows/main.yml | duplicate legacy deploy | 🟡 | удалить/объединить |
| P1-2 | P1 | spaceweb_upload/ | divergent duplicate source | 🟡 | удалить/sync |
| P1-3 | P1 | trainer media | 404/502 | 🟡 | SpaceWeb/B2 smoke |
| P1-4 | P1 | AI providers | runtime failures | 🔴 | primary + fallback |
| P1-5 | P1 | progress/page.tsx | misleading degraded zeros | 🟡 | unavailable state |
| P2-1 | P2 | frontend/ | stale shadow frontend | ⚪ | remove |
| P2-2 | P2 | Sparkline.tsx | unused component | ⚪ | remove |
| P2-3 | P2 | chemistry/fixtures.ts | unused fixture | ⚪ | move/remove |
| P2-4 | P2 | exam_tickets_legacy_2026.json | legacy artifact | ⚪ | archive/remove |
| P2-5 | P2 | schedule.json | old/demo data | ⚪ | remove after fallback audit |
| P2-6 | P2 | organic chemistry ID map | placeholder data | 🟡 | regenerate/remove |
| P2-7 | P2 | EM/HOTFIX docs | stale instructions | 🟡 | archive/update |
| P2-8 | P2 | old histology SQL folder | duplicate source | 🟡 | archive/remove |

## Active /api-compat user flows

- registration
- community post creation
- lecture detail
- lesson plan
- individual question
- file retrieval
- question report
- admin schedule save

## Variadic compatibility helpers

src/lib/api.ts содержит **66** функций вида (..._args: any[]).
Не все вызываются runtime, но большая часть относится к историческому compatibility layer и требует пересмотра.

## Legitimate fallbacks

Не считать автоматически мёртвым:
- Supabase REST fallback;
- DB connection fallback;
- trainer image retry;
- PubChem fallback for RDKit;
- LLM provider fallback;
- ServiceNotice/degraded UI.

Fallback считается проблемой, когда он выдаёт пользователю данные как будто это production source of truth.


## Deep-pass closures (2026-10-04)

| ID | Object | Problem | Status |
|---|---|---|---|
| D2-1 | presence | backend heartbeat had no frontend caller | ✅ heartbeat + admin online UI |
| D2-2 | homework grading | UI called missing grade endpoint | ✅ POST /submissions/{id}/grade |
| D2-3 | material viewer auth | protected file fetch did not refresh token | ✅ refresh + retry |
| D2-4 | dashboard outage state | API failure became fake empty dashboard data | ✅ explicit degraded state |
| D2-5 | API helpers | cleanup removed still-used direct helper exports | ✅ restored after production build trace |
| D2-6 | duplicate routes | shadowed handlers remain in legacy route files | 🟡 audit-only; consolidate after contract review |
| D2-7 | learning_sessions | backend storage/API without current UI consumer | 🟡 verify historical consumers, then remove if unused |
