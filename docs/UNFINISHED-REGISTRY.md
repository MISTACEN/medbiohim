# MEDBIOHIM — реестр незавершённого, скрытых недоделок и legacy

Дата: 2026-10-04

Этот файл отражает текущее состояние после глубокого повторного аудита. Старые пункты, которые уже исправлены, явно помечены как CLOSED.

## Закрытые ранее найденные блокеры

| ID | Объект | Проблема | Статус |
|---|---|---|---|
| C-01 | HistologyTrainer.tsx | literal \\n ломал predeploy check | ✅ CLOSED |
| C-02 | frontend API | активные /api-compat/* вызовы | ✅ CLOSED |
| C-03 | Homework | production mock fallback | ✅ CLOSED |
| C-04 | Test bank → preparation | sequential flow не совпадал | ✅ CLOSED |
| C-05 | Preparation | structured options не поддерживались корректно | ✅ CLOSED |
| C-06 | Admin schedule | save через retired compat layer | ✅ CLOSED |
| C-07 | frontend shadow tree | frontend/ | ✅ REMOVED |
| C-08 | SpaceWeb shadow tree | spaceweb_upload/ | ✅ REMOVED |
| C-09 | dead mock data | src/lib/mock-data.ts | ✅ REMOVED |
| C-10 | dead UI | Sparkline.tsx | ✅ REMOVED |
| C-11 | chemistry fixture | chemistry/fixtures.ts | ✅ REMOVED |
| C-12 | legacy QuestionBank | JSON-backed QuestionBank.php | ✅ REMOVED |
| C-13 | admin question fallback | local JSON fallback | ✅ REMOVED |
| C-14 | fake empty admin overview | zero-count success on DB failure | ✅ FIXED |
| C-15 | progress fake numeric cards | degraded state could look like real zeros | ✅ UI hides numeric cards in degraded state |
| C-16 | Search → study plans | backend supported plan search but UI did not expose filter | ✅ FIXED |
| C-17 | subject hub filtering | tests/tickets/lectures could leak other subjects | ✅ FIXED |
| C-18 | subject progress | progress request was global | ✅ FIXED |
| C-19 | SRS | service/table/client/UI traces existed without complete storage | ✅ FIXED |
| C-20 | Search | backend service referenced but absent | ✅ FIXED |
| C-21 | Calculators | backend service referenced but absent | ✅ FIXED |
| C-22 | Presence | backend capability without persistent DB source | ✅ FIXED |

## Current remaining work

### R1 — production environment verification
Severity: P1

Code and CI are now substantially cleaner, but target-environment verification remains:
- Vercel latest deployment after latest commits;
- SpaceWeb latest backend deployment after latest backend commits;
- histology media physically present on SpaceWeb;
- trainer feed images return 200 rather than 404/502.

### R2 — AI provider availability
Severity: P1 / external dependency

Code chain exists, but actual provider availability depends on production credentials/network:
- GigaChat primary/fallback still needs verified runtime;
- Gemini requires the intended Vercel proxy path for RU-hosted backend;
- Mistral/OpenRouter/Groq may reject credentials/policy.

Это нельзя честно решить добавлением mock-провайдеров или fake responses.

### R3 — general document viewer
Severity: P2

Histology has a real in-site DOCX/image materials viewer. The generic /materials page still mainly renders converted content_html and external source links. The generic source metadata page exists but is currently not a primary navigation target.

Next action: route all supported document formats through the material viewer or explicitly mark generic viewer scope. Do not fake full-fidelity Word rendering where the backend has no physical document.

### R4 — admin CMS completeness
Severity: P2

Core admin editing is present, but full CMS still needs:
- material metadata editing;
- trainer card editing;
- lecture/body media editing beyond existing lecture CRUD;
- history/rollback UI for content versions;
- bulk validation operations.

These are feature-completion tasks, not hidden mocks.

### R5 — route consolidation
Severity: P2

Legacy/shadowed route handlers still coexist in several files:
- domain.php + domain_rest.php;
- admin.php + admin_rest.php;
- platform.php + dedicated REST routes;
- community_rest.php + platform.php;
- progress_rest.php + platform.php.

Они не являются заглушками, но duplicate registrations increase maintenance risk.

### R6 — learning_sessions generic layer
Severity: P2 / DEFERRED

learning_sessions has real DB rows and /sessions API, but current learning UI uses dedicated training/preparation endpoints. No active frontend consumer was found for generic session CRUD.

Keep for now; remove only after confirming no external/legacy deployment depends on it.

### R7 — content coverage is not a UI bug
Severity: P2 / content

Supabase has many intentionally empty activity/content tables:
- homework submissions;
- community posts;
- favorites/notes;
- SRS cards until users create them;
- AI messages until chat is used;
- Telegram tables;
- question reports;
- user subject/topic progress.

These are not to be filled with demo rows. They are expected to be zero for an unused feature.

## Current quality gates

- ✅ no active /api-compat calls in frontend;
- ✅ homework runtime is API-only;
- ✅ frontend literal escaped-newline check passes;
- ✅ Next production build passes;
- ✅ PHP syntax passes;
- ✅ smoke workflow passes;
- ✅ dead shadow trees removed;
- 🟡 latest code-check after newest UI commit is still running;
- 🟡 target SpaceWeb media verification remains;
- 🟡 AI runtime provider verification remains.

## Definition of done for the remaining items

A remaining item can be marked ✅ only after:
1. implementation exists;
2. CI passes;
3. target environment responds correctly;
4. UI path is reachable from normal navigation;
5. no mock/demo data is used as production source-of-truth.

## Deep audit 3 closure — 2026-10-04

| ID | Finding | Result |
|---|---|---|
| D3-01 | shadowed domain route removal temporarily left malformed closure | ✅ fixed; backend PHP syntax green |
| D3-02 | legacy /admin/lectures/assist referenced missing service method and had no UI consumer | ✅ removed |
| D3-03 | legacy schedule PUT/local write routes | ✅ removed |
| D3-04 | duplicate admin schedule import route | ✅ removed |
| D3-05 | generic session frontend helpers had no current UI consumer | ✅ removed from frontend API |
| D3-06 | admin/settings query-param hook risk | ✅ replaced with client effect |
| D3-07 | admin content validator treated open ticket questions with empty answer as defects | ✅ validator corrected |
| D3-08 | Supabase published tests/test_questions/materials/trainer cards integrity | ✅ live check found no orphan test links, missing material files, or missing trainer image paths |
| D3-09 | generic material page showed no inline file preview | ✅ PDF/image inline preview added; other formats keep original-file action |
| D3-10 | mobile schedule default remained desktop grid | ✅ small screens now default to day/agenda view |

### Remaining external/product items

- Vercel production is behind current main and needs a successful deployment.
- SpaceWeb needs one final successful deploy run after code stabilizes.
- Histology media needs real target-environment B2/SpaceWeb smoke test.
- AI provider availability depends on runtime credentials/network.
- Dedicated polished editors and full visual version history remain product polish.


## Pass 38 — parallel cross-layer audit 2026-10-07

### U-38-01 — question-bank reconciliation
Severity: P1 / data integrity

Live schema currently reports 855 questions and 854 test_questions rows. Existing audit evidence indicates roughly 195 published/active question rows may be intentionally standalone or not linked to tests. This must be reconciled by category before any cleanup: standalone practice, archived/unpublished, ticket-bank content, intentionally unlinked, or accidental orphan. Do not auto-delete or relink.

### U-38-02 — exam_questions reconciliation
Severity: P1 / content integrity

Live schema reports 876 exam_questions. The count alone does not prove correct subject/topic/ticket coverage. Full reconciliation against Histology curriculum and the protected ticket banks remains unverified.

### U-38-03 — route shadow cleanup
Severity: P2

Source search confirms canonical REST files still coexist with legacy aggregate route files. No immediate functional regression was proven from source search; consolidation remains a maintenance-risk item.

### U-38-04 — unverified checks separated

Created docs/UNVERIFIED-CHECKS-2026-10-07.md. All checks requiring target runtime, browser/device, physical storage, provider credentials, or blocked aggregate SQL verification are kept there and must not be marked DONE from source inspection alone.

 
## U-2026-10-08 — Histology Lecture 05 learning UX release gate

Severity: P1 / runtime verification

Implemented:
- 6 database-backed inline mini-tests;
- canonical trainer photo ↔ text cards without manual caption duplication;
- contextual visual checkpoints instead of end-of-lecture photo wall;
- Atlas viewport-centered image lightbox with zoom/fullscreen fallback.

Still unverified:
- Vercel READY build after latest frontend commits;
- SpaceWeb deployment of `/questions/mini-quiz` and `/questions/mini-quiz/check`;
- authenticated iPhone Safari smoke;
- cross-page regression for other lectures/subjects;
- exact production media availability through SpaceWeb.

Do not mark this registry item closed from GitHub/Supabase code state alone.


## U-2026-10-08-02 — Явные кнопки ImageLightbox

Severity: P1 / runtime verification

Implemented:
- явная кнопка «Открыть на весь экран» на превью изображения;
- отдельные controls «Уменьшить / Увеличить / Сбросить / Полный экран / Закрыть»;
- fixed viewport modal и fallback для Safari без гарантии нативного Fullscreen API;
- масштаб до 300%.

Code commit: 7735ff1ccdc21b509ca6e61bb8267d81a3a1a4bf.

Still unverified:
- Vercel READY после этого commit;
- реальный iPhone Safari smoke;
- проверка всех atlas/trainer image entry points после deployment.

Не закрывать этот пункт только по состоянию GitHub: требуется target-runtime проверка.


## U-2026-10-08-03 — Atlas / Unified Media Viewer desktop + mobile correction

Severity: P1 / cross-platform UX

### Найдено
- Atlas использовал архитектуру card → legacy modal → ImageBox → ImageLightbox.
- Legacy modal ограничивал контент max-h-[90vh] и overflow-auto, поэтому изображение требовало прокрутки и не занимало viewport.
- Controls ImageLightbox находились только во втором уровне и фактически были недоступны пользователю в первом Atlas сценарии.
- Это не iPhone-only defect: та же архитектура воспроизводима на Windows/desktop.

### Исправлено в ветке fix/unified-media-viewer-desktop-mobile
- unified ImageLightbox: 100dvh, safe-area, явные controls, zoom до 500%, reset, close;
- desktop wheel + double-click + drag/pan;
- Pointer Events для touch/pinch;
- native Fullscreen API только как enhancement/fallback;
- Atlas direct entry через TrainerImageViewer, без внешнего scroll-modal;
- metadata/captions/material link перенесены внутрь unified viewer.

### Ещё не закрыто
- Vercel READY для этой ветки;
- SpaceWeb/API runtime media delivery;
- реальный Windows Chrome/Edge/Firefox/Yandex smoke;
- macOS Safari/Chrome smoke;
- iPhone Safari smoke;
- Android Chrome touch smoke;
- Lecture/Trainer/Materials cross-page regression;
- Materials photo/document modal architecture audit.

Не переводить в CLOSED/DONE до полного release gate.


## U-2026-10-08-04 — Viewer regression cleanup

В рамках Unified Media Viewer дополнительно найдено и исправлено:
- literal escaped `\\n` в `HistologyTrainerParts.tsx`, который мог ломать TSX parsing;
- unreachable legacy photo rendering внутри нового Materials document modal;
- отдельный `<img>` для image-file preview в Materials заменён на `ImageLightbox`;
- photo loading в Materials получил retry;
- blob/object URLs для document/PDF/image preview переведены на управляемый lifecycle.

Статус: исправлено в ветке `fix/unified-media-viewer-desktop-mobile`; runtime/build gate остаётся открытым.

## U-2026-10-08-05 — iPhone viewport / stacking regression found from runtime screenshot

Severity: P1 / mobile viewport

### Подтверждено по iPhone Safari screenshot
- viewer controls are present, but the viewer is physically constrained to the app content area;
- the fixed overlay does not cover the full device viewport;
- the mobile bottom navigation remains above the viewer;
- the image therefore appears too high/inside a shortened viewer instead of being centered in the full visible viewport;
- this proves that `fixed + z-index` inside the existing React tree is not sufficient for this app/runtime combination.

### Исправлено в ветке fix/unified-media-viewer-desktop-mobile
- `ImageLightbox` now renders the open viewer through `createPortal(..., document.body)`;
- viewer gets an explicit viewport-level z-index and `100vw` / visualViewport height;
- glass overlay/card colors are explicit inline RGBA values so the existing theme overrides cannot turn the viewer into an unintended dark surface;
- page scroll lock no longer re-runs on every zoom change;
- keyboard zoom uses a ref to avoid recreating the scroll-lock effect during zoom.

Code commit: `6655e65c94072fa91bc3b96c65745865698cd95f`.

### Release gate
Still required:
- deploy this exact commit;
- iPhone Safari: full-width/full-height viewer, image centered between header/footer, bottom navigation fully covered, no page scroll;
- pinch/pan/zoom/reset/fullscreen/close;
- desktop and Android regression;
- Lecture → Atlas → Trainer → Materials regression.

Do not mark this item DONE from source inspection alone.


2026-10-08 — additional launch blocker audit: found and fixed a literal `\\nuse` syntax artifact in `backend/config/routes/questions_rest.php` on the active viewer branch. This was a real PHP syntax blocker that could prevent the backend route set from loading. Commit: `b374a49fd03574806595064746d09c046a19778e`. The companion `HistologyTrainerParts.tsx` literal-newline issue is already clean on this branch. GitHub Actions currently fails before any job step/log is produced, so target syntax/build verification remains external/infrastructure-blocked.

