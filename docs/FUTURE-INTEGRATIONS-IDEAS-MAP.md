# MEDBIOHIM — FUTURE INTEGRATIONS & IDEAS MAP

> Единый реестр будущих функций, интеграций, логики и архитектурных направлений.
> Этот документ нужен, чтобы идеи из обсуждений не терялись и не превращались в несвязанные временные задачи.
> Актуализация: 2026-10-09; implementation checkpoint добавлен 2026-10-22.

## Implementation checkpoint — 2026-10-22

- **FESMU public adapter:** реализован `src/app/api/university/route.ts` — 6 факультетов, официальные PDF-расписания, публичные новости/объявления/анонсы, provenance и серверный кэш 30 минут.
- **University Hub:** реализованы `/university` и `/university/import`; официальные ресурсы отделены от внешних платформ, данные показываются со ссылкой на первоисточник и временем получения.
- **MEDBIOHIM Bridge:** расширение обновлено до `0.3.0`; добавлен сбор вопроса, ручная отметка правильных вариантов, набор вопросов, скачивание JSON и переход к preview-импорту. Пароль ЕИОС не сохраняется, авторизация не обходится.
- **Импорт:** JSON проходит нормализацию, dedup, выбор предмета, preview и `dry_run` через существующий `POST /admin/content/import`. По умолчанию материалы не публикуются.
- **Внешние платформы:** NeoFamily и «Школа Сеченова» добавлены как внешние образовательные ресурсы/UX-референсы, без копирования закрытого контента и без выдачи за сервисы ДВГМУ.
- **Не проверено:** production deploy, реальная загрузка расширения в Chrome/Edge, закрытые страницы ЕИОС и полный E2E импорта на production-данных.

## 1. Назначение

MEDBIOHIM не должен зависеть от одного внешнего портала или одного способа интеграции.

Целевая модель:

```
MEDBIOHIM
├─ собственное обучение и контент
├─ AcademicContext
├─ интерактивные тренажёры
├─ тесты / вопросы / билеты
├─ расписание / прогресс / SRS
├─ FESMU public adapters
├─ FESMU EIOS integration
└─ MEDBIOHIM Bridge browser extension
```

Все внешние источники должны быть адаптерами над внутренней моделью MEDBIOHIM, а не заменой этой модели.

---

## 2. Главный принцип интеграций

Целевая цепочка:

```
External source
  ↓
Adapter / Browser Bridge
  ↓
Normalize
  ↓
Validate
  ↓
Deduplicate + version
  ↓
AcademicContext / content model
  ↓
MEDBIOHIM
```

Внутри MEDBIOHIM данные должны быть независимы от того, пришли они из:
- FESMU public;
- EIOS;
- browser extension;
- ручного импорта;
- собственного CMS;
- официального API в будущем.

Если появляется официальный API, он должен заменять только внешний adapter, а не переписывать ядро MEDBIOHIM.

---

# 3. FESMU / ЕИОС — карта интеграции

## 3.1. Официальные публичные источники

Приоритет: GREEN / перспективно.

Возможные направления:
- расписание;
- расписание экзаменов;
- объявления;
- академический календарь;
- аудитории;
- официальные документы;
- ссылки на библиотеку;
- ссылка на ЕИОС;
- другие открытые учебные страницы.

Целевая схема:

```
FESMU public
 → parser/adapter
 → normalized schedule/events
 → Supabase
 → /schedule / exams / university
```

Для импортированных данных хранить provenance:
- source;
- source_url;
- source_version;
- source_hash;
- imported_at;
- external_id;
- last_seen_at.

При повторной синхронизации:
- не создавать дубликаты;
- определять изменённые записи;
- сохранять историю изменения, где это необходимо;
- показывать пользователю изменения расписания.

## 3.2. Двухнедельное расписание

Учитывать официальную модель:
- числитель;
- знаменатель;
- дата;
- неделя семестра;
- пара;
- предмет;
- преподаватель;
- аудитория;
- тип занятия.

