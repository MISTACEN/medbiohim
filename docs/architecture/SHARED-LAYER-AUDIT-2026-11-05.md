# Аудит общего слоя MEDBIOHIM (2026-11-05)

> Снимок состояния репозитория на `main` = `8524a1f1` (`docs: document target modular architecture`), рабочая копия чистая.
> Метод: только чтение кода, SQL-файлов и документации. Приложение не запускалось, SQL и миграции не выполнялись, production-БД и деплой не проверялись.
> Назначение: определить, какие существующие компоненты можно переиспользовать как общий слой (`shared`), что нужно выделить, а что должно остаться в модулях.

## 1. Главный вывод

Общий слой в MEDBIOHIM **уже существует частично**, но фрагментарно и без реестра:

- есть готовые домен-нейтральные UI-примитивы и общий API-клиент;
- есть единая образовательная модель и детерминированная проверка ответов, которые почти не используются продуктом;
- канон типа вопроса и проверки существует только на сервере;
- рендеринг вариантов ответа, проверка ответов, учебные блоки и навигация продублированы в десятках мест;
- реестра компонентов (идентификатор, версия, совместимые модули, права, статус) нет ни в коде, ни в БД.

Поэтому задача — не «создать библиотеку с нуля», а **собрать существующее в один слой, устранить дубли и зарегистрировать компоненты**, не перенося файлы массово.

## 2. Что уже можно переиспользовать как есть

| Область | Что найдено | Вердикт | Обоснование |
|---|---|---|---|
| UI-примитивы | 10 компонентов в `src/components/ui` (Skeleton, EmptyState, ErrorState, ConfirmDialog, Field, ServiceNoticeBanner, LoadingBar, GlobalLoadingBar, RadialProgress, Confetti) | переиспользовать как есть | Ни один файл не импортирует `@/` — примитивы уже домен-нейтральны; `Skeleton` используется в ~20 файлах |
| Медиа | `src/components/media/ImageLightbox.tsx` (зум, пан, пинч, портал, 8 потребителей) | переиспользовать как есть | Нет импортов `@/`, портал и `aria-modal` реализованы |
| API-клиент | `src/lib/api/**` (20 файлов) + `src/lib/endpoints.ts` | переиспользовать как есть | Единственный согласованный транспорт; `endpoints.ts` — фактический реестр путей с guarded-тестом `test/endpoints-registry.test.mjs` |
| Общие типы | `src/types/**`, `src/lib/learning/types.ts` | переиспользовать как есть | `ActivityType` (12 типов) и `ACTIVITY_TYPE_LABELS` уже описаны, но экранами не используются |
| Серверный канон вопроса | `integrations/cloudflare-api/src/question-format.js`: `normalizeQuestion`, `publicOptions`, `gradeClosedAnswer`, `gradeOpenAnswer`, реестр `questionFormatTypes` | переиспользовать как есть | Импортируется Worker'ом (`routes/tests.ts`, `routes/questions.ts`) и `planner.js`; на фронтенде аналога нет |
| Реестр эндпоинтов как прецедент | `src/lib/endpoints.ts` + `test/endpoints-registry.test.mjs` | переиспользовать как образец | Показывает, как в проекте уже делается «реестр + тест-страж» |
| Общие хуки | `src/hooks/useApiRequest.ts` (+ тест) | переиспользовать как есть | Отменяемая загрузка данных, доменной логики нет |

## 3. Что нужно вынести в общую библиотеку

