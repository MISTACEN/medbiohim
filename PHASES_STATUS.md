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


## 2026-10-04 audit override

Последний полный аудит выявил P0 defects, поэтому следующие фазы нельзя считать закрытыми только по наличию кода:

- Source of truth / sync → 🟡 runtime cleanup required
- Auth / account → 🟡 registration still uses historical api-compat wrapper
- Schedule → 🔴 admin save path uses missing api-compat; CI is red
- Histology → 🔴 trainer CI blocker + media still not verified
- Tests / Question Bank → 🔴 preparation/sequential/options contract mismatch
- Materials → 🟡 viewer exists; target-environment file check remains
- Admin CMS → 🔴 active admin operations still point to api-compat
- AI Tutor → 🔴 provider availability unresolved
- UI system → 🟡 Aero Glass remains beta and is not the current priority
- Documentation → 🟡 audit registry created; stale docs remain to clean

### Current CI evidence

Latest main Code Checks for commit a3d580b978f30309837f60095e9bd47d4e828b04:
- frontend: FAIL on literal escaped newline in HistologyTrainer.tsx:248
- backend PHP syntax: PASS
- smoke: PASS
- backend/full archive packaging: PASS

See docs/FULL-AUDIT-2026-10-04.md.
