# План: единый движок практики, свободный ввод с ИИ-проверкой, атлас из «Своих препаратов»

Дата: 2026-11-27. База: `c9fda31b` (+ незакоммиченная чужая правка админки, см. §9).
Документ — рабочий план, а не отчёт о сделанном. Порядок блоков обязателен: B1 → B2 → B3 → B4 → B5 → B6.

## 0. Что уже проверено и на чём стоит план

* Прод-прогон диагностикума: 100 %, 0 %, 50 % в экзамене, таймер 60 с, восстановление серии, электронограммы,
  «Своя серия», статистика, история — результаты в [DIAGNOSTICUM-AUDIT-2026-11-27.md](DIAGNOSTICUM-AUDIT-2026-11-27.md).
* Концепция: `Downloads/по сайту читать` (9 docx) → извлечены в текст; ключевое для нас:
  §7 четыре режима (изучение / повторение / диагностика / экзамен), §10 управление содержимым без кода,
  §11 «не создавать отдельные копии препарата для атласа, карточек и диагностики», §12 «схема оценивания
  свободных ответов и ИИ-проверки согласуется отдельно; ИИ-оценка не считается безошибочной».
* Реестр требований (`MEDBIOHIM_07`): CHEM-06 (свободный/числовой ответ — отдельный интерфейс и способ проверки),
  CHEM-10 (ИИ помогает разбирать, но не заменяет точную проверку), DEC-03 (не выдавать ложную точность ИИ).
* Данные под рукой: `.env.local` (Supabase URL/anon/service, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, B2, прямой `DB_*`),
  `Downloads/препараты бонус` (42 jpg), `Downloads/Гистология` (484 файла, 2.07 ГБ, 65 docx ЭМ),
  `Desktop/вуз` (2294 файла), `docs/PREPARATIONS-BONUS-MAPPING-2026-11-25.md`.
* Субагенты DSH: канал Codex падает на первом же ходе (`product-error`), `tokenrouter` — единственный
  зарегистрированный маршрут, мост моделей сломан (`Cannot find package '@earendil-works/pi-ai'`).
  Вывод: блоки делаю сам, субагентов не закладываю в критический путь.

## 1. Целевая модель (одна фраза)

Один движок попыток (`diagnosticum_*`), один экран практики, одна история и статистика, оси задания вместо
режимов, свободный ввод как переключатель в любом задании, атлас пополняется и админом, и студентом через
одну модерацию.

```
Атлас (trainer_feed_cards)  ──┐
                              ├─► задание (parts: препарат/структуры/утверждения)
Методички (preparation_guides)┘        │
                                       ├─► ответ: варианты | свободный ввод
                                       │        └─► exact → normalize → alias → fuzzy → ИИ → ручная проверка
                                       └─► попытка (diagnosticum_attempts) ─► сессия ─► история ─► статистика
                                                                                 └─► повторение (SRS/ошибки)
```

## 2. Блок B1 — целостность (1 день, без изменения UX)

| # | Задача | Файлы | Критерий |
| --- | --- | --- | --- |
| B1.1 | Непрозрачные id вариантов (`opt_<hash(attempt+part+index)>`), `guide_key` не отдавать до финиша | `workers/api/src/routes/diagnosticum/model-questions.ts`, `sessions.ts`, `session.ts` | `option.id` не равен `guide_key`; в `in_progress` ответ не выводится; разбор после `finish` цел |
| B1.2 | Утверждения: нейтральные id (`s0…s4`) вместо `f*`/`x*` | `model-questions.ts` | ключ в БД, порядок в вопросе перемешан |
| B1.3 | `imageStatic` → origin сайта, а не Worker | `workers/api/src/routes/trainers/03-image.ts` | бонус-снимки 200, «Изображение недоступно» исчезает |
| B1.4 | Очередь ошибок: только карточки с методичкой и без ЭМ | `diagnosticum/session.ts`, `diagnosticum/sessions-model.ts` | «Повторить ошибки» → серия стартует, не 422 |
| B1.5 | Таймер из сессии при восстановлении; гонка resume/start | `DiagnosticumRunner.tsx`, `sessions.ts` | сессия 60 с после reload идёт с 60 с; ответ не уходит в чужую серию |
| B1.6 | Мелочи: «Подсказка 5/4», `hints_total: 4` | `DiagnosticumAnswerActions.tsx`, `sessions.ts` | нет «5/4», константа из `MAX_HINTS` |
| B1.7 | Тесты на всё выше | `src/lib/__tests__/diagnosticum-sessions.test.ts` | серии, финиш, отсутствие ключа в выдаче |