Не упрощать источник до обычного weekly schedule.

---

# 4. ЕИОС — безопасная модель

ЕИОС рассматривается как отдельный защищённый контур.

Цель:
- не хранить пароль ЕИОС в MEDBIOHIM;
- не делать серверный login через пользовательский пароль;
- не обходить CAPTCHA, 2FA и другие ограничения;
- не получать закрытые данные способом, не предусмотренным системой;
- использовать только данные, к которым пользователь уже имеет законный доступ;
- учитывать правила университета и права на содержимое.

При наличии официального API/SSO/export:
```
EIOS API/SSO/export → EIOSAdapter → MEDBIOHIM
```

Если официального API нет:
```
Browser session пользователя
       ↓
MEDBIOHIM Bridge
       ↓
явное действие пользователя
       ↓
MEDBIOHIM import/sync
```

Iframe ЕИОС — отдельная экспериментальная возможность. Использовать только если портал технически и политически разрешает embedding.

---

# 5. MEDBIOHIM Bridge — будущий браузерный extension

Статус: **MVP реализован в исходниках (v0.3.0)**; production-проверка и публикация расширения ещё не выполнены.

Это отдельный инструмент, но не отдельная учебная система.

Архитектура:

```
EIOS / FESMU
      ↓
MEDBIOHIM Bridge
      ↓
MEDBIOHIM API
      ↓
Supabase
```

Расширение работает в браузере пользователя, где пользователь уже авторизован в ЕИОС.

## 5.1. Первый этап

- определить текущий портал;
- определить доступную страницу;
- показать найденный тип данных;
- предложить импорт только после действия пользователя;
- перед отправкой показать preview;
- отправить нормализованный пакет в MEDBIOHIM;
- получить результат импорта.

Пример:

```
MEDBIOHIM Bridge
Portal: FESMU EIOS

Найден тест
Гистология
40 вопросов

✓ вопросы
✓ варианты
✓ правильные ответы
✓ изображения: 12

Предмет: Гистология
Тема: Эпителий

[Импортировать в MEDBIOHIM]
```

## 5.2. Импорт тестов

При обнаружении теста расширение пытается извлечь:

- test title;
- subject;
- topic/module;
- question number;
- question text;
- answer options;
- multiple correct options;
- displayed selected answer;
- explicitly displayed correct answer;
- images;
- captions;
- source URL;
- external question/test ID, если он доступен.

Нормализованный объект:

```json
{
  "question": "...",
  "answers": ["...", "..."],
  "correct_answers": ["..."],
  "correct_answer_source": "portal_marked",
  "source_url": "...",
  "external_id": "...",
  "images": []
}
```

Важно: правильный ответ не должен считаться официальным только потому, что его «угадал» AI.

Источники правильного ответа:
- official;
- portal_marked;
- teacher_marked;
- imported;
- manual;
- ai_inferred;
- unknown.

AI-inferred не публикуется автоматически как официальный ответ.

---

# 6. Extraction strategy Bridge

Не использовать только DOM scraping.

Порядок:

### A — DOM
Извлечь:
- видимый текст;
- варианты;
- выбранный ответ;
- явно показанный правильный ответ;
- изображения;
- номера;
- подписи.

### B — browser-rendered data
Если приложение уже загрузило структурированные данные в браузер и их использование разрешено:
- анализировать JSON/state;
- использовать structured data вместо хрупкого HTML;
- сохранять external IDs.

### C — manual confirmation
Если уверенность недостаточна:
- показать найденные данные;
- подсветить сомнительные поля;
- потребовать подтверждение пользователя;
- не импортировать сомнительные correct answers как official.

---

# 7. Защита от дубликатов и повторного импорта

Повторный импорт должен выдавать результат вроде:

```
40 найдено
36 уже существуют
3 новых
1 изменён
```

Для этого использовать:
- external_id;
- source;
- content_hash;
- question_hash;
- test_hash;
- import_batch_id.

