## Data integrity reconciliation — Pass 54 (2026-10-10)

- 🟢 Read-only Supabase check: 854 question links; no duplicate pairs or broken links; 32/32 active published tests have questions; 660/660 active published questions have test links.
- 🟢 776 published `exam_questions` have non-empty prompts and valid checked curriculum links.
- 🟡 719 blank answer fields belong to open-ticket/preparation-style types in the grouped audit; no auto-fill/delete/unpublish was performed.
- 🟡 Five linked Anatomy/Biochemistry questions have a valid `subject_id` but their legacy subject has NULL `slug`; normalization is deferred until canonical mapping is confirmed.
- 🔴 CI and production runtime are still unverified; Actions jobs terminate before steps.

Report: [Pass 54](docs/DATA-INTEGRITY-RECONCILIATION-2026-10-10-PASS54.md).

## API proxy hardening — Pass 53 (2026-10-10)

- 🟢 Trainer fallback now respects PHP-first routing; Supabase fallback is only used after an upstream 404.
- 🟢 Authenticated trainer images are marked `private, no-store`; proxy 502 messages are generic.
- 🟢 Pre-deploy audit now checks these three contracts.
- 🔴 Workflow runs for commits `ec4aad1` and `6aeb401` still fail before any steps with `runner_id=0`; source/build/test checks and live runtime remain unverified.
- Code: [`ec4aad1`](https://github.com/MISTACEN/medbiohim/commit/ec4aad139413292c3beb6992e58bdfb6ef7ae17b); audit guard: [`6aeb401`](https://github.com/MISTACEN/medbiohim/commit/6aeb401434ab8ba10dad778bc48c585a5fe4347e).

# MEDBIOHIM — PHASES STATUS

> Актуально на **2026-10-10**.  
> Source of truth: `main` + живой Supabase + целевые deployment environments.  
> Подробный план: [ROADMAP.md](ROADMAP.md).

## CI/PHP audit — Pass 51 (2026-10-10)

- 🟢 Source hardening: trusted role claims, DB-backed role checks, token URL rejection, generic uncaught-error responses.
- 🟢 Duplicate admin route registrations removed; route scanner now examines all router variable names.
- 🟢 Homework attachment SQL PHP-string syntax fixed.
- 🔴 GitHub Actions runner allocation is **blocked**: fresh run [37993824049, attempt 2](https://github.com/MISTACEN/medbiohim/actions/runs/37993824049) on `ubuntu-24.04` still returned `runner_id=0`, zero steps and no logs. Pinning did not resolve it; check account Actions billing/permissions or contact GitHub Support.
- 🟡 Full repository PHP lint, route registration, SQL/RLS/fallback tests, and SpaceWeb post-deploy smoke are still open.

Report: [CI/PHP audit Pass 51](docs/CI-PHP-AUDIT-2026-10-10-PASS51.md).

## CI runner retry — attempt 4 (2026-10-10)

- 🔴 Retried failed jobs for run [37993824049](https://github.com/MISTACEN/medbiohim/actions/runs/37993824049); attempt 4 again ended with both frontend/backend jobs failing before any steps (`steps=[]`).
- This remains runner allocation/dispatch failure, not a result from PHP/TypeScript/build commands. Do not mark checks green or weaken required checks.
- Next external unblock: verify GitHub Actions account/org billing, spending limit, repository Actions permissions and runner availability; contact GitHub Support if those are normal.
- Vercel is separately blocked by the observed `build-rate-limit` target; production deployment/runtime smoke remains open.

## Histology media reconciliation — 2026-10-10

- 🟡 Read-only comparison of 28 published electronograms found 5 `source_key` / `preparation.imagePath` mismatches; no database writes were made. Exact mismatches and the SpaceWeb HTTP verification checklist are recorded in [the reconciliation report](docs/HISTOLOGY-MEDIA-RECONCILIATION-2026-10-10.md).
- 🟡 Histology materials: 80 rows, all have inline `content_html` and a resolvable `source_key`; none has `file_id` or `external_url`. This is not automatically an error, but source download/viewer behavior must be checked in the target runtime.

## CI/PHP audit — Pass 52 (2026-10-10)

- 🟢 Fixed repeated named PDO placeholders in homework listing/attachment SQL.
- 🟢 Added `backend/tests/HomeworkSqlContractTest.php` and wired it into code-check and SpaceWeb pre-deploy checks.
- 🔴 GitHub Actions still fails before steps (`runner_id=0`, no logs); no CI success claimed. Full PHP lint and integration/deploy checks remain unverified.
- Report: [CI/PHP audit Pass 52](docs/CI-PHP-AUDIT-2026-10-10-PASS52.md).

## Статусы

> Последняя сверка: Vercel deployment metadata + [security fix Pass 49 (2026-10-10)](docs/SECURITY-FIX-2026-10-10-PASS49.md) + [Pass 48 viewer access](docs/SECURITY-FIX-2026-10-10-PASS48.md) + [Pass 47 media cache isolation](docs/SECURITY-FIX-2026-10-10-PASS47.md) + [Pass 46 cache fix](docs/RELIABILITY-FIX-2026-10-10-PASS46.md). Исторические pass-записи ниже сохранены; при расхождении чисел/статусов использовать последнюю датированную проверку. Код-коммит не равен успешному production/runtime-тесту.

- ✅ DONE
- 🟡 IN PROGRESS
- 🔴 BLOCKED
- ⬜ TODO
- ⚪ DEFERRED

---

| Фаза | Состояние | Что это значит |
|---|---|---|
| 0. Source of truth / sync | 🟡 | Pass 45–47 frontend source included in latest observed READY Vercel deployment `6687e057`; fixed PHP autoloader in CI, added 15-assertion sanitizer regression test and required pre-deploy backup. GitHub runner still fails before steps; exact-commit runtime smoke remains open. See [unified checklist](docs/GITHUB-PRODUCTION-VERIFICATION-CHECKLIST.md) |
| 1. Auth / account | 🟡 | login → /me → dashboard → logout не подтверждены в target runtime; Pass 46 prevents malformed JWTs sharing a cache bucket and Pass 47 scopes private media/card caches by user; two-account runtime check remains open |
| 2. Schedule | 🟡 | core/data есть; production-smoke и охват повторяющихся отработок требуют сверки |
| 3. Subjects architecture | 🟡 | предметный hub реализован, остальные subject flows доводятся |
| 4. Histology | 🟡 | Supabase answer-key mitigation live; Pass 44 trainer route membership, Pass 45 recursive answer sanitization, Pass 47 user-scoped media caches, Pass 48–49 material/file access and Pass 50 subject/gradebook/academic-context MBH checks are in source. Pass 45–47 frontend deployment observed READY; Pass 48–50 PHP deployment, authenticated smoke and media/source mapping remain open |
| 5. Tests / Question Bank | 🟡 | данные/связи имеются; полный start → answer → finish → review smoke и аудит exam_questions не закрыты |
| 6. Materials | 🟡 | записи и viewer существуют; наличие физических DOCX/PDF/image и единый lecture source ещё не подтверждены |
| 7. Admin CMS | 🟡 | есть DB console; две PHP syntax ошибки исправлены в fb4eed97, target-runtime проверка ещё не выполнена |
| 8. AI Tutor | 🔴 | provider chain есть, но runtime availability не закрыта |
| 9. Chemistry | 🟡 | core на main, экспериментальные части в beta |
| 10. UI system | 🟡 | основной UI стабилен; Aero Glass — beta |
| 11. SpaceWeb media | 🟡 | Read-only reconciliation: all 28 published electronogram cards have non-empty source_key; 23/28 source_key values exactly match preparation.imagePath, while 5 differ (four truncated imagePath values and one capillary card with an ID-like source_key). No exact/basename matches exist in content_sources.source_path. GitHub main tree has no matching image assets. Files may live only on SpaceWeb/B2; do not rewrite DB paths until physical filenames and HTTP 200 responses are checked |
| 12. Documentation | 🟡 | Unified GitHub/production checklist and issue template added; Pass 44–50 reports, 15-assertion sanitizer test, unified checklist and bug issue form documented; historical counts remain snapshots |
| 13. Optional integrations | 🟡 | Chrome/Edge quick-access extension and isolated public-command Telegram bot MVP added; manual browser install/bot deployment not performed; private account linking intentionally absent |

---

## Уже фактически закрыто

- ✅ Supabase project используется как основной DB.
- ✅ main — production branch.
- ✅ beta — experiment branch.
- ✅ subject-level navigation.
- ✅ histology canonical subject cleanup.
- 🟡 Histology `exam_questions` exist; latest recorded live snapshot is 466 rows (366 published, 100 unpublished as of 2026-10-06). Duplicate-text groups and blank-answer candidates still need source comparison; count is not a completion criterion.
- ✅ 5 histology ticket banks.
- 🟡 Histology material counts need reconciliation: older phase notes say 27 published, while the later live snapshot records 80 published material records; neither count proves physical files are available.
- ✅ histology trainer feed and atlas data.
- ✅ test-key resolution via `source_key`.
- ✅ backend deployment workflow.
- ✅ document viewer route for histology materials.
- ✅ trainer atlas → detailed materials navigation.
- ✅ Aero Glass вынесен в отдельную beta-theme, не включён по умолчанию.

## Главные открытые блокеры

- 🟡 **CI runner dispatch:** PHP autoloader smoke was fixed and a 12-assertion trainer payload sanitizer regression test was added, but GitHub Actions still fails before any step. The workflow changes are not verified until an actual runner executes them.
- 🟡 **SpaceWeb deployment safety:** deployment now requires a non-empty source backup and checks deployed Pass 44 markers; actual successful deployment is still unconfirmed.
- 🟡 **Unified acceptance:** follow [the GitHub/production verification checklist](docs/GITHUB-PRODUCTION-VERIFICATION-CHECKLIST.md) and record PASS/FAIL/BLOCKED with evidence.

### 🟡 Trainer route access — source fix awaiting deployment/test
Pass 45 further hardens recursive answer-key stripping in PHP and Next source. [Pass 45 report](docs/SECURITY-FIX-2026-10-10-PASS45.md).
Pass 44 (`99ed1bc`) aligns PHP access checks across feed, detail, answer submission, and image routes. CI runner allocation prevents PHP lint/integration execution; do not mark runtime verification complete until the PHP source is deployed and both MBH and non-MBH accounts are tested. [Details](docs/SECURITY-FIX-2026-10-10-PASS44.md).

### 🔴 AI
Provider availability/runtime ещё не подтверждён end-to-end.

### 🟡 Media
Trainer feed image endpoints всё ещё требуют закрытия 404/502.

### 🟡 Production
Последний наблюдавшийся READY Vercel build — `e23fb882`; более новый docs-only build `701573ef` был BUILDING. Live browser/API smoke ещё не выполнен, SpaceWeb PHP deployment не подтверждён.

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


## 2026-10-07 — Pass 26A: ответы/формулы химии

| Контур | Статус | Результат |
|---|---|---|
| Master catalog | 🟢 | 436 элементов |
| Open tasks | 🟢 | 260 сохранены |
| Test questions | 🟢 | 176 сохранены с ответами/вариантами |
| Prepared answers | 🟢 | 40 элементов |
| Structural-formula answers | 🟡 | 19 подготовлены из текста; визуальная проверка ещё нужна |
| Production scoring answers | 🟡 | `exam_questions.answer` намеренно не изменён |
| Remaining open-task answers | 🟡 | 220 требуют подготовки и проверки |
| RLS | 🟢 | включён для master catalog |


## 2026-10-07 — Pass 26B: две методички химии

| Контур | Статус | Результат |
|---|---|---|
| Методическое пособие №1 | 🟢 | Органическая и физическая химия; контрольные вопросы/задания |
| Методическое пособие №2 | 🟢 | Минаева/Пронкина; задачи, упражнения и тестовые задания по органической химии |
| Source registry | 🟢 | `chemistry_source_documents` содержит отдельные provenance-записи |
| Unified catalog | 🟢 | оба источника представлены в общем каталоге |
| Duplicate handling | 🟢 | одинаковый текст не удаляется без проверки происхождения |
| Source attribution | 🟡 | неустановленный источник не приписывается догадкой |


### Pass 27 — Химический банк на сайте (2026-10-07)
- 🟢 Добавлен API `GET /api/v1/tests/chemistry-master` с поиском, типом задания, фильтром сохранённых формул и пагинацией.
- 🟢 На странице «Тесты и билеты» выведен единый банк из 436 элементов.
- 🟢 В карточке сохраняются вопрос, ответ (если подготовлен), источник, номер источника и статус ответа.
- 🟢 Формульные задания визуально помечаются; неподготовленные ответы явно показываются как требующие решения.


## 2026-10-07 — Storage architecture clarification: Supabase Free + SpaceWeb media

Зафиксирована окончательная модель хранения проекта:

| Слой | Роль |
|---|---|
| Supabase Free | БД, Auth, RLS, metadata, связи, вопросы/тесты, учебный план, trainer cards |
| SpaceWeb | физическое тяжёлое media: фото, изображения препаратов, электронограммы, крупные документы |
| GitHub | код, миграции, документация, небольшие декларативные контентные артефакты |
| Vercel | frontend и deployment, не постоянное media-хранилище |

Для большого content.zip действует правило: **не требуется загружать весь архив в чат целиком**. Его можно анализировать и переносить частями; полнота архива не должна зависеть от лимита вложения чата.

По текущему content.zip:
- 444 фактических файлов;
- 389 изображений;
- 207 уникальных изображений после дедупликации;
- 206 trainer feed cards уже есть в Supabase;
- 28 EM представлены в данных;
- физические файлы должны быть подтверждены отдельно на SpaceWeb.

Важно: наличие записи в Supabase не считается доказательством наличия физического файла. Финальный media gate:
Supabase metadata → API → SpaceWeb → HTTP 200.

public.files/Supabase Storage не являются обязательным местом для всех histology images. Использование их для всего архива не требуется и не должно делаться автоматически из-за ограничения бесплатного Supabase.

Статус: 🟡 DB/content metadata в основном синхронизированы; SpaceWeb physical media verification остаётся отдельным target-environment этапом.


## 2026-10-07 — SpaceWeb media root подтверждён

По прямому скриншоту файловой системы SpaceWeb подтверждено физическое наличие Histology media root под /public_html/....

В корне видны:
- source-materials;
- electronograms;
- em;
- 5_Фотографии препаратов;
- дополнительный каталог с Unicode/URL-encoded именованием;
- README.md.

Поэтому физический архив не следует считать отсутствующим только потому, что его нет в GitHub или public.files Supabase.

| Проверка | Статус |
|---|---|
| SpaceWeb media root существует | 🟢 подтверждено |
| Ожидаемая структура каталогов | 🟢 подтверждена |
| Все файлы из исходного content.zip сопоставлены | 🟡 ещё требуется |
| Все 206 trainer cards → физические файлы | 🟡 ещё требуется |
| 28 EM → физические файлы | 🟡 ещё требуется |
| Materials → физические документы/фото | 🟡 ещё требуется |
| Production HTTP media smoke | 🟡 ещё требуется |

Каноническая схема:
Supabase Free → metadata/source_key/path → SpaceWeb physical file → API endpoint.


## 2026-10-07 — Question Library

🟢 Реализована полноценная база вопросов для всех авторизованных пользователей:
- все опубликованные типы вопросов;
- ответы доступны без запуска теста;
- предмет/тип/поиск;
- пагинация;
- жалоба на конкретный вопрос;
- существующий admin problem center и быстрый редактор используются для обработки жалоб.

🟢 `QuestionReport` уже существовал и теперь рассматривается как обязательная часть карточки каждого вопроса, а не только тестового прохождения.


## 2026-10-07 — subject-scoped Question Library

🟢 Из предметной страницы «База вопросов» открывается с фиксированным `subject_slug`. Гистология → только гистология; органическая/физическая химия → только химия. Для гистологии отдельно сохранён тренажёр микропрепаратов. Глобальный вход в базу без subject context допускает ручной выбор предмета.


## 2026-10-07 — Source-of-Truth Audit

🟢 Создан единый документ `docs/PROJECT-SOURCE-OF-TRUTH-AUDIT-2026-10-07.md`, который объединяет правила продукта, архитектуры и release-gates.

🟡 Остаточные зоны не закрыты формально до runtime/browser/physical-media проверки: Histology reconciliation, Materials files, schedule session integrity, единый schedule+homework UX, production auth/runtime, latest CI, strict TS/ESLint, timezone centralization и полный mobile/browser acceptance.


## 2026-10-07 — Zero-cost / full-functionality release gate

| Контур | Статус | Правило |
|---|---|---|
| GitHub Free | 🟢 | source/docs/migrations/CI в бесплатных лимитах |
| Vercel Hobby | 🟢 | frontend/deployment без обязательного Pro |
| SpaceWeb Free | 🟢 | PHP API/runtime и физический контент в бесплатном лимите |
| Supabase Free | 🟢 | DB/Auth/RLS/metadata без обязательного paid plan |
| Backblaze B2 Free | 🟢 | дополнительное object storage в бесплатной квоте |
| Full functionality | 🟡 | функция не должна урезаться ради free-tier; оптимизация обязательна |
| Unexpected billing protection | 🟡 | для каждого сервиса проверять лимиты и поведение после free quota |
| Optional AI | 🟢 | базовая функция не зависит от платного AI |

Главное правило: **не терять функциональность из-за бесплатных лимитов**. Сначала оптимизировать storage, egress, caching, batching, lazy loading, streaming, deduplication и распределение нагрузки.

Полная политика: docs/FREE-TIER-FULL-FUNCTIONALITY-POLICY-2026-10-07.md.


## 2026-10-07 — Admin Data & Storage Control Center

- 🟢 Database Console уже существует и усилен поиском/пагинацией.
- 🟡 Следующий этап: PC-style управление таблицами, relation inspector, bulk dry-run и health checks.
- 🟡 Затем: единый File & Storage Center для SpaceWeb/B2 и сверки с Supabase metadata.
- 🟡 Затем: агрегированный Operations Dashboard с квотами, проверками, экспортами и безопасным rollback.
- 🟢 Архитектурное правило: Supabase — canonical DB; SpaceWeb/B2 — physical object layers; дополнительные бесплатные сервисы — только специализированные дополнения.

Архитектура: `docs/ADMIN-DATA-CONSOLE-ARCHITECTURE.md`.

## 2026-10-07 — Consolidated Remaining Implementation Map

Все ранее обнаруженные незакрытые направления сведены в единый backlog. Статус 🟡 означает «частично реализовано / требуется target-environment verification или finishing», а не «сломано».

| Направление | Приоритет | Статус | Следующий gate |
|---|---:|---|---|
| Production Vercel/SpaceWeb/CI | P0 | 🟡 | READY + green CI + authenticated smoke |
| Auth / roles / RLS / security | P0 | 🟡 | login/refresh/roles/RLS runtime audit |
| Histology physical media | P0 | 🟡 | 444-file + 206-card + 28-EM reconciliation + HTTP 200 |
| Tests / Question Library | P0 | 🟡 | all published tests smoke + subject isolation |
| Schedule + Homework unified UX | P0 | 🟡 | date → subject → lesson → homework → submission/status |
| Materials viewer/files | P1 | 🟡 | DOCX/PDF/media end-to-end |
| Trainers / preparations | P1 | 🟡 | start/resume/finish/result/error-review |
| Admin Content Center | P1 | 🟡 | question/material/lesson/trainer editing + history |
| Admin DB/File/Storage Center | P1 | 🟡 | relations, bulk dry-run, reconciliation, B2/SpaceWeb |
| Mobile/browser acceptance | P1 | 🟡 | iPhone/Android/Windows/macOS matrix |
| Chemistry master completion | P1 | 🟡 | 220 answers + formula visual verification + OCR expansion |
| Smart grading E2E | P1 | 🟡 | deterministic + optional AI + pending/error retry |
| Code quality | P1 | 🟡 | strict TS/ESLint, timezone, legacy cleanup |
| AI tutor/providers | P2 | 🟡 | verified primary + fallback + context-aware tutor |
| Performance/free-tier optimization | P2 | 🟡 | measurements + cache/lazy/batch/dedup |
| Optional free-service aggregation | P2 | 🟡 | permanent-free service audit before integration |
| Release/documentation discipline | P1 | 🟢/🟡 | baseline + roadmap/status on every risky change |

### Required product flows to preserve
- Auth → dashboard → schedule → subject → tests → preparation → result/history.
- Subject → curriculum → question bank → answer/report → admin correction.
- Histology → atlas/trainer → materials/documents/images.
- Schedule → date → subject → homework → submission → derived status.
- Chemistry → curriculum → unified 436-item master bank → provenance/formulas.
- Admin → DB console → content/storage center → audit/rollback.

### Non-regression rule
Stable baseline 8e8fef5c2f661e7e1d625964909307c00c343884 remains the rollback reference. No backlog item may replace a canonical data source or remove working functionality for the sake of free-tier limits.

### Release order
1. P0 target-runtime and authenticated verification.
2. Physical media/material delivery.
3. Tests/question bank/smart grading smoke.
4. Unified schedule + homework flow.
5. Admin/content/storage workspace.
6. Mobile/browser acceptance.
7. Chemistry completion and trainers/preparation finishing.
8. Strict code-quality cleanup.
9. AI tutor and optional free-service aggregation.
10. Final UI polish and release snapshot.


## 2026-10-07 — P0 implementation pass

🟢 Кодовые исправления: curriculum-map exception handler и связь учебного плана с topic metadata восстановлены.

🟡 Production gate: Vercel build-rate-limit; GitHub Actions/runtime smoke пока без подтверждённого зелёного результата.

Следующий gate: CI → Vercel READY → SpaceWeb runtime → authenticated smoke → следующий P0 контент/расписание.


## 2026-10-07 — P0 verification/fix cycle continuation

- 🟢 Vercel commit `59e38d9664645556bd2fca64ea6d97f998a5f200` достиг READY; combined GitHub status для него — Vercel success.
- 🟢 HealthChecker hardened: public health no longer exposes DB host/port/user or raw connection diagnostics.
- 🟢 Histology Materials: authenticated SpaceWeb physical-file fallback added to generic Materials page; dedicated HistologyMaterials already uses authenticated file loading.
- 🟢 Schedule + Homework: source/UI audit confirms current schedule page already selects a concrete date + subject and creates homework with that subject/date/group context; planner returns homework, attendance and recovery in one response.
- 🟡 Latest post-READY commits currently cannot receive a new Vercel deployment because of external `build-rate-limit`; therefore those latest fixes remain source-verified until a READY deployment exists.
- 🟡 SpaceWeb physical-file HTTP verification and authenticated production smoke remain open gates.


## 2026-10-07 — verification cycle

- 🟢 Supabase: `public.chemistry_source_documents` теперь защищена RLS.
- 🟢 Supabase policy: только `authenticated SELECT`; записи остаются server-side.
- 🟢 Security advisor повторно проверен: критический `rls_disabled` для этой таблицы устранён.
- 🟡 Supabase Auth: остаётся отдельное предупреждение Leaked Password Protection; это следующий security hardening gate.
- 🟡 Subject isolation: обнаружены повторяющиеся `subjects.slug` (в том числе histology=2, chemistry_organic_physical=3); нельзя делать глобальную уникальность slug без миграции контекста. Следующий шаг — authoritative subject UUID/context в search/question-bank boundary.

## 2026-10-07 — media optimization requirement
- 🟡 Added Media Optimization Pipeline to roadmap.
- 🟡 Target architecture: original → optimized master → thumbnails/responsive derivatives → client.
- 🟡 WebP/AVIF for images; WebM/AV1/VP9 reserved for video/animation, not ordinary photos.
- 🟡 Server-side processing, checksum deduplication, EXIF stripping, responsive sizes, cache headers and storage/egress metrics are required.
- 🟡 Existing Atlas/content and Materials physical-file architecture must remain compatible.


## 2026-10-07 — Media quality/readability gate

🟡 Media Optimization остаётся IN PROGRESS. Дополнительно зафиксировано:

- content-aware classification вместо единого quality profile;
- несколько compression/quality candidates для значимых изображений;
- отдельная проверка мелкого текста, подписей, формул и учебных деталей;
- выбор самого лёгкого кандидата, прошедшего quality/readability threshold;
- автоматический переход на менее сжатый вариант при провале проверки;
- fallback на original, если ни один derivative не проходит quality gate;
- при неопределённости quality-check запрещено рисковать читаемостью;
- original не удаляется ради экономии размера, если нужен zoom/восстановление/архив;
- DONE только после проверки реальных фото препаратов, ЭМ, атласа, лекционных материалов и 1080p-видео на mobile/desktop.


## 2026-10-07 — Pass 28: subject isolation hardening

| Контур | Статус | Результат |
|---|---|---|
| exam_questions | 🟢 | subject_id authoritative filter added; slug remains fallback |
| Ticket generation | 🟢 | bank subject UUID preferred |
| Question Library catalog | 🟢 | preserves distinct subject UUIDs even with duplicate slugs |
| Global Search | 🟢 | supports authoritative subject_id boundary |
| Admin content package | 🟢 | ambiguous duplicate slug is rejected without explicit UUID |
| Live ticket-bank integrity | 🟢 | current banks have matching subject UUIDs with their question pools |
| Frontend subject propagation | 🟡 | slug-only legacy entry points still need migration to UUID context where available |
| Vercel/SpaceWeb runtime | 🟡 | latest commits remain source-verified until READY deployment/runtime smoke |


## 2026-10-07 — Pass 28A: Question Library UUID propagation

| Контур | Статус | Результат |
|---|---|---|
| Question Library frontend | 🟢 | передаёт subject_id, если UUID известен |
| Legacy slug-only context | 🟢 | безопасный auto-resolve только при единственном matching subject_id |
| Ambiguous subject slug | 🟢 | не угадывается; пользовательский выбор остаётся доступен |
| Full legacy entry-point migration | 🟡 | требуется отдельный cleanup по старым ссылкам |


## 2026-10-07 — Pass 29: Smart grading state machine

| Контур | Статус | Результат |
|---|---|---|
| Deterministic grading | 🟢 | exact/normalized path before AI |
| Optional AI fallback | 🟢 | AI does not define whether a test can be completed |
| Pending/error semantics | 🟢 | completion is allowed; unresolved answer remains stored |
| Normal test retry | 🟢 | dedicated regrade endpoint + score recalculation |
| Preparation retry | 🟢 | dedicated retry endpoint for one/all unresolved answers |
| Frontend authority | 🟢 | Test/Preparation UI reads server grading result |
| AI review after preparation | 🟢 | separate optional analytics, not a completion dependency |
| Real test E2E | 🟡 | requires target-runtime authenticated smoke |


## 2026-10-07 — Pass 30: file visibility security alignment

| Контур | Статус | Результат |
|---|---|---|
| FileRepository server authorization | 🟢 | group-null no longer means global access |
| Supabase files RLS | 🟢 | owner/public/active-member semantics aligned |
| B2 presign boundary | 🟢 | presign follows server access check |
| Security advisor | 🟢/🟡 | file-policy issue cleared; leaked-password warning remains |
| Runtime authorization smoke | 🟡 | owner/public/group/inactive/unrelated cases still require target environment |


## 2026-10-07 — Pass 31: Histology material viewer access

| Контур | Статус | Результат |
|---|---|---|
| Histology material viewer | 🟢 | MBH specialty check added before physical-file delivery |
| Generic Materials | 🟢 | specialty filtering already present |
| Direct viewer bypass | 🟢 | authenticated user without MBH can no longer use the Histology viewer endpoint |
| Physical media runtime | 🟡 | final SpaceWeb HTTP/browser smoke remains |


## 2026-10-08 — Histology Lecture 05 / practical cross-links

| Контур | Статус | Результат |
|---|---|---|
| Lecture 05 body | 🟢 | «Кровь и лимфа» опубликована в site_content |
| Curriculum link | 🟢 | module/topic UUID привязан к canonical теме Недели 5–6 |
| Preparation links | 🟢 | 8 существующих карточек «Кровь мазок» связаны как учебные cross-links |
| Electronograms | 🟢 | нейтрофильный фагоцитоз + капилляр записаны как релевантные ЭМ |
| Materials | 🟢 | «4.Кровь» + source-backed методический материал связаны |
| Test | 🟢 | «Гистология — общая: кровь», 20 вопросов |
| Exam questions | 🟢 | подтверждённые IDs записаны в lecture metadata |
| Production/browser smoke | 🟡 | требуется target-runtime проверка |
| Automatic related-content UI | ⬜ | следующий product step; пока есть явные ссылки внутри лекции |

Лекция теперь строит не только теоретический текст, а маршрут занятия: **теория → препарат → признак → ЭМ → тест → экзаменационный вопрос**.

Важно: существующие trainer-карточки не были переназначены на другой plan_topic только ради этой связи. Cross-link не меняет canonical учебную принадлежность контента.


## 2026-10-08 — Histology Lecture 05 / Mermaid rendering repair

| Контур | Статус | Результат |
|---|---|---|
| Mermaid source | 🟢 | 11 Mermaid-блоков в `body_md` проверены; лишнее экранирование обратных кавычек и кавычек удалено |
| LectureRenderer | 🟢 | добавлена нормализация импортированного Markdown перед разбором блоков |
| Live Supabase content | 🟢 | `escaped_backticks=0`, `escaped_quotes=0`, `mermaid_blocks=11` |
| Production/browser smoke | 🟡 | требуется после публикации нового frontend commit |


### 2026-10-08 — Lecture 05: links + visual references
- 🟢 Fixed Markdown link rendering in `LectureRenderer`: internal lecture links such as «Микропрепараты» and the 20-question test now become actual clickable anchors.
- 🟢 Added 9 visual blocks to Lecture 05: 5 existing MEDBIOHIM blood-smear preparation images + 4 independent University of Utah WebPath images.
- 🟢 External images are used only as a visual cross-check; canonical MEDBIOHIM trainer cards remain the primary practical material.
- 🟢 Live Supabase lecture updated and verified; only Lecture 05 was touched.
- 🟡 Runtime/browser smoke on deployed Vercel build remains to be confirmed.
\n## 2026-10-08 — Histology Lecture 05: production link/media repair\n\n🟢 По iPhone/Safari smoke со скриншотами подтверждены две реальные причины регрессии:\n- ссылки Markdown в production всё ещё показывались текстом, потому что предыдущая версия regex в LectureRenderer была некорректно экранирована;\n- 5 собственных фото лекции обращались напрямую к /content/histology на Vercel, хотя физические файлы Histology находятся на SpaceWeb и должны проходить через authenticated trainer-media pipeline.\n\n🟢 Исправлено:\n- LectureRenderer получил корректный Markdown-link parser для внутренних и внешних URL;\n- изображения собственных препаратов Lecture 05 переведены на canonical trainer IDs;\n- ImageBlock теперь получает authenticated trainer image через существующий getTrainerImageUrl(), поэтому Authorization не теряется на обычном <img>;\n- live Supabase Lecture 05 обновлена: старых прямых /content/histology/... URL в этих пяти блоках больше нет;\n- создана воспроизводимая миграция database/migrations/20261008_histology_lecture_05_trainer_images_fix.sql;\n- 4 внешних WebPath-фотографии остаются прямыми HTTPS-источниками и продолжают работать без авторизации.\n\n🟡 Не ставить production DONE до нового Vercel READY + повторного iPhone/Safari smoke: ссылки, 5 MEDBIOHIM-фото, 4 WebPath-фото, Mermaid и тестовый переход должны быть проверены именно в deployed build.
 
## 2026-10-08 — Histology Lecture 05: learning UX / photo-text / mini-tests / Atlas viewer

**Статус: 🟡 IN PROGRESS**

| Область | Статус | Факт |
|---|---|---|
| Lecture 05 source | 🟢 | `site_content(key=lectures)`, id `lec-histology-blood-20261008` |
| Curriculum | 🟢 | module/topic canonical UUID сохранены |
| Markdown renderer | 🟢 | headings, bold, tables, blockquotes, links восстановлены |
| Mermaid | 🟢 | 11 блоков Lecture 05 |
| Canonical trainer photos | 🟢 | 5 lecture photo blocks используют trainer IDs |
| Photo ↔ text | 🟢 | название/метаданные берутся из trainer card |
| Visual checkpoints | 🟢 | изображения распределены по смысловым местам, старый photo wall удалён |
| Mini-tests | 🟢 | 6 блоков после логичных разделов, вопросы из `public.questions` |
| Mini-test grading | 🟢 code/live API | server-side check, answer key не передаётся клиенту |
| Atlas viewer | 🟢 code | centered viewport modal + zoom + close + fullscreen fallback |
| WebPath | 🟢 | 2 external cross-check images |
| Vercel production | 🟡 | нужен READY/build smoke после последних commits |
| SpaceWeb | 🟡 | новые mini-quiz endpoints нужно развернуть |
| iPhone Safari | 🟡 | нужен реальный authenticated smoke |
| Cross-page regression | 🟡 | проверить лекции/атлас/тренажёр/материалы |

### Full ledger
- Lecture 05 curriculum/content sync;
- 8 trainer cross-links;
- 2 EM links;
- 20-question blood test link;
- 9 exam-question links;
- 5 protected trainer image repairs;
- Markdown link repair;
- Mermaid normalization;
- Markdown renderer regression repair;
- canonical trainer-image flow;
- viewport-centered image lightbox;
- Atlas zoom/fullscreen behavior;
- 6 database-backed mini-tests;
- photo-text deduplication;
- contextual visual checkpoints;
- removal of old duplicate photo wall;
- documentation in ROADMAP / SYNC_STAMP / dedicated learning UX document.

### Release gate
До 🟢 DONE проверить deployed/authenticated runtime:
1. Lecture 05 opens;
2. Markdown/table/link rendering;
3. 6 mini-tests load and grade;
4. 5 MEDBIOHIM photos load;
5. photo card text matches canonical trainer card;
6. image viewer is centered on viewport;
7. zoom/close/fullscreen work on iPhone Safari;
8. WebPath images work;
9. 11 Mermaid blocks work;
10. full 20-question blood test still opens.

 
### 2026-10-08 — новое дополнение Lecture 05: возрастные нормы

| Пункт | Статус |
|---|---|
| Возрастная временная шкала | 🟢 |
| Таблица лейкоцитарной формулы по возрастам | 🟢 |
| Гемограмма новорождённого / грудного / взрослого | 🟢 |
| Экспресс-алгоритм возрастной карточки | 🟢 |
| Мини-тест из существующей БД гистологии | 🟢 |
| Различия референсов сохранены как варианты | 🟢 |
| Runtime Safari / production smoke | 🟡 |

Lecture 05 теперь содержит **8 database-backed mini-test blocks** после логичных учебных разделов.


## 2026-10-08 — Image viewer controls

- 🟢 В src/components/media/ImageLightbox.tsx добавлены явные пользовательские кнопки: «Открыть на весь экран», «Уменьшить», «Увеличить», «Сбросить», «Полный экран», «Закрыть».
- 🟢 Кнопка открытия вынесена непосредственно на карточку изображения, чтобы действие было очевидно на мобильном устройстве.
- 🟢 Нативный Fullscreen API используется как дополнительный режим; fixed viewport-lightbox остаётся fallback для Safari.
- 🟡 Не считать production/runtime DONE до Vercel READY и реального iPhone Safari smoke.
- Commit: 7735ff1ccdc21b509ca6e61bb8267d81a3a1a4bf.


## 2026-10-08 — Unified Media Viewer audit / correction

| Контур | Статус | Фактическое состояние |
|---|---|---|
| Atlas outer modal | 🟢 FIXED IN BRANCH | удалён вложенный 90vh + overflow-auto слой |
| Unified viewer | 🟢 CODE | 100dvh, safe-area, controls, zoom/pan, desktop wheel/double-click, touch Pointer Events |
| Native fullscreen | 🟡 ENHANCEMENT | используется только если браузер разрешает; viewer без него остаётся полноценным |
| Lecture viewer | 🟡 | использует общий ImageLightbox, нужен regression smoke |
| Trainer viewer | 🟡 | общий компонент используется, нужен regression smoke |
| Materials viewer | 🟡 | отдельный document/photo modal ещё требует отдельного UX-аудита |
| Windows desktop | 🟡 | обязательный реальный browser smoke |
| iPhone Safari | 🟡 | обязательный реальный authenticated smoke |
| Android Chrome | 🟡 | обязательный touch/pinch smoke |
| Cross-page regression | 🟡 | lecture → atlas → trainer → materials |

Правило: наличие кода не переводит эти пункты в DONE; нужен target-runtime/browser evidence.


### 2026-10-08 — viewer regression cleanup
- 🟢 literal escaped-newline source artifact устранён из `HistologyTrainerParts.tsx`;
- 🟢 legacy photo-rendering ветка Materials удалена после перехода на unified viewer;
- 🟢 image-file preview в Materials использует unified viewer;
- 🟢 retry для недоступного trainer photo добавлен;
- 🟢 blob URL lifecycle для Materials document/PDF/image preview приведён к управляемому состоянию;
- 🟡 CI/Vercel остаются инфраструктурными release blockers: GitHub jobs создаются, но завершаются без steps/logs; Vercel отвечает `build-rate-limit`.
\n## 2026-10-08 — Unified Media Viewer: viewport/stacking correction\n\n| Viewer portal / viewport | 🟢 CODE PATCHED | `ImageLightbox` moved to `document.body` portal; explicit 100vw/visualViewport sizing and top-level z-index; glass colors made explicit |\n| iPhone Safari smoke | 🟡 | must confirm viewer covers MobileNav, fills visible viewport, centers image and prevents page scroll |\n| Cross-platform viewer smoke | 🟡 | Windows/macOS/iPhone/Android + Lecture → Atlas → Trainer → Materials |\n| Production DONE | 🔴 | blocked until target-runtime proof for exact commit |\n
2026-10-08 — launch-blocker sweep: fixed a real PHP source artifact (`Router;\\nuse`) in `backend/config/routes/questions_rest.php` on the existing `fix/unified-media-viewer-desktop-mobile` branch. No new branch. GitHub Actions still terminates before steps/logs, while Vercel reports the external build-rate-limit blocker; source/runtime acceptance remains pending.


## 2026-10-08 — Final pre-launch sweep

| Контур | Статус | Фактическое состояние |
|---|---|---|
| Materials physical delivery | 🟢 CODE | canonical B2 presigned URL + authenticated legacy Histology fallback |
| Vercel media proxy | 🟢 CODE | media redirect/cache/disposition headers preserved |
| Materials URL negotiation | 🟢 CODE | dedicated `file-url` JSON endpoint avoids browser opaque redirects |
| Schedule DB integrity | 🟢 LIVE | 309/309 entries have `session_id`; duplicate index removed |
| Question/test integrity | 🟢 LIVE | 479/479 published active Histology questions linked; duplicate/orphan links 0 |
| Homework backend syntax | 🟢 CODE | confirmed/fixed PHP SQL string quoting defect |
| Atlas unified viewer | 🟢 CODE | portal + viewport + zoom/pan/fullscreen/close; runtime pending |
| Vercel deployment | 🔴 BLOCKED | external build-rate-limit on current period |
| SpaceWeb runtime | 🟡 | exact backend commit + media HTTP smoke required |
| Browser acceptance | 🟡 | iPhone/Android/desktop required after deployment |
| AI providers | 🟡 | external credentials/network; optional for base grading path |

Правило неизменно: production DONE только после exact-deployment + authenticated runtime evidence.

## 2026-10-08 — Pre-launch security/deployment gate

- 🟢 Removed the hardcoded Supabase anon key from src/lib/supabase.ts.
- 🟢 Removed the same hardcoded key fallback from the Vercel API proxy; deployment now requires the configured environment variable.
- 🟢 Vercel successfully built the preceding branch commit 87c13f01eb5fb983dd063cf90d0c0e5744f27ef0 (READY).
- 🟡 The next source commit is not yet represented by a new Vercel deployment; Vercel API access available in this session cannot create a fresh deployment for the project.
- 🟡 GitHub Actions MEDBIOHIM code checks currently fails both backend/frontend jobs immediately with zero steps executed; this is an Actions runner/infrastructure gate, not a reported PHP/TypeScript test failure.

## 2026-10-08 — Atlas viewer visual baseline restored

- 🟢 `ImageLightbox` now uses the `main` branch visual composition as the source of truth: dark translucent viewport, centered image, compact top controls, no large white modal card.
- 🟢 New functionality remains: portal to `document.body`, viewport/safe-area handling, external/open-on-mount use, title/details, fullscreen, zoom controls and background scroll lock.
- 🟢 The viewer must not alter Atlas page layout or inherit the position of the source card.
- 🟡 Target-device smoke test remains required before production sign-off.


## 2026-10-07 — Pass 32: Schedule → exact lesson → homework → photos
| Exact lesson homework binding | 🟢 | `homeworks.schedule_entry_id` implemented in API/repository/UI; live column + index verified |
| Homework photo attachments | 🟢 source | Multi-photo creation UI + `homework_attachments` + B2 delivery implemented; authenticated runtime E2E still pending |
| Starosta homework creation | 🟢 source | UI and backend now recognize group `starosta`; ordinary student cannot publish shared homework |
| Homework due_date persistence | 🟢 | Primary repository now writes `due_date` |
| Private test env inventory | 🟢 | Variable families documented; secret values remain outside GitHub |
| Target runtime deployment smoke | 🟡 P0 | Latest branch still needs READY Vercel/SpaceWeb authenticated smoke |

| Materials physical delivery semantics | 🟢 source | live audit explains 80 Histology source_path-only rows; unified viewer fix is in draft PR #16; runtime HTTP smoke still pending |

| File & Storage Center foundation | 🟢 source | checksum/provider/processing metadata + non-destructive reference audit UI/API implemented |
| Physical object reconciliation | 🟡 | B2/SpaceWeb existence/head checks still required |
| Media optimization pipeline | 🟡 | quality-gated image/video derivatives remain next implementation stage |

## 2026-10-07 — Pass 34: complete B2 reconciliation foundation

| Контур | Статус | Результат |
|---|---|---|
| B2 metadata keyset | 🟢 | строится по всем active B2-backed files, независимо от UI limit |
| B2 pagination | 🟢 | audit проходит страницы B2 до завершения |
| Missing physical objects | 🟢 source | DB B2-backed records отсутствующие в B2 считаются отдельно |
| B2 orphan objects | 🟢 source | объекты без соответствующего B2 metadata key считаются отдельно |
| Provider isolation | 🟢 | SpaceWeb/unknown не ошибочно считаются B2 |
| Storage Center UI | 🟢 source | показывает «нет в B2» и «нет в БД» |
| SpaceWeb reconciliation | 🟡 | нужен target-runtime/host доступ к физическому дереву |
| Media optimizer | 🟡 | следующий implementation pass |
| Target runtime | 🟡 | GitHub source changed; production verification blocked by deployment/runtime gates |


## 2026-10-07 — Pass 35: media derivative metadata foundation

| Контур | Статус | Результат |
|---|---|---|
| file_variants schema | 🟢 | dedicated parent/variant metadata table added |
| Variant uniqueness | 🟢 | one variant key per parent file |
| Processing state | 🟢 | ready/queued/processing/failed/skipped |
| Variant visibility | 🟢 | RLS follows parent file access boundary |
| Physical derivative generation | 🟡 | not yet implemented; requires runtime capability/worker verification |
| Existing binaries | 🟢 | untouched by this pass |


## 2026-10-07 — Pass 36: content-aware media quality gate

| Контур | Статус | Результат |
|---|---|---|
| Content classification roles | green | policy has distinct gates for text/diagram/scan and specimen/EM/atlas |
| Downscale protection | green | rejects overly aggressive derivative dimensions |
| Text readability gate | green | rejects candidates below readability threshold for text-heavy media |
| Detail/edge gate | green | protects EM/micropreparation/atlas/diagram detail |
| Artifact gate | green | rejects candidates with excessive compression artifact score |
| Video ladder policy | green | 1080p preserved, 720p/480p fallbacks available |
| Actual encoder | yellow | requires runtime capability/worker integration |
| Perceptual metrics | yellow | requires real generated candidates and validation samples |


## 2026-10-07 — Pass 37: safe derivative processor foundation

| Контур | Статус | Результат |
|---|---|---|
| FileVariantRepository | 🟢 source | upsert/list/status для производных |
| MIME detection | 🟢 source | фактический MIME через finfo |
| WebP/AVIF generation | 🟡 | выполняется только если GD encoder реально доступен на runtime |
| Quality policy integration | 🟢 source | generated candidates проходят MediaQualityPolicy |
| Original preservation | 🟢 | оригинал не удаляется и не переписывается |
| Admin processing endpoint | 🟢 source | strict-admin ручной запуск для B2-backed image |
| Automatic queue/worker | 🟡 | намеренно не заявлен до target-runtime verification |
| Perceptual quality metrics | 🟡 | пока отсутствуют реальные text/detail/artifact measurements |
| Target runtime smoke | 🟡 | требуется реальный SpaceWeb/B2 image processing test |


## 2026-10-08 — Histology lectures

🟢 **Lecture bodies:** выполнено. 20 опубликованных canonical records в `site_content`; 19 тел собраны из source-backed `materials` (`Гистология.zip`) + ранее существовавшая полноценная Lecture 05. Добавлена отдельная supplementary лекция по гистотехнике. Legacy пустые stubs переведены в `is_published=false`.

🟢 **Reproducibility:** добавлена `database/migrations/20261008_histology_full_lectures.sql`.

🟡 **Не считать финальным production gate:** browser/Vercel smoke и физическая media reconciliation остаются отдельными проверками.

## 2026-10-08 — Histology lecture-plan learning links

| Контур | Статус | Результат |
|---|---|---|
| Exact lecture titles | 🟢 | 16/16 текущих лекций совпадают с названиями curriculum 1:1 |
| Plan ordering | 🟢 | LectureService::listPublished() сортирует по curriculum.order_index |
| Word methodics | 🟢 | 16/16 имеют конкретный source-backed methodic/section |
| Page ranges | 🟢 source / 🟡 legacy .doc | Надёжные страницы указаны; для старых .doc показывается проверенный section title без выдуманной пагинации |
| Scheme/file attachments | 🟢 | 16/16 имеют связанные схемы/файлы |
| Micropreparations | 🟢 | 16/16 имеют связанные препараты; для Lecture 01 добавлены 3 клеточных препарата как явные визуальные cross-links |
| Electronograms | 🟢 source-backed | Подключены только там, где есть канонические cards текущей темы |
| Topic ownership | 🟢 | Исправлены выявленные cross-topic trainer mappings |
| Lecture UI | 🟢 source | На странице лекции показываются methodics/files/preparations/EM с открытием |
| Runtime Word delivery | 🟡 | Физическое наличие legacy .doc на SpaceWeb и authenticated browser smoke ещё требуется подтвердить |

### Canonical sequence
**План → точное название лекции → методичка → страницы/раздел → схемы/файлы → микропрепараты → ЭМ → тесты/вопросы.**

Репродуцируемые миграции: database/migrations/20261008_histology_lecture_plan_learning_links.sql и database/migrations/20261008_histology_lecture_01_preparations.sql.


## 2026-10-08 — Rich lecture editor / Lecture 05 standard

| Контур | Статус | Результат |
|---|---|---|
| Lecture 05 canonical format | 🟢 | сохранены исходные 11 Mermaid + 7 image + 8 quiz blocks и source-backed tables |
| Lossless editor round-trip | 🟢 source | body_md special blocks открываются как редактируемые placeholders и сериализуются обратно |
| Mermaid builder | 🟢 | конструктор узлов/связей + raw Mermaid режим |
| Table builder | 🟢 | табличный ввод с Markdown round-trip |
| Mini-quiz builder | 🟢 | выбирает существующие question IDs без переноса эталонных ответов в лекцию |
| Formula / chemistry / chart / video | 🟢 | отдельные вставляемые block types |
| Trainer / EM picker | 🟢 | выбор канонических карточек из атласа/ЭМ |
| Lecture learning-link editor | 🟢 | methodics + pages/section + files + preparations + EM |
| Admin API | 🟢 | related_learning разрешён в lecture PATCH |
| Remaining lectures rich layer | 🟢 | 15 лекций получили source-backed scheme + preparations + mini-test |
| Full parity with Lecture 05 depth | 🟡 | ещё нужен отдельный source-backed content expansion pass |
| Vercel production verification | 🟡 | текущий Vercel gate — build-rate-limit, не ошибка TS/build |


## 2026-10-08 — Canonical lecture editor cleanup

| Контур | Статус | Результат |
|---|---|---|
| Single admin editor | 🟢 | legacy embedded RichEditor удалён; используется RichLectureEditor |
| Lossless special blocks | 🟢 | Mermaid / image / quiz / chart / chem / video / formula сохраняются через block serialization |
| Tables | 🟢 | Markdown table round-trip + direct cell editing |
| Scheme creation | 🟢 | визуальный конструктор узлов/связей + raw Mermaid |
| Learning links | 🟢 | methodics/pages/files/preparations/EM редактируются из admin form |
| Curriculum title invariant | 🟢 | current Histology save принудительно оставляет plan title |
| Vercel gate | 🟡 | build-rate-limit остаётся внешним ограничением Vercel; source-side check продолжен independently |


## 2026-10-08 — Lecture 05 leukocyte differential trainer

🟢 В Лекцию 05 lec-histology-blood-20261008 встроен интерактивный тренажёр лейкоцитарной формулы.
- проценты: запоминание учебной нормы взрослого;
- ↑/↓: распознавание нейтрофилии/нейтропении, лимфоцитоза/лимфопении, эозинофилии, базофилии, моноцитопении и сдвига влево;
- мазок: распознавание клетки по изображению;
- два визуальных источника: локальные canonical MEDBIOHIM trainer cards и независимая внешняя сверка WebPath;
- внешний лабораторный reference-check отделён от учебной нормы Lecture 05 и помечен как вариант, зависящий от лаборатории;
- тренажёр является отдельным переиспользуемым блоком leukocyte в RichLectureEditor / LectureRenderer.

Важно: Lecture 05 уже редактируется через единый RichLectureEditor; новый тренажёр теперь также доступен как вставляемый блок редактора.


## 2026-10-08 — Unified Media Viewer refinement + branch audit

| Контур | Статус | Результат |
|---|---|---|
| Cursor/touch anchored zoom | 🟢 | масштабирование сохраняет точку под курсором или в центре pinch-жеста |
| Pinch/pan | 🟢 source | Pointer Events + двухпальцевый zoom + bounded drag/pan |
| Responsive controls | 🟢 source | компактные touch controls, safe-area, viewport через portal |
| Shared viewer | 🟢 | Atlas, Lecture, Materials и Trainer используют один `ImageLightbox` |
| Viewer branch reconciliation | 🟢 | `fix/unified-media-viewer-desktop-mobile` содержит 0 уникальных коммитов относительно `main` |
| Stale divergent branches | 🟡 | `beta`, `fix/chem-rendering-tests-rdkit`, `fix/lecture-service-schedule-home` требуют selective port/review, не wholesale merge |
| Target-runtime smoke | 🟡 P0 | exact `main` deployment + iPhone/Android + Windows/macOS + cross-page regression |


## 2026-10-08 — Leukocyte practical case-card trainer

| Контур | Статус | Результат |
|---|---|---|
| Source norms | 🟢 | возрастные колонки взяты из `4.Кровь.docx` |
| Cell recognition | 🟢 | карточка показывает учебный мазок, ответ вводится вручную |
| Age norm | 🟢 | ответ вводится вручную по возрастной колонке |
| Result transcription | 🟢 | процент показывается на карточке, студент переписывает его в 3-е поле |
| Conclusion | 🟢 | сравнение результата с нормой + термин из методички |
| Grade 2 | 🟢 | любая ошибка в одном из первых 4 полей |
| Grade 4 | 🟢 | первые 4 поля полностью верны |
| Grade 5 | 🟢 | первые 4 поля верны + функция клетки связана с учебной диагностической гипотезой |
| Mobile / desktop | 🟢 source | адаптивная карточная сетка + общий ImageLightbox |


### ✅ 2026-10-08 — практическая карточка: один лейкоцит в кадре

**Статус: готово в main.**

Распознавание клетки теперь проверяется только по однозначному визуальному примеру: одиночные локальные trainer-карточки для нейтрофила, лимфоцита и моноцита; сфокусированные изображения для эозинофила и базофила. Общие кадры вроде HEME002 больше не выбираются как исходное изображение для случайной клетки. Viewer умеет открывать такой сфокусированный кадр и дальше увеличивать/перемещать его.


### ✅ 2026-10-08 — фото + учебные рисунки в карточке лейкоцитов

**Статус: готово в `main`.**

Тренажёр теперь разнообразит визуальные примеры: случайно выдаётся реальный препарат или проверяемый учебный SVG-рисунок. Для одного и того же лейкоцита возможны два варианта рисунка; для части клеток доступны также локальный препарат и сфокусированный WebPath-кадр. В рисунках сохранены ключевые морфологические признаки из `4.Кровь.docx`, поэтому рисунок не является декоративной заменой, а служит самостоятельным учебным примером.


### ✅ 2026-10-08 — сборщик одного и нескольких тестов

В `/admin/tests` добавлен полноценный сборщик: выбор учебного контекста и пула вопросов, сбор одного теста или нескольких вариантов, автоматическая нумерация вариантов, `Сброс для нового теста`, предварительное отключение публикации и понятное описание структуры теста/вопроса.


### ✅ 2026-10-08 — уточнение п/я и с/я на карточках общего мазка

Для общего мазка тренажёр теперь прямо сообщает, требуется ли определить общую популяцию или конкретную клетку. В карточке «Нейтрофилы всего» добавлено объяснение, что п/я и с/я считаются вместе, а также краткое правило различения палочкоядерной и сегментоядерной формы. Ответ «сегментоядерные»/«палочкоядерные» не засчитывается как «нейтрофилы всего».


### ✅ 2026-10-08 — single-cell only для практической карточки

Тренажёр теперь выдаёт только карточки, где студент действительно должен сам определить конкретную клетку. Общие мазки, требующие определения популяции «нейтрофилы всего», убраны из рабочего режима. До ответа название клетки нигде не раскрывается.


### ✅ 2026-10-08 — возврат к предыдущим ответам в лейкоцитарном тренажёре

Теперь студент может возвращаться к уже открытым карточкам. Сохраняются собственные введённые ответы и результат проверки; навигация доступна кнопкой «Предыдущая карточка» и по номерам открытых карточек. При переходе назад карточка не пересоздаётся случайно.


### ✅ 2026-10-08 — расширенная памятка по морфологии клеток крови

В практическую карточку добавлена разворачиваемая подробная подсказка с признаками основных лейкоцитов и тромбоцитов, различением п/я и с/я нейтрофилов и экспресс-алгоритмом опознавания.


### ✅ 2026-10-08 — орфография не влияет на оценку

Проверка текстовых ответов теперь отделена от проверки чисел. Студент может писать `базофил` вместо `базофилы`, использовать другой регистр, дефис/пробел или иметь небольшую опечатку — при сохранённом смысле ответ принимается. Значения нормы и результата исследования по-прежнему проверяются численно.


### ✅ 2026-10-08 — тренажёр «Нормы крови»

**Статус: готово в `main`.**

Добавлен отдельный практический тренажёр заполнения возрастной таблицы лейкоцитарной формулы из `4.Кровь.docx`. Студент самостоятельно вписывает все 35 значений, после чего получает самопроверку по каждой ячейке и общий процент правильных ответов. Формат чисел нормализуется без изменения самой нормы: запятая/точка, тип тире и необязательный знак приблизительности не влияют на проверку.


### ✅ 2026-10-08 — тренажёр «Ответ по смыслу»

**Статус: готово в `main`.**

Добавлен свободный текстовый тренажёр по материалу `4.Кровь.docx`. Студент отвечает без вариантов, затем получает смысловую самопроверку по ключевым идеям, подсказку о пропущенных элементах и эталонный ответ. Проверка не зависит от орфографии и дословной формулировки.


### ✅ 2026-10-08 — фото-препараты крови

**Статус: готово в `main`.**

Добавлен тренажёр **«Препараты крови»** с реальными фотографиями из существующего контента. Он связывает изображение с морфологией, функцией и алгоритмом определения: сначала самостоятельный ответ, затем разбор и самопроверка. Для сравнительных фотографий явно указано, какие клетки на них сопоставляются.


## 2026-10-08 — blood sources + SpaceWeb textbooks integration
- BloodPreparationTrainer.tsx теперь использует реальные trainer-фото через защищённый API/ImageLightbox, а не прямые frontend-пути к изображениям.
- В карточках препаратов добавлены источник, ориентир «куда смотреть», пошаговый алгоритм определения, морфология, функция и признаки для дифференциации.
- Карточки опираются на 4.Кровь.docx и дополнительную учебную памятку; сравнительные фото остаются именно сравнительными.
- Для SpaceWeb добавлен защищённый каталог PDF: content/histology/source-materials/Учебники/.
- Frontend раздела «Материалы» автоматически показывает PDF из «Учебники» с сохранением исходных имён файлов; запись в Supabase для самого PDF не требуется.
- Доступ к книгам ограничен авторизацией и специальностью МБХ; путь к файлу проверяется на traversal и выдаётся inline как PDF.
- Точная проверка конкретных atlas-файлов не подменена догадкой: в предоставленных архивах отдельные atlas-картинки с таким именем не обнаружены, поэтому в тренажёр не добавлены выдуманные «atlas» источники.


## 2026-10-09 — admin database console / external SQL connections
- Добавлена защищённая админская консоль /admin/database.
- Основная БД Supabase отображается как встроенное подключение; её server-side реквизиты не выдаются браузеру для редактирования.
- Добавлены профили SpaceWeb: PostgreSQL pg4.sweb.ru:5433, БД ryazansev3, пользователь ryazansev3; MySQL 8 127.0.0.1:3308, БД ryazansev3, пользователь ryazansev3.
- Из сайта доступны настройка подключения, проверка соединения, просмотр таблиц и схем, чтение/поиск строк, вставка, изменение и удаление строк, а также SQL editor.
- Изменяющие SQL-операции требуют явного подтверждения; разрешён один SQL-оператор за запуск; опасные операции чтения файлов/выгрузки запрещены.
- Пароли внешних БД не показываются обратно и хранятся на backend только в зашифрованном виде.
- В Supabase создана отдельная public.admin_db_connections; RLS включён, прямой доступ anon/authenticated закрыт.
- Реальные подключения SpaceWeb пока не тестировались без пароля: профили заполнены по предоставленным реквизитам, поле пароля остаётся пустым до ввода секрета администратором.


## 2026-10-09 — общая отработка по гистологии

**Статус: 🟡 частично выполнено.** В Supabase сохранены 33 записи на 09.10.2026–29.01.2027: понедельник 16:30–18:00 и пятница 15:30–16:00. Фактически обновлено только активное расписание МБХ-201 (semester 3; schedule ID 4cc2d535-4da4-43fa-93f7-bcb3cff471d4). Запрос пользователя — для всех групп первого семестра. Охват других групп и отображение на сайте пока не подтверждены; задача остаётся IN PROGRESS. Отдельно сверить смысл «первого семестра» с выбранным semester 3 до распространения записей. Подробности: docs/HISTOLOGY-MAKEUP-SCHEDULE-2026-10-09.md.


## Pass 41 — функциональная сверка 2026-10-09

- 🔴 P1: trainer `question.options[].correct` доступен в опубликованных карточках через текущие API/публичную SELECT policy. Требуется полный fix across Supabase Data API, PHP, Next fallback и training snapshots; не скрывать только UI.
- 🔴 CI: GitHub Actions повторно закончил до первого шага (`runner_id=0`, `steps=[]`, нет логов). TypeScript/build/PHP checks остаются неподтверждёнными, а не «упавшими на тестах».
- 🟡 Admin Database Console: исправлены два PHP syntax дефекта в `fb4eed97`; runtime smoke ожидает восстановления CI/target access.
- 🟡 Media/source: 28 EM paths требуют сопоставления с физическими файлами; физическое наличие не выводить из DB metadata.
- 🟡 Вопросы/лекции: duplicate/blank-answer candidates и два источника лекций требуют сверки с методичками; массовое удаление/публикация запрещены без content comparison.
- 🔴 AI Tutor остаётся заблокированным до проверки работоспособного провайдера в целевой среде.

Подробности, ссылки на code/CI и последовательность работ: [FUNCTIONAL-AUDIT-2026-10-09-PASS41.md](docs/FUNCTIONAL-AUDIT-2026-10-09-PASS41.md).


## Pass 42 — trainer answer-key mitigation (2026-10-09)

- 🟢 Live Supabase Data API: base trainer_feed_cards is no longer readable by anon/authenticated; trainer_feed_cards_public exposes only sanitized published cards.
- 🟢 Verified using an active MBH membership context: 206 cards visible; 0 correctness flags and 0 answer-bearing fields in the safe view.
- 🟢 Direct client privileges on trainer_feed_answers, trainings and training_answers revoked; submit_trainer_feed_answer RPC added for authenticated server-side scoring.
- 🟢 PHP response boundary and Next.js proxy sanitize newly created/unanswered training snapshots while preserving review data after a question is answered or skipped.
- 🟡 End-to-end flow is not yet accepted: GitHub Actions runner has not run steps; verify latest Vercel frontend and SpaceWeb PHP deployments, then test feed → training → answer → review → complete.
- 🟡 Media, duplicate question review, lecture source reconciliation and AI provider runtime checks remain open.

Details: [SECURITY-FIX-2026-10-09-PASS42.md](docs/SECURITY-FIX-2026-10-09-PASS42.md).


## Pass 43 — API reliability (2026-10-09)

- 🟢 Source: API timeout now combines internal timeout and caller abort; stale cache fallback is marked with stale=true.
- 🟡 Production: latest observed Vercel READY deployment predates commit 77b0f4a1, so this fix is not yet confirmed live.
- 🔴 CI runner: latest code-check jobs still terminate before checkout (runner_id=0, steps=[]).

Details: [RELIABILITY-FIX-2026-10-09-PASS43.md](docs/RELIABILITY-FIX-2026-10-09-PASS43.md).