## 3. Блок B2 — единый движок и одна история

### B2.1. Данные (аддитивная миграция `workers/api/migrations/20261128_unify_training_engine.sql`)

* `diagnosticum_attempts`: `+ source text default 'diagnosticum'`, `+ answer_mode text`, `+ grading_source text`,
  `+ legacy_training_id uuid`, `+ input_text jsonb`.
* `diagnosticum_sessions`: `+ source`, `+ parts text[]`, `+ answer_mode`, `+ legacy_training_id`.
* Таблица-мост `training_migration_map(legacy_training_id, session_id, attempt_id)`.
* Индексы под `(user_id, created_at desc)` и `(session_id)`.
* Обратные совместимости: старые строки остаются, `histology_training_*` не удаляем (read-only).
* Rollback-файл рядом.

### B2.2. Worker

| Что | Где | Контракт |
| --- | --- | --- |
| `parts` в старте/серии | `diagnosticum/index.ts`, `sessions.ts`, `model.ts` | `parts: ("preparation"\|"structures"\|"statements"\|"differential")[]`; `mode` остаётся вычисляемым |
| `answer_mode` | те же + `grading.ts` | `"options" \| "input" \| "mixed"` на часть |
| Список серий | новый `diagnosticum/history.ts` | `GET /diagnosticum/sessions?limit=&cursor=` (свои + legacy, флаг `source`) |
| Слияние статистики | `session-stats.ts` | `by_mode` + `source`, отдельно «ранние режимы» |
| Легаси-история | `history.ts` | `histology_training_*` читаются сервис-клиентом, отдаются как `source:"legacy"` |

### B2.3. Клиент

| Что | Где |
| --- | --- |
| Один раннер: «Разбор / Экзамен / Электронограммы / Своя серия» на `diagnosticum` | `DiagnosticumRunner.tsx`, `HistologyTrainer.tsx` |
| «Своя серия» → `POST /sessions {card_ids, mode:"complex"}` + количество/темы | `HistologyTrainerFilters.tsx` (убрать `createHistologyTraining` из этого пути) |
| Единая история (серии + legacy, бейдж источника) | `HistologyTrainer.tsx` блок «История» |
| Оси задания вместо скрытых режимов | `DiagnosticumToolbar.tsx`, `DiagnosticumModeChips.tsx` |

Критерий блока: экзамен, серия по карточкам, разбор, повтор ошибок и история работают на одном движке;
в «Истории» видны и новые серии, и старые тренировки; статистика не двоится.

## 4. Блок B3 — свободный ввод и ИИ-проверка (как просил: переключатель везде)

### B3.1. UX

* Переключатель «Ответ: варианты / ввод текста» в тулбаре любого задания (Разбор, Экзамен, Своя серия,
  Электронограммы — где есть эталонное название).
* Значение по умолчанию — из `account_settings.preferences.trainer_answer_mode` (профиль), на попытку можно
  переопределить.
* Поле ввода: нормализованный ввод, подсказка «формулировка может отличаться — проверим по смыслу»,
  после ответа — «Зачтено по смыслу (ИИ)» / «Зачтено (точное совпадение)» / «Не зачтено, близко: …».

### B3.2. Конвейер проверки (`diagnosticum/grading.ts` + новый `grading-text.ts`)

1. **exact** — совпадение с эталоном/алиасом после нормализации (ё→е, регистр, дефисы, лишние пробелы).
2. **alias** — словарь `PREPARATION_ALIASES` + `preparationNames()` (уже есть в `src/shared/histology/preparation-match.ts`).
3. **fuzzy** — токены/Левенштейн ≤ 2 для слов длиннее 5; порог 0.86, иначе дальше.
4. **AI** — Gemini (`GEMINI_API_KEY`, модель из `GEMINI_MODEL`, JSON-схема `{verdict, confidence, reason}`),
   промпт: «сравни ответ студента с эталоном и признаками методички; верни только JSON; при сомнении verdict=unsure».
5. **manual** — `unsure` или confidence < 0.75 → строка в очередь «на проверку» (`grading_source='manual_pending'`),
   балл не начисляется, студент видит «Отправлено на проверку».

Правила: ИИ **не** отменяет точное совпадение; ИИ **не** вызывается для вариантов; максимум 1 вызов на попытку;
кэш `sha1(guide_key|normalized)` в Upstash (TTL 30 дней); суточный лимит на пользователя (например, 120 вызовов);
фича-флаг `AI_TEXT_GRADING` в env воркера, по умолчанию `on` только для гистологии.