Возможные действия:
- оставить существующее;
- обновить;
- создать новую версию;
- импортировать только новые;
- сравнить старое/новое.

Не плодить одинаковые вопросы при каждом открытии расширения.

---

# 8. Импорт изображений и права

Изображения можно импортировать только при допустимом использовании.

Сохранять:
- source_url;
- source_name;
- source_type;
- attribution/license, если доступно;
- original filename;
- imported_at.

Не считать техническую доступность файла разрешением на его дальнейшее распространение.

---

# 9. Другие функции Bridge

После тестов:

### Расписание
- дата;
- номер пары;
- предмет;
- преподаватель;
- аудитория;
- тип;
- числитель/знаменатель;
- изменения.

### Экзамены
- дисциплина;
- дата;
- время;
- аудитория;
- форма;
- источник.

### Результаты
- тест;
- результат;
- дата;
- количество попыток;
- доступные детали.

### Материалы
- название;
- тип;
- source URL;
- доступный файл;
- предмет/тема.

### Объявления
- заголовок;
- дата;
- текст/summary;
- source URL.

### Изменения расписания
- old event;
- new event;
- detected_at;
- source.

---

# 10. Backend import layer

Не создавать отдельную «базу расширения».

Переиспользовать:
- questions;
- tests;
- test_questions;
- exam_questions;
- ticket_banks;
- subjects;
- modules;
- topics;
- content_sources;
- AcademicContext.

При необходимости добавить/расширить import registry:

```
content_imports
- id
- source_type
- source_url
- external_id
- import_batch_id
- content_hash
- imported_at
- imported_by
- status
- validation_result
```

Связь с `content_sources` должна рассматриваться первой, чтобы не создавать параллельную систему provenance без необходимости.

---

# 11. AcademicContext как центральная связка

Внешние данные не должны напрямую управлять UI.

Центральная цепочка:

```
student
 ↓
group
 ↓
specialty
 ↓
course
 ↓
semester
 ↓
academic_year
 ↓
subject
 ↓
module/topic
 ↓
lesson/schedule
```

После определения AcademicContext:

```
schedule
 → nearest lesson
 → lecture/material
 → trainer
 → test
 → homework
 → progress
 → SRS
```

Это позволяет интеграции с FESMU/EIOS работать вместе с собственным контентом MEDBIOHIM.

---

# 12. NeoFamily / интерактивные тренажёры

NeoFamily рассматривается как UX/pedagogical reference, а не как обязательная внешняя зависимость.

MEDBIOHIM должен иметь собственный Interactive Lab.

Приоритетные направления:
- физиология;
- биохимия;
- гистология;
- анатомия;
- фармакология;
- клинические кейсы;
- графики;
- drag-and-drop;
- последовательности процессов;
- распознавание изображений.

Примеры:
- нервно-мышечный синапс;
- потенциал действия;
- сокращение мышцы;
- ЭКГ;
- дыхание;
- гемодинамика;
- нефрон;
- ферментативная кинетика;
- гликолиз;
- цикл Кребса;
- дыхательная цепь;
- кислотно-основное состояние;
- интерактивный микроскоп;
- электронограммы;
- клетка/ткань;
- рецепторы и механизмы лекарств;
- клинические диагностические кейсы.

Цепочка:
```
curriculum
 → subject/module/topic
 → interactive trainer
 → test
 → progress
```

---

# 13. Универсальная архитектура внешних провайдеров

Зарезервировать abstraction layer:

```
UniversityProvider
├─ FESMU
│  ├─ public schedule
│  ├─ exams
│  └─ announcements
│
└─ FESMU EIOS
   ├─ profile
   ├─ grades
   ├─ exams
   └─ progress
```

Дополнительные адаптеры:

```
ScheduleAdapter
TestAdapter
MaterialAdapter
AnnouncementAdapter
ResultsAdapter
```

Bridge использует те же normalized contracts, что и серверные adapters.

---

# 14. Университетский раздел MEDBIOHIM

Зарезервировать будущую область:

**ДВГМУ / Мой университет**