| Элемент библиотеки | Что это даст | Где сейчас дублируется |
|---|---|---|
| **Реестр типов вопросов + нормализация** | один контракт `Question`, один разбор `options/answer` для всех экранов | 5 несвязанных словарей типов (`ActivityType`, `OPEN_TYPES/CLOSED_TYPES`, `questionTypeLabel`, `MyBankQuestion.kind`, физиология); `questions.type` — свободный текст, ~10 написаний в `src/app/practice/page.tsx` |
| **Единая проверка ответа** | один детерминированный grader вместо восьми | `src/lib/learning/grading.ts` (9 типов, фактически не используется — только `SimulationRunner`), `openAnswerCheck.ts`, `chemistry/practice.ts`, `physiologyContent.ts`, 3 Blood-тренажёра, `HistologyQuestionCard`, серверные `gradeClosedAnswer`/`gradePreparationAnswer` |
| **Единый open-text grader** | одни правила по ключевым пунктам и порогу | две несовместимые модели: `OpenCriterion.any` (`grading.ts`) и `SelfWorkKeyPoint.anyOf` (`selfWorkTypes.ts`), пороги 0.6 и 0.7 |
| **Рендер варианта ответа и панель результата** | единый вид выбора/проверки | минимум 9 независимых мест рендера вариантов; `CheckResultPanel` дословно дважды (`ExamModePanel` = `OpenAnswerPractice`) |
| **Реестр учебных блоков** | один список блоков с параметрами и версиями | `BlockKind` (9 видов) — локально в `RichLectureEditor.tsx:29`; `LectureRenderer` знает 12 fenced-видов; `MaterialConstructor` — свои 7 блоков |
| **UI-примитивы уровня формы** | единые Button/Modal/Badge/Tabs/Toast + баррель | кнопки только CSS-классами (`.btn-primary` — 133 вызова), модалка собирается вручную 24 раза, классы поля ввода скопированы ~71 раз |
| **`DataTable`** | одна таблица для всех админ-разделов | лежит в `src/components/admin/DataTable.tsx`, но полностью props-driven — доступен только админке |
| **Медиа/тема/PDF-адаптер** | переиспользование вне модулей | `PdfReader` жёстко зашит на `/api/v1/materials/:id/file`; `ThemeProvider` тянет профильные настройки |
| **Реестр компонентов (данные)** | идентификатор, версия, параметры, совместимые модули, права, статус | отсутствует; ближайшие аналоги — `content_versions`, `workshop_item_versions`, `chemistry_master_documents.version`, `labs.lab_templates` |

## 4. Что должно остаться в модулях

- попытки, сессии, таймер и автофиниш (`tests/preparation`), шкалы оценивания (3/4/5, 90/75/60, 100/0);
- прогресс, SRS, история обучения;
- предметно-специфичные тренажёры (Blood*, лейкоцитарная формула, MatchingTrainer, атлас);
- CRUD банка вопросов, права и модерация, публикация через Workshop;
- `app-shell` (Sidebar/MobileNav/TopBar/Breadcrumbs) с маршрутами и подписями;
- собственно реестр тем/планов (`lib/learning/modules.ts`) как доменная данных-модель.

Важно: **общая карточка вопроса — это компонент отображения и проверки, а не запись банка вопросов**; она не создаёт попытку и не смешивает банки разных предметов.

## 5. Дубли и нарушения независимости

1. **Маршруты**: 41 сегмент `src/app`, 81 `page.tsx`, 11 `layout.tsx`, 12 `route.ts`. 12 Next-роутов живут вне канонического `/api/v1` (5 university, 3 auth, 2 chemistry, ai/gemini), два из них реально используются фронтом.
2. **Дубли функциональности**: `homework` ↔ `assignments` (одна API-семья + третий CRUD в `schedule/page.tsx`); `labs` (287 строк) ↔ `labs/simulations` (874 строки); `university/import` ↔ `admin/content-import`; `academic`/`curriculum`/`progress`; `chem` ↔ `chemistry`; `test-questions`/`questions`/`problems`/`tickets`.
3. **Смешанные файлы**: `src/app/subjects/[id]/page.tsx` — 1084 строки и 36 импортов, 20 компонентных модулей (Тесты, Лекции, Тренажёры, Аттестации, Химия, Физиология, Лаборатории, Портуалы, Университет) — главный блокер границ; ещё 5 страниц по 500–1200 строк содержат бизнес-логику.
4. **Модуль → модуль (нарушение независимости)**: `lectures → chemistry|media|trainers`, `trainers → lectures|media`, `workshop → editor|lectures`, `portals → lectures|chemistry`, `subjects/questions/attestations → chemistry`, `chem → subjects`, `editor → lectures`.
5. **Цикл в общем слое**: `src/lib/learning/modules.ts` → `@/lib/sim/catalog`, а `src/lib/sim/types.ts` → `@/lib/learning/types`.
6. **`src/components/chemistry` — де-факто общий слой рендеринга**: `ChemRichText` импортируют 5 модулей; сам модуль это признаёт в `index.ts`.
7. **Стили**: `globals.css` (962 строки) смешивает токены 7 тем, компонентный слой и CSS модулей (`.schedule-*`, `.lecture-*`, `.test-*`, `.histology-*`); при этом 347 `dark:` и 2031 `slate-*`/`indigo-*` живут в разметке, а токен-классы почти не используются.
8. **Навигация**: маршруты и подписи продублированы в 4 местах (`Sidebar`, `MobileNav`, `Breadcrumbs`, `TopBar`).

