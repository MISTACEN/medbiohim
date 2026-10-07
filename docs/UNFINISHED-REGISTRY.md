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


## 2026-10-07 — отдельный реестр непроверенного после Pass 37

### U-37-01 — target-runtime media capabilities
Проверить на фактическом SpaceWeb runtime PHP/GD/Imagick/WebP/AVIF через admin capabilities. Наличие кода не считать production-подтверждением.

### U-37-02 — реальный derivative E2E
На реальном B2/Histology изображении проверить processing endpoint, HTTP 200, MIME, размеры, checksum, `file_variants`, физический B2 object и неизменность original.

### U-37-03 — perceptual quality scoring
Текущий quality gate использует безопасные placeholder scores для generated candidates. Реальные text/detail/artifact measurements ещё не реализованы.

### U-37-04 — automatic worker/queue
Сейчас processing ручной. Очередь/worker ещё не подключены; нужен реальный runtime-механизм без fake async.

### U-37-05 — derivative consumption
Проверить Materials, Atlas, Trainer и Homework attachments: derivative при наличии, original fallback, mobile/desktop и основные браузеры.

### U-37-06 — video derivatives
Image processor не закрывает 1080p/720p/480p video pipeline. Нужен отдельный ffmpeg/ffprobe worker и compatibility validation.

### U-37-07 — EXIF/GPS stripping
Требование есть в media policy, но отдельная runtime-проверка результата ещё не выполнена.

### U-37-08 — physical media reconciliation
Полная сверка archive → SpaceWeb/B2 → DB files → file_variants → API → HTTP 200 ещё не завершена. Metadata-only наличие не считать доказательством.

### U-37-09 — regression after merge/deploy
PR #17 пока draft. Нужны CI green, target SpaceWeb smoke и frontend media smoke после стабилизации.