Возможные разделы:
- Расписание;
- Экзамены;
- Объявления;
- Академический календарь;
- Аудитории;
- Документы;
- ЕИОС;
- Библиотека;
- официальный сайт ФЕСМУ.

Важно: это не копия ЕИОС. Это единая точка навигации и интеграции вокруг MEDBIOHIM.

---

# 15. Двусторонняя модель

Будущая цель — не просто «забрать данные».

Направление EIOS/FESMU → MEDBIOHIM:
- расписание;
- экзамены;
- материалы;
- результаты;
- тесты;
- вопросы;
- объявления.

Направление MEDBIOHIM → EIOS:
- только если в будущем появится официально разрешённый API/механизм;
- не строить обратную запись через неофициальный scraping.

До этого MEDBIOHIM остаётся самостоятельной системой.

---

# 16. Аудит интеграций

Каждый новый integration feature проходит:

### Source audit
- источник определён;
- URL сохранён;
- источник доступен пользователю;
- происхождение данных понятно.

### Extraction audit
- DOM/data/manual fallback;
- поля определяются корректно;
- неопределённые поля не подменяются догадкой.

### Validation audit
- обязательные поля;
- типы;
- предмет;
- AcademicContext;
- корректность correct answer provenance.

### Dedup audit
- external ID;
- hashes;
- повторный импорт;
- versioning.

### Security audit
- пароль ЕИОС не хранится;
- токены не логируются;
- CAPTCHA/2FA не обходятся;
- закрытые данные не раскрываются;
- импорт выполняется от имени пользователя и по явному действию.

### Rights audit
- source;
- attribution;
- license/permission;
- допустимость хранения и повторной публикации.

### Runtime audit
- Chrome;
- Firefox;
- Edge;
- Safari, если extension API поддерживается;
- iOS/Android ограничения;
- production API;
- Supabase;
- SpaceWeb.

---

# 17. Roadmap будущих интеграций

## FUTURE-1 — Public FESMU
- расписание;
- экзамены;
- объявления;
- календарь;
- документы.

## FUTURE-2 — University Hub
- «ДВГМУ / Мой университет»;
- ссылки;
- unified navigation;
- AcademicContext.

## FUTURE-3 — MEDBIOHIM Bridge MVP
- определение EIOS/FESMU;
- preview;
- ручной import;
- test extraction;
- question/options import.

## FUTURE-4 — Test intelligence
- correct-answer provenance;
- images;
- dedup;
- version comparison;
- changed/new questions.

## FUTURE-5 — Schedule Bridge
- schedule import;
- exam schedule;
- changes;
- two-week numerator/denominator.

## FUTURE-6 — Materials/announcements
- materials;
- announcements;
- source tracking.

## FUTURE-7 — Results
- test results;
- progress;
- AcademicContext.

## FUTURE-8 — Official API/SSO
Если университет предоставит официальный механизм:
- API adapter;
- SSO;
- official exports;
- замена bridge для соответствующего контура без изменения ядра.

## FUTURE-9 — Interactive Lab
- собственные NeoFamily-like trainers;
- curriculum integration;
- progress;
- SRS.

---

# 18. Что НЕ делать

- не хранить пароль ЕИОС;
- не делать серверный credential scraping;
- не обходить CAPTCHA/2FA;
- не извлекать данные через обход ограничений;
- не считать скрытый ответ официальным без подтверждения;
- не публиковать AI-inferred answer как официальный;
- не создавать отдельную БД только для extension;
- не связывать ядро MEDBIOHIM с конкретной HTML-структурой ЕИОС;
- не делать NeoFamily обязательной runtime dependency;
- не копировать внешний контент без проверки прав;
- не создавать новые Git-ветки без необходимости: интеграционные идеи должны жить в общей карте проекта и попадать в `main` по мере реализации.

---

# 19. Definition of Done для будущей интеграции

