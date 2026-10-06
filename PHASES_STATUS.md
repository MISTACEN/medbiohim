# MEDBIOHIM — PHASES STATUS

> Актуально на **2026-10-06**.  
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
### Current CI evidence

Latest main Code Checks for commit 84d4684a013660e9c6a8e0d624edaae9ab4f7c13:
- frontend TypeScript: ✅
- Next.js production build: ✅
- escaped-newline guard: ✅
- backend PHP syntax: ✅
- smoke: ✅
- backend/source archives: ✅

The previous failing check was caused by a missing adminValidateContent import in src/app/admin/tools/page.tsx. It is fixed and the final Code Checks run is green.

See docs/FULL-AUDIT-2026-10-04.md.


## 13. Student-first / Telegram

| Подфаза | Статус | Фактическое состояние |
|---|---|---|
| 13.1 Student identity | 🟡 | Auth exists; Telegram account linking needs end-to-end verification |
| 13.2 Group membership | 🟡 | groups + memberships + group-aware schedule/homework exist; join flow needs hardening |
| 13.3 Lesson context | 🟡 | schedule entries exist; dedicated Telegram message → lesson resolver absent |
| 13.4 Telegram webhook | 🟡 | implemented in PHP; production webhook not proven |
| 13.5 Telegram chat binding | 🟡 | admin UI + DB schema implemented; live chats = 0 |
| 13.6 Telegram message ingestion | 🟡 | service + schema implemented; live messages = 0 |
| 13.7 OCR / vision | 🟡 | code path exists; runtime provider availability must be tested |
| 13.8 Homework classification | 🟡 | heuristic + LLM second pass exists |
| 13.9 Homework creation | 🟡 | repository/API path exists; live homeworks = 0 |
| 13.10 Attachments | 🟡 | attachment schema/import path exists; live attachments = 0 |
| 13.11 Telegram registration | 🔴 | custom Telegram auth trace exists, but full bot /start → account → group flow is not proven |
| 13.12 Student-generated content | ⬜ | product direction; moderation/confirmation model not complete |

### Telegram acceptance gate

The feature is not DONE until a real group test proves:

`Telegram → webhook → stored message → group resolution → subject resolution → lesson resolution → homework → attachment → website`

and:

`Telegram /start → identity link → group membership → schedule → homework`

## 14. Student-generated learning ecosystem

| Capability | Status |
|---|---|
| Student creates/updates own/group homework | 🟡 |
| Student submits homework | 🟡 |
| Student marks homework done | 🟡 |
| Student contributes notes/materials | ⬜ |
| Student suggests content correction | ⬜ |
| Peer confirmation | ⬜ |
| Starosta moderation | ⬜ |
| Change history / attribution | 🟡 foundation exists via content/audit structures |
| Group knowledge feed | ⬜ |

## Updated phase ordering

After current stability blockers:

1. **Student identity + group membership**
2. **Telegram registration/linking**
3. **Telegram → lesson resolver**
4. **Telegram → homework production smoke**
5. **Student contribution + moderation**
6. **Progress based on real activity**
7. **UI polish**


## 2026-10-06 — Master Plan / Pass 14

| Контур | Статус | Состояние |
|---|---|---|
| AcademicContext foundation | 🟡 | resolver расширен до group/subject/session/lesson/context version |
| Group identity | 🟡 | explicit group enforcement есть; core consumers ещё мигрируются |
| Subject identity | 🟡 | UUID authoritative в resolver; legacy slug consumers ещё остаются |
| Schedule/session context | 🟡 | session/lesson resolver создан; ScheduleRepository и planner ещё требуют интеграции |
| Progress context | 🟡 | subject context проверяется; fallback DB semantics усилены, полный academic scope ещё не завершён |
| SRS identity | 🟡 | UUID path есть; compatibility slug path ещё существует |
| Core academic flow | ⬜ | Pass 15 — следующий проход |

### Кодовые изменения Pass 14
- backend/src/Services/AcademicContextResolver.php расширен.
- backend/config/routes/student_planner.php получил корректные imports.
- backend/config/routes/srs_rest.php исправлен undeclared subjectId.
- backend/config/routes/progress_rest.php больше не скрывает двойную ошибку источников за 200 [].

Полный отчёт: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS14.md.


Numeric live snapshot: docs/LIVE-PROJECT-SNAPSHOT-2026-10-06.md. Do not use historical counts in this status as current DB truth.

## 2026-10-06 — Pass 15: Core academic flow

| Контур | Статус | Состояние |
|---|---|---|
| Planner / group context | 🟢 | explicit group required; no cross-group aggregation |
| Schedule context | 🟢 | selected group propagated through DB/REST paths |
| Attendance | 🟢 | lesson resolved against selected group and active schedule |
| Homework submission | 🟢 | retry-safe; submitted/graded overwrite blocked |
| Test attempt start | 🟢 | production partial unique active-attempt invariant |
| Test attempt finish | 🟡 | idempotent and validated, but score remains client-supplied |
| Progress | 🟡 | legacy aggregation still needs full group/session scope |
| Academic context snapshot | 🟡 | attempt snapshot migration still pending |
| Final runtime verification | 🟡 | must be rerun after Pass 15 changes |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS15.md.
## 2026-10-06 — Pass 16: Tests / Preparation

| Контур | Статус | Состояние |
|---|---|---|
| Preparation start context | 🟢 | group + subject UUID validated |
| Session question membership | 🟢 | PATCH cannot write question outside session |
| Preparation finish | 🟢 | only in_progress → completed |
| Sequential bank progress | 🟢 | ordered session question set persisted |
| Preparation context snapshot | 🟡 | group/session version not yet stored on session |
| Bank-progress context | 🟡 | explicit group propagation still pending |
| Server-authoritative scoring | 🟡 | ordinary test finish remains client-score based |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS16.md.

## 2026-10-06 — Pass 17: Test integrity and reproducibility

| Контур | Статус | Состояние |
|---|---|---|
| Test answer persistence | 🟢 | server endpoint + retry-safe upsert |
| Server-authoritative scoring | 🟢 | finish derives score from persisted answers |
| Question/answer snapshot | 🟢 | attempt stores immutable question set and answer key |
| Test academic snapshot | 🟢 | group + academic session + context version |
| Preparation academic snapshot | 🟢 | group + session + context version |
| Preparation question snapshot | 🟢 | active legacy sessions backfilled |
| Bank-progress context | 🟢 | group/subject context enforced |
| Runtime/build verification | 🟡 | must be rerun after Pass 17 |
| Progress academic semantics | 🟡 | remaining cross-domain work |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS17.md.

## 2026-10-06 — Pass 18: Historical preparation integrity

| Контур | Статус | Состояние |
|---|---|---|
| Preparation scoring source | 🟢 | immutable session snapshot |
| Preparation answer snapshot | 🟢 | stored per result |
| Preparation AI historical correctness | 🟢 | uses stored answer snapshot |
| Active context integrity | 🟢 | live DB gap counts = 0 |
| CI execution evidence | 🟡 | no workflow run for latest commit |
| SpaceWeb/PHP runtime | 🟡 | must be verified in actual deployment |
| Next.js build | 🟡 | must be verified after latest frontend changes |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS18.md.
