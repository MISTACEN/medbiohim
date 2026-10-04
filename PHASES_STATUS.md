# MEDBIOHIM — PHASES STATUS

> Актуально на **2026-10-04**.  
> Source of truth: `main` + живой Supabase + целевые deployment environments.  
> Подробный план: [ROADMAP.md](ROADMAP.md).

## Статусы

- ✅ DONE
- 🟡 IN PROGRESS
- 🔴 BLOCKED
- ⬜ TODO
- ⚪ DEFERRED

---

| Фаза | Состояние | Что это значит |
|---|---|---|
| 0. Source of truth / sync | 🟡 | GitHub/Supabase/SpaceWeb/Vercel связаны, но требуется финальный production smoke-test |
| 1. Auth / account | 🟡 | основные flow есть, требуется end-to-end проверка |
| 2. Schedule | 🟡 | core готов, требуется финальная проверка UI/чередований |
| 3. Subjects architecture | 🟡 | предметный hub реализован, остальные subject flows доводятся |
| 4. Histology | 🟡 | основной контент есть, нужна финальная сверка и media verification |
| 5. Tests / Question Bank | 🟡 | engine и данные есть, нужен audit UX/admin |
| 6. Materials | 🟡 | subject-level materials + DOCX viewer есть, нужен file/media polish |
| 7. Admin CMS | 🟡 | базовые инструменты есть, quick-edit контента ещё доводится |
| 8. AI Tutor | 🔴 | provider chain есть, но runtime availability не закрыта |
| 9. Chemistry | 🟡 | core на main, экспериментальные части в beta |
| 10. UI system | 🟡 | основной UI стабилен; Aero Glass — beta |
| 11. SpaceWeb media | 🟡 | backend route готов, физические media links требуют smoke-test |
| 12. Documentation | 🟡 | новая система документов создаётся сейчас |

---

## Уже фактически закрыто

- ✅ Supabase project используется как основной DB.
- ✅ main — production branch.
- ✅ beta — experiment branch.
- ✅ subject-level navigation.
- ✅ histology canonical subject cleanup.
- ✅ 350 histology exam questions.
- ✅ 5 histology ticket banks.
- ✅ 27 published histology materials.
- ✅ histology trainer feed and atlas data.
- ✅ test-key resolution via `source_key`.
- ✅ backend deployment workflow.
- ✅ document viewer route for histology materials.
- ✅ trainer atlas → detailed materials navigation.
- ✅ Aero Glass вынесен в отдельную beta-theme, не включён по умолчанию.

## Главные открытые блокеры

### 🔴 AI
Provider availability/runtime ещё не подтверждён end-to-end.

### 🟡 Media
Trainer feed image endpoints всё ещё требуют закрытия 404/502.

### 🟡 Production
Последний frontend change должен пройти Vercel build + smoke-test.

### 🟡 CMS
Нужно довести быстрые правки вопросов/материалов/занятий.

---

## Правило обновления

После каждой законченной крупной задачи:

1. изменить статус в `ROADMAP.md`;
2. изменить статус в этом файле;
3. при необходимости обновить `SYNC_STAMP.md`;
4. только после проверки ставить ✅.


## 2026-10-04 deep audit status

Большинство ранних P0, найденных первым аудитом, уже закрыто.

| Фаза | Текущий статус |
|---|---|
| 0. Source of truth / sync | 🟡 | target-environment verification remains |
| 1. Auth / account | 🟡 | code path stable, final login/logout smoke remains |
| 2. Schedule | 🟡 | backend/editor stable, final target smoke remains |
| 3. Subjects architecture | 🟡 | subject filtering/progress/advanced tests path fixed |
| 4. Histology | 🟡 | content integrated; physical media smoke remains |
| 5. Tests / Question Bank | 🟡 | sequential/options/typecheck path fixed; full published-test audit remains |
| 6. Materials | 🟡 | histology DOCX/image viewer works; generic document coverage remains |
| 7. Admin CMS | 🟡 | false-zero fallbacks reduced; material/trainer/version UI still needs completion |
| 8. AI Tutor | 🔴 | external provider runtime still unresolved |
| 9. Chemistry | 🟡 | core implemented, broader data/content still beta |
| 10. UI system | 🟡 | no current functional blocker; Aero Glass remains beta |
| 11. SpaceWeb media | 🟡 | physical trainer media verification remains |
| 12. Documentation | 🟡 | deep audit registry now current |

## Verification evidence

Latest fully completed code-check before the newest documentation-only commit:
- TypeScript: ✅
- Next.js production build: ✅
- PHP syntax: ✅ (93 files)
- predeploy audit: ✅ no escaped-newline, no retired /api-compat calls, homework API-only
- smoke: ✅

The newest code-check after the Deep Audit documentation commit is running separately.
## Deep audit 3 override — 2026-10-04

- Source/sync → 🟡 code cleanup substantially complete; deployment convergence still pending.
- Schedule → 🟡 route duplication removed; CI backend syntax green; production delivery pending.
- Histology → 🟡 trainer content integrity is clean in Supabase; physical media still requires target-environment smoke.
- Tests → 🟢 DB integrity check shows no orphan links and no published tests without questions; UI CI is being re-run after cleanup fixes.
- Admin CMS → 🟡 content validator + audit rollback exist; dedicated editors remain polish work.
- AI Tutor → 🔴 upstream/provider availability unresolved.
- Materials → 🟡 histology DOCX viewer exists; generic subject-wide DOCX/PDF viewer is still a product task.
- Deployment → 🔴 current Vercel production deployment is behind current main.

See docs/DEEP-AUDIT-3-2026-10-04.md.