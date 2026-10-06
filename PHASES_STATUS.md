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


## 2026-10-06 — Pass 14–17 second verification

A second pass was performed against current main + live Supabase after the implementation and subsequent Pass 18–22 hardening.

| Pass | Status | Current result |
|---|---|---|
| Pass 14 — AcademicContext | 🟢 | group/subject/session/lesson/context_version contract is implemented and live invariants are clean |
| Pass 15 — Core academic flow | 🟢 | planner/schedule/attendance/homework/test/progress are group-scoped; homework has one canonical derived status |
| Pass 16 — Preparation | 🟢 | preparation start, membership, sequential bank progress and terminal transitions are context-safe |
| Pass 17 — Test integrity | 🟢 | server-side answers/scoring and immutable attempt/preparation snapshots are live and verified |

### Live second-pass invariants

- active test attempts missing academic snapshot: **0**;
- active preparation sessions missing academic snapshot: **0**;
- test answers outside attempt snapshot: **0**;
- preparation results without answer snapshot: **0**;
- foreign-group test attempts: **0**;
- foreign-group preparation sessions: **0**;
- schedule ↔ academic session/year/semester mismatches: **0**.

One historical submitted test attempt from before the snapshot migration has no score/context/snapshot. It is retained unchanged because reconstructing an answer or score would fabricate history. It is classified as a **legacy historical anomaly**, not a current-flow defect.

### Additional hardening in this pass

- HomeworkRepository::listForUser() now returns canonical my_status and my_status_source.
- planner uses the same derived status contract.
- pending / done / submitted / returned / graded is now the shared semantic vocabulary for student homework state.

Detailed second verification: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS14-17-SECOND-VERIFY.md.

### Release gate

Passes 14–17 are closed at implementation + live DB invariant level. They are **not** a substitute for the final target-environment gate: PHP/TypeScript/build, authenticated browser smoke, Vercel READY and SpaceWeb artifact/runtime verification remain separate.

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


## 2026-10-06 — Pass 19: Progress / History / Preparation

| Контур | Статус | Состояние |
|---|---|---|
| Preparation historical reads | 🟢 | GET/finish/AI используют immutable session snapshot |
| Preparation answer snapshot | 🟢 | live results без answer_snapshot = 0 |
| Progress terminal statuses | 🟢 | submitted учитывается как завершённая попытка |
| Progress DB failure handling | 🟢 | silent empty fallback удалён |
| Test history group scope | 🟢 | history фильтруется по test_attempts.group_id |
| Bank group propagation | 🟢 | bank + preparation передают group_id |
| Runtime/build verification | 🟡 | требует реального target environment |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS19.md.


## 2026-10-06 — Pass 20: Test / Preparation API contract

| Контур | Статус | Состояние |
|---|---|---|
| Test answer-key exposure | 🟢 | detail/start/finish/history не отдают immutable answer snapshot |
| Preparation snapshot exposure | 🟢 | start/get/save/finish скрывают server snapshot |
| Historical preparation review | 🟢 | completed flow использует immutable snapshot |
| Progress/history contract | 🟢 | submitted + group-scoped history |
| Legacy ProgressService | 🟡 | не используется как runtime source, но файл остаётся cleanup trace |
| Runtime/build/browser verification | 🟡 | следующий gate |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS20.md.


## 2026-10-06 — Pass 21: Deployment / cross-group

| Контур | Статус | Состояние |
|---|---|---|
| Bank progress group isolation | 🟢 | sequential session выбирается только внутри group_id |
| Live snapshot/context invariants | 🟢 | все проверенные gaps = 0 |
| GitHub code-check definition | 🟢 | PHP + route smoke + frontend checks существуют |
| CI evidence | 🟡 | workflow runs отсутствуют в доступном API |
| Vercel runtime | 🟡 | 403 permissions prevent deployment verification |
| SpaceWeb runtime | 🟡 | отдельный target gate |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS21.md.


## 2026-10-06 — Pass 22: Legacy / fake-success cleanup

| Контур | Статус | Состояние |
|---|---|---|
| Admin partial-success fallback | 🟢 | fail-closed 503 |
| Legacy ProgressService | 🟢 | removed; no runtime consumer |
| Stub/placeholder scan | 🟢 | executable fake states distinguished from legitimate UI |
| Historical docs traces | 🟡 | source-of-truth cleanup remains |
| Runtime/build/browser verification | 🟡 | target environment required |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS22.md.


## 2026-10-06 — Pass 23: route / legacy cleanup

| Контур | Статус | Состояние |
|---|---|---|
| Duplicate /api/v1/me | 🟢 | legacy profile_rest removed from registration and deleted |
| Canonical profile route | 🟢 | domain_rest.php is the single registered /api/v1/me handler |
| Orphan SupabaseRestProfile | 🟢 | removed; no runtime consumer |
| Runtime/build/browser verification | 🟡 | target environment still required |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS23.md.


## 2026-10-06 — Pass 24: Curriculum-linked tests

| Контур | Статус | Состояние |
|---|---|---|
| Test curriculum map API | 🟢 | module/topic hierarchy with question/test counts |
| Academic context isolation | 🟢 | group/course/semester/specialty scoped |
| Test topic metadata | 🟢 | module/topic titles returned |
| Question bank topic filter | 🟢 | filter by canonical topic UUID/title |
| Untagged question safety | 🟢 | shown as unclassified; no guessing |
| Detailed plan coverage | 🟡 | currently complete only where module/topic hierarchy is imported |
| Remaining question tagging | 🟡 | controlled mapping required |
| PHP/Next/browser/runtime | 🟡 | target environment verification required |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS24.md.


## 2026-10-06 — Pass 25: full current-semester mapping

| Контур | Статус | Результат |
|---|---|---|
| Current-semester question mapping | 🟢 | 655/655 have canonical topics |
| Current-semester test mapping | 🟢 | 30/30 have canonical topics |
| Histology lesson mapping | 🟢 | 206 previously untagged mapped; 47 explicitly outside current plan |
| Chemistry lesson mapping | 🟢 | 1.1–3.13 taxonomy mapped to canonical topics |
| Lesson dates | 🟢 | verified current calendar dates attached where available |
| Out-of-calendar safety | 🟢 | marked explicitly, not falsely assigned |
| Ticket-bank integrity | 🟢 | untouched |
| Runtime/build/browser | 🟡 | separate verification gate |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS25.md.


## 2026-10-07 — Pass 26: Chemistry master catalog

| Контур | Статус | Состояние |
|---|---|---|
| Source archive audit | 🟢 | 7 scanned PDFs / 142 pages checked; no usable native PDF text layer |
| Unified chemistry catalog | 🟢 | Supabase `chemistry_master_documents` created |
| Open tasks | 🟢 | 260 canonical organic-chemistry open tasks included |
| Current test questions | 🟢 | 176 published chemistry test questions included with options/answers |
| Formula preservation | 🟢 | textual chemical formulas/reactions retained verbatim where source text contains them |
| Image-only structural/skeletal formulas | 🟡 | must be confirmed from original page images before generating answer formulas |
| Full archived test-section import | 🟡 | source contains additional OCR-sensitive questions; controlled expansion remains |
| Curriculum mapping | 🟢 | canonical topic/plan links retained for imported current questions |
| Runtime/build/browser | 🟡 | separate target-environment gate remains |

Detailed report: `docs/IMPLEMENTATION-AUDIT-2026-10-07-CHEMISTRY-MASTER-CATALOG.md`.