### B3.3. Данные и аудит

`diagnosticum_attempts`: `input_text jsonb`, `grading_source`, `grading_confidence numeric`, `grading_reason text`,
`grading_model text`. В разборе показываем источник проверки и объяснение; в админке — фильтр «проверено ИИ»
и кнопка «пересмотреть вручную».

Критерий: один и тот же ответ «митоз в корешке лука» зачитывается как «Митоз»; «хрящ гиалиновый» — тоже;
«не знаю» — нет; при недоступном ИИ система деградирует до exact/alias/fuzzy и не врёт баллом.

## 5. Блок B4 — «Свои препараты» → атлас (и админ, и студенты)

Что уже есть: `user_preparations` + статусы + RLS + триггер, `/trainers/feed/mine` CRUD и `/submit`,
админ-очередь `/admin/preparation-submissions` (approve создаёт `trainer_feed_cards`, reject с пояснением),
редактор карточек `/admin/trainer-cards` (+ создание карточки админом — уже в работе), атлас читает
`is_published` карточки.

Чего не хватает и что делаем:

| # | Задача | Файлы |
| --- | --- | --- |
| B4.1 | Единая модерация: `/admin/moderation` с вкладками «Мастерская» и «Заявки в атлас», общий счётчик; `capability atlas.moderate` для роли moderator | `src/app/admin/**`, `src/shared/permissions/index.ts`, `admin/preparation-submissions.ts` |
| B4.2 | Связь с мастерской: `user_preparations.workshop_item_id`, публикация снимка из мастерской (kind=`preparation`), файлы — через существующий прокси мастерской | `workers/.../workshop/*`, миграция |
| B4.3 | Атлас: бейдж источника (админ / студент / импорт), фильтр «Студенческие», «Мои», кнопка «Предложить в атлас» на карточке | `HistologyAtlas.tsx`, `listTrainerCatalog` |
| B4.4 | Несколько снимков и подписи/hotspots для пользовательской карточки через `trainer_card_images` (v2) | `04-mine.ts`, `preparation-submissions.ts`, `TrainerImageViewer` |
| B4.5 | Редактирование своей карточки прямо из атласа (deep-link `?mine=<id>`) + «снять с публикации» | `HistologyAtlas.tsx`, `mine-publication.ts` |
| B4.6 | Дедупликация при отправке (по имени+органу, phash снимка) и предупреждение «похоже на X» | `04-mine.ts`, `preparation-match` |
| B4.7 | ИИ-подсказка при заполнении (орган/окраска/описание по снимку, Gemini vision) с пометкой «предложено ИИ, проверьте» | `MyPreparations.tsx`, новый `preparations/suggest.ts` |

Критерий: админ добавляет препарат без SQL; студент отправляет свой снимок; модератор видит обе очереди;
одобренный снимок открывается в атласе, тренировке и диагностике как обычная карточка.

## 6. Блок B5 — наполнение базы (данные, которые ты дал)

| Источник | Что делаем | Куда |
| --- | --- | --- |
| `Downloads/препараты бонус` (42 jpg) | манифест сопоставления с методичками, ручное подтверждение, загрузка в B2, `preparation.imageStatic` → `imageCleanUrl`/fileId | `trainer_feed_cards`, `files` |
| `Downloads/Гистология` (65 docx ЭМ, 394 jpg) | парсинг подписей ЭМ, сверка с текущими 22 ЭМ-карточками, дедуп по phash | `trainer_feed_cards` (mode_set=electronogram) |
| `docs/PREPARATIONS-BONUS-MAPPING-2026-11-25.md` | использовать как основу маппинга, дополнить фактами из папки | документ |
| Первая диагностика 18/19 | сверить перечень §8 концепции с `sets.ts` и методичками | `FIRST_DIAGNOSTICUM` |

Правило: без подтверждения — не публикуем; каждый файл сохраняет источник (папка/файл/дата), спорные — в
«требует проверки». Импорт идёт скриптом (`tools/import/…`) + админ-очередь, а не SQL-дампом.

## 7. Блок B6 — проверки и деплой

1. `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run build`;
   `cd workers/api && npm run check`.
2. Живая матрица (browser-skill): 4 режима × настройки + свободный ввод (точный / парафраз / неверный / пустой),
   свои препараты → заявка → approve → атлас → тренировка, повтор ошибок, история, статистика, мобильный вид.
3. Ветка `feat/unified-trainers`, PR, Vercel preview; прод — после зелёных проверок.
4. Прод-миграции: только аддитивные, с rollback, применяются отдельным шагом после `SELECT`-проверки.