Функция считается завершённой только когда:
- архитектура описана;
- source/provenance определён;
- security проверена;
- rights/provenance проверены;
- normalization работает;
- dedup/versioning работает;
- AcademicContext связь работает;
- UI preview/import работает;
- ошибки понятны пользователю;
- production runtime проверен;
- запись добавлена в ROADMAP/PHASES_STATUS;
- аудит не обнаружил скрытого legacy/stub/dead code.

---

# 20. Связь с текущим проектом

Этот документ не заменяет:
- `ROADMAP.md` — порядок текущей реализации;
- `PHASES_STATUS.md` — фактический статус;
- `docs/FULL-AUDIT-*.md` / `docs/DEEP-AUDIT-*.md` — результаты аудитов;
- `docs/UNFINISHED-REGISTRY.md` — незавершённые элементы;
- `docs/API-COVERAGE-*.md` — API coverage.

Он является **реестром будущих направлений и архитектурной памяти проекта**.

Правило обновления:
**любая новая идея, связанная с FESMU/EIOS/Bridge/интерактивными тренажёрами/внешними интеграциями, сначала фиксируется здесь, затем получает конкретную задачу в ROADMAP и только после этого реализуется.**

## Current implementation checkpoint — 2026-10-11

See [STATUS-2026-10-11.md](STATUS-2026-10-11.md) for the latest Telegram single-webhook relay, actual remaining account-linking work, CI runner blocker, and verification order. Do not treat the relay as a complete homework-ingestion workflow until the PHP endpoint and database path are tested.

## Pause checkpoint — 2026-10-11

Current Telegram relay, single-webhook architecture, Mini App limitations, CI blocker, and next steps are recorded in [`UNFINISHED-REGISTRY.md`](UNFINISHED-REGISTRY.md), “Full checkpoint — 2026-10-11”. Keep secure account linking and extension imports open until implemented and tested.

## Hosting resilience plan — 2026-10-11

The detailed proposal is now recorded in [HOSTING-RESILIENCE-AND-FREE-TIERS.md](HOSTING-RESILIENCE-AND-FREE-TIERS.md).

- Preserve Vercel + Supabase + SpaceWeb + B2 as the current primary system.
- Explore Cloudflare Workers as a separate Telegram webhook/relay PoC; do not move production bot until tests, quota verification and rollback are ready.
- Explore an independent foreign secondary origin (Cloudflare Pages or compatible Next.js hosting) so one provider/network path failing does not automatically make the frontend unavailable. First verify Next.js SSR/auth/API compatibility.
- Keep a Russian emergency fallback as a secondary tier, initially read-only/static public learning content with a visible last-updated timestamp and no secrets/private student data.
- Measure the current Vercel → SpaceWeb/API/media latency before moving anything. Hosting migration is not a substitute for profiling.
- FPS.ms daily renewal, sleeping hosts, time-limited deploys, unverified providers and credit-based plans are not accepted as critical production dependencies without an explicit reliability review.
- Provider limits and “no card” claims are provisional until rechecked against official terms at implementation time.

## Product contract clarification — 2026-10-11

The canonical requirements now live in [MEDBIOHIM product intent and integration contract](MEDBIOHIM-PRODUCT-INTENT-AND-INTEGRATION-CONTRACT.md).

- Preserve the approved current website structure; integrate useful capabilities into existing UX.
- Telegram has two core responsibilities: secure registration/login + launch of MEDBIOHIM as a Telegram Web App, and ingestion of group-chat homework/messages/attachments.
- Manual student entry, Telegram extraction and future browser imports feed one canonical homework workflow with group membership checks, provenance, duplicate protection and review for uncertain extraction.
- Browser extension remains a user-controlled import bridge with preview, source tracking and dedup/versioning; do not store EIOS passwords or bypass access controls.
- Imported real questions require provenance; AI-inferred content must be labelled and not silently promoted to official.
- Current implementation: Node bot can optionally relay group/supergroup updates to PHP through a shared-secret HTTPS endpoint, so Telegram should have one webhook destination. End-to-end ingestion, idempotency, group authorization and secure registration/account linking are still unproven/open.