## 6. Данные: готовность к единому объекту и реестру

1. Иерархия `subjects → modules → topics` декларативно есть, и `tests`/`questions`/`materials` имеют `module_id`/`topic_id` (`database/migrations/20261026000000_add_test_curriculum_map_view.sql`, код `workers/api/src/routes/subjects.ts`).
2. DDL ядра в репозитории отсутствует: `subjects`, `modules`, `topics`, `materials`, `test_questions`, `exam_questions`, `ticket_banks`, `trainer_feed_cards` только alter/insert/view. Baseline `002_tests_homework.sql` описывает `questions(body, answer_key)`, а рабочий код использует `text, answer, options, type, module_id, is_published` — этих колонок в миграциях нет. **Репозиторий не является зеркалом применённой схемы.**
3. Единого учебного объекта нет: 5 хранилищ вопросов (`questions`, `exam_questions`, `trainer_feed_cards`, `workshop_item_questions`, `chemical_questions`) плюс JSON-бак `site_content` (лекции, планы, личные вопросы, аттестации). `exam_questions` — 884 строки против 875 в `questions` (`database/SUPABASE_SYNC.md`).
4. Лекции дублируются: `site_content:lectures` ↔ `histology_lectures`, у второй нет `topic_id` — привязка лежит внутри JSON.
5. Связи заданы тремя способами: FK (`topic_id`), «плановые» FK (`plan_module_id`/`plan_topic_id`), строки и свободный текст (`subject_slug`, `exam_questions.topic`).
6. Формат вопроса не унифицирован: `options` существует в 4 формах (признано в `20261027090000_normalize_closed_question_options.sql`), `type` — свободный текст с тремя словарями; `ActivityType` в БД не хранится.
7. Прогресс дублируется: `topic_progress` ↔ `user_topic_progress`, плюс `progress_ledger`, `student_academic_states`, локальные `localStorage`.
8. `subjects.slug` не уникален (дубли `biology`×2, `chemistry_organic_physical`×3, `physiology`×3, `histology`×2); RLS на `site_content` разрешает студенту читать любой ключ.

**Итог:** (а) иерархия — частично готова; (б) единый объект без дублирования — не готов; (в) реестр компонентов с версиями — не готов, нужна отдельная сущность и контракт.

## 7. Документация: что уже заявлено и где противоречия