## 8. Инструменты (что использую и что обычно используют)

| Класс | Обычно у программиста | Здесь |
| --- | --- | --- |
| Редактор/навигация | VS Code, grep/ripgrep | `read`, `edit`, `write`, `grep`, `glob` |
| Типы/линт/тесты | TypeScript, ESLint, Prettier, Vitest, Playwright | `npm run typecheck/lint/test:unit`, `vitest`, `node --test` |
| Скрипты и данные | Python, Node, jq | `pwsh`, `node_repl`, Python (docx, openpyxl, Pillow) |
| БД | psql, DBeaver, Supabase CLI | SQL через `DB_*` из `.env.local` (только чтение по умолчанию), миграции файлами |
| API/воркер | wrangler, Postman/Insomnia | `wrangler` (если токен есть), `curl`/fetch из браузера, логи воркера |
| Git/CI | git, gh, GitHub Actions | `git`, MCP `github` (ветка/PR), Actions по факту |
| Хранилище | S3-клиент | MCP `backblaze` (B2), `upstash` (кэш), `cloudflare-api` (диагностика) |
| Дизайн | Figma, Stitch | `docs/design/stitch-*` как референс |
| Браузер/E2E | Playwright, DevTools | `browser-skill` (`bsk_*`): клики, сеть, скриншоты |
| ИИ | OpenAI/Gemini SDK | `GEMINI_API_KEY` + `OPENROUTER_API_KEY` через воркер; субагенты DSH — сейчас нерабочие (см. §0) |

## 9. Риски и границы

* **Чужая незакоммиченная правка** (админ создаёт карточку: `TrainerCardEditor.tsx`, `trainer-card-create.ts`,
  `endpoints.ts`, `admin.ts`, `admin/index.ts`) — я её не трогаю, строю B4 поверх; перед деплоем проверить вместе.
* **Две таблицы попыток** — риск двойного счёта в статистике; закрывается `source` и мостом, старые таблицы
  остаются read-only.
* **ИИ-оценка** — по концепции не может быть единственным судьёй: порог уверенности, объяснение, очередь на
  ручную проверку, отключаемый флаг, лимиты стоимости.
* **Прод-БД** — только аддитивные миграции; никаких `drop`/`update` существующих строк без отдельного шага.
* **Атлас** — пользовательские снимки проходят проверку; авторство и источник хранятся, снятие публикации
  не удаляет историю попыток.

## 10. Порядок в одном заходе

1. B1 целиком (код + тесты + живой прогон) — без этого объединение закрепляет утечку ключа.
2. B2.1–B2.2 (миграция + API), затем B2.3 (клиент), затем живая матрица.
3. B3 (свободный ввод + ИИ) на уже едином движке.
4. B4 (атлас/модерация/свои препараты), затем B5 (наполнение), затем B6 (деплой/PR/preview).

Каждый блок заканчивается зелёными проверками и живым прогоном; «готово» = проверено на сайте, а не «код написан».

## 11. Статус выполнения

**B1 — сделано и в проде** (PR #28, squash `4687c303`, 2026-11-27).

Проверено на `https://medbiohim.vercel.app` после деплоя Worker и фронтенда:

* варианты приходят с позиционными id `a1…aN` (в `/diagnosticum/start` — `[["a1"…"a4"],["a1"…"a6"],["a1"…"a5"]]`), `guide_key` в ответе отсутствует;
* `GET /diagnosticum/sessions/:id` в статусе in_progress отдаёт только `attempt_id,index,section,question,answered,hints_total`;
* бонус-снимок `feed-prep-bonus-ct-hyaline-cartilage-01` → редирект на `https://medbiohim.vercel.app/library/.../shot-01.jpg`, `200 image/jpeg`;
* `/diagnosticum/mistakes` — 20 записей, из них 0 с `em:` (электронограммы в очередь не попадают);
* в UI после четырёх подсказок кнопка читается «Все подсказки использованы» и disabled;
* экзамен по-прежнему принимает ответ: выбран первый вариант → «Ответ принят · 0 баллов», «вопрос 1 из 10», без таймера.

CI на merge-коммите: `frontend`, `backend`, `workers-api`, `smoke`, `package`, `playwright`, `build-and-deploy` — success; `deploy` (Cloudflare API) — success; Vercel задеплоил фронтенд.
Отдельно падает `Supabase Preview`: «Remote migration versions not found in local migrations directory» — расхождение ledger миграций, к B1 не относится, требует отдельного шага.

Дальше — блок B2 (миграция + `parts` + список сессий + слияние истории/статистики).