1. `docs/architecture/MODULE_ARCHITECTURE.md` уже содержит §«Общие платформенные компоненты» и целевую папку `src/shared/{api,auth,ui,lib,types}` — но в ней нет учебных блоков, типов вопросов, редакторов, реестра компонентов.
2. Состав `src/shared/` расходится: документ кладёт туда `api/auth`, предложение — выносит их в ядро и добавляет учебные блоки.
3. «Предметы» в документе — верхний уровень, а в предложении были перечислены среди модулей; нужен один вариант (в этом аудите и в `MODULE_ARCHITECTURE.md` предметы — отдельный уровень `Subjects`).
4. `AGENT-OWNERSHIP.md` не содержит `src/shared/**`, `src/modules/**` и файла реестра — у нового слоя нет владельца.
5. «Права на компонент» и «версия компонента» пересекаются с `user_roles` как единственным источником прав и с `content_versions` как существующей системой версий — нельзя заводить вторые.
6. `MODULE_ARCHITECTURE.md` не проиндексирован в `docs/README.md`; `docs/QUESTION-BANK-ARCHITECTURE.md` устарел (2026-10-07) и не знает 9 типов проверки и конвертации Workshop.
7. `ROADMAP.md` откладывает UI-унификацию до стабилизации функциональности — это ограничивает темп работ по дизайн-системе.

## 8. Предлагаемый порядок выделения (без массового переноса)

- **Шаг A. Реестр как данные.** Выполнен 2026-11-05: контракт — [SHARED-COMPONENT-REGISTRY.md](SHARED-COMPONENT-REGISTRY.md), данные — [`registry/components.json`](registry/components.json), проверка — `test/component-registry.test.mjs`. Файлы компонентов не переносились.
- **Шаг B. Типы вопросов.** Выполнен 2026-11-05 в объёме модели: `src/lib/question-types/` (реестр типов, нормализация серверного payload, единая проверка), паритет с `question-format.js` закреплён тестами, первый потребитель подписей — банк вопросов `practice`. Переключение `tests/preparation` на общий рендер и проверку — следующий проход, после регрессии экрана.
- **Шаг C. Рендер варианта и панель результата.** Выполнен 2026-11-05 для экранов прохождения: `CheckResultPanel` заменил две дословные копии, `AnswerOption` (формы `button`/`choice`/`row`) переведён в подготовке, практике, билетах, банке, карточке тренажёра, мини-тесте лекции и тесте физиологии. 477 unit-тестов и 22 компонентных теста лекций проходят. Отдельные раскладки (`SubjectQuestionBank`, лента тренажёров, редакторы, порталы, `labs`, Colloquium) остаются на отдельный проход.
- **Шаг D. UI-примитивы.** Выполнен 2026-11-05: баррель `src/components/ui/index.ts`, `Button`/`Modal`/`Badge`/`Tabs` и перенос `DataTable` из `admin/` в общий слой. Старые импорты таблицы переведены на общий слой, переходная обёртка удалена. На примитивы уже переведены `useConfirm` (нативных `window.confirm` не осталось), вкладки закладок и химической лаборатории, модалки отчёта об ошибке и трёх админских форм, статус публикации теста. Остальные кнопки, модалки и плашки подключаются постепенно, начиная с новых правок.
- **Шаг E. Учебные блоки.** Собрать реестр из `BlockKind` и fenced-видов `LectureRenderer`, не меняя уже сохранённый markdown лекций.
- **Шаг F. Версионирование.** Делать поверх `content_versions`/`workshop_item_versions`, а не второй системой версий.

На каждом шаге: сборка, типизация, затронутые страницы, роли, RLS-чтение/запись, сохранность существующих данных и URL.

## 9. Что не проверялось

- Состояние production Supabase, применение миграций, реальные RLS-политики и наличие колонок, которых нет в репозитории.
- Запуск `npm run typecheck`, `lint`, `test`, `build`, e2e; рендеринг в браузере и визуальная регрессия.
- Полный DDL ядра, содержимое `content_versions`, `materials`, `site_content`.
- Работа Worker целиком: проверялись только маршруты и места проверки ответов, указанные в отчётах.
- Деплой и production-поведение: наличие файла в `main` не означает, что функция задеплоена.

---

_Отчёт основан на пяти параллельных read-only проходах: документация, UI/дизайн-система, типы вопросов и редакторы, маршруты и границы модулей, данные и связи контента. Подробные выписки с `path:line` лежат во временном рабочем каталоге `.tmp-arch/audit/` и в репозиторий не входят._
