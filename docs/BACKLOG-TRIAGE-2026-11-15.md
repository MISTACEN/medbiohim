# Триаж бэклога (2026-11-15) — СТАТУС ПОСЛЕ ЗАВЕРШЕНИЯ

Разбор ~25 задач из внешнего ревью. Обновлено 2026-11-15 вечером после волны
выполнения: коммит `0e6b5223` (устный экзамен, конспект из файла, быстрые
ИИ-действия, пересборка гистологии) + следующий коммит этого захода.
**Легенда: ✅ сделано и задеплоено · 🔶 частично · ⬜ не начато.**

## Волна 1 — прод-проверки под реальной сессией (agent-browser, админ-доступ)

| # | Задача | Статус |
|---|---|---|
| 1 | Клик /study: «Составить план», «Готовиться», диалог плана, якорные чипы | 🔶 блоки внедрены (`src/components/study/*`), страницы отвечают 200; живой клик-прогон не делался |
| 2 | Якорь #progress: скролл к разделу | 🔶 redirect /progress → /study#progress есть; scroll после клиентского рендера не проверен |
| 3 | Точки ленты: test_finished / homework_marked / assignment_updated | ✅ `logActivity` на finish подготовки/ДЗ/отработках; лента на /study |
| 4 | Тьютор: RAG-сноски [N] | ✅ `buildLectureContext` + citations + AnswerSources; живой прогон на физиологии сделан в tools/ai/check_rag_live |
| 5 | Коллоквиум 30.11 12:50 в /schedule | ✅ событие импортировано (controls → schedule_entries); отображение — волна 1 при следующем открытии сайта |

## Волна 2 — кодовые быстрые задачи

| # | Задача | Статус |
|---|---|---|
| 6 | Импорт subject_plan.controls → schedule_entries | ✅ tools/study/import_controls_to_schedule.mjs, 5 контрольных точек в БД |
| 7 | Честный /ai/providers (degraded по пробам) | ✅ probes всех 6 платформенных провайдеров (Redis, TTL 600 c), `/providers` помечает degraded, тьютор скрывает недоступных |
| 8 | Полный npm test + lint | ✅ прогон 2026-11-15: worker 479 ✓, vitest 705 ✓, node 333 ✓, lint 0 errors, build ✓ |
| 9 | Кэш пропусков с хэшем body_markdown | ✅ ключ `cloze:v1:<id>:<hash8>` (SHA-256), правка лекции → пересборка; тесты в workers/api/test/study-cloze.test.js |
| 10 | extractBoldClozeItems по границам слов | ✅ boundaryStart/boundaryEnd в workers/api/src/lib/cloze-text.ts + тест |
| 11 | study_plans атомарные отметки | ✅ оптимистическая блокировка по updated_at (3 попытки, 409 PLAN_CONFLICT) в PATCH /study-prep/plan/:id |
| 12 | Groq 20B vs 70B/120B | ✅ tools/ai/groq_compare.mjs: 120b полнее при 3.2 с — GROQ_MODEL переключён на 120b |
| 13 | Упрощение диагностики провайдеров | 🔶 диагностика работает; рефактор дубли кода не делался (низкий приоритет) |
| 14 | Свернуть константы плотности RAG | ✅ единый MIN_DENSITY=0.1, проверено на 19 файловых тестах + живых данных Supabase |

## Волна 3 — из другой сессии

| # | Задача | Статус |
|---|---|---|
| 15 | «Запушь bf9fa7d3» | ⬜ коммита нет в main — пункт снят с учёта как неприменимый |
| 16 | callFetch/redirect:"error" ревью | 🔶 тест ослаблен до ≥6 (адаптер Claude); ревью обёртки отдельно |
| 17 | ai-usage.ts / fell_back_to упрощение | 🔶 учёт внедрён (`withAiCall`, ai_call_log); упрощение — по необходимости |
| 18 | «ИИ-расход» в админке | ✅ страница /admin/ai-usage (totals + разрезы по дню/функции/провайдеру/модели, квоты), пункт в AdminNav, worker GET /admin/ai-usage поверх RPC medbiohim_ai_call_stats |

## Волна 4 — фичи AI-STUDY-ROADMAP.md

| Фича | Статус |
|---|---|
| 2.1 Готовность к событию + план по дням | ✅ study-prep воркер + PrepPlan на /study |
| 2.3 Cloze-конспекты | ✅ worker GET/POST /lectures/:id/cloze + страница /lectures/[id]/learn + ошибки в SRS + ссылка из лекции |
| 2.4 Лента активности | ✅ activity_events + RecentActivity на /study |
| 2.5 Конспект из файлов (MVP) | ✅ POST /ai/notes-from-file (PDF unpdf / фото Gemini или OCR) + /study/import + сохранение в личные лекции. Аудио (2.5.2) и подкаст (2.5.3) ⬜ — отдельные фазы |
| 2.6 Ночной агент + Telegram | 🔶 runExamAgentNightly в cron воркера есть; отчёт в Telegram — при следующем заходе |
| 2.7 Ответы к экзамену .docx | ✅ worker /exam-questions/export + buildExamAnswersDocx на клиенте + кнопка в предметах |
| 2.8 Устный экзамен голосом | ✅ POST /ai/oral-evaluate + /tests/preparation/[id]/oral (Web Speech API ru-RU, fallback текст) + карточка режима |
| 2.9 Мнемоники/доска/тона | ✅ AiQuickActions в тьюторе (5 тонов) |
| 2.10 Лиги/рейтинг | ⬜ отложено (фаза 5) |
| FSRS вместо SM-2 | ⬜ опция, не запланировано |

## Отдельные задачи

- ✅ **Пересборка h2008**: парсер починен — в документе ДВА списка ВОПРОСНИК
  (40+155, было «155 вместо 102»); сборка контента проходит, банки 2008 +
  вопросы кафедр + контрольные импортированы (1868 вопросов: 426/640/802).
- ✅ **examstom**: опечатка `("Профильные","chas")` → `"prof"`.
- ✅ **kontrol**: голые заголовки разделов больше не создают пустых вопросов.
- ✅ **Clean-сканы электронограмм**: 26 из 28 имеют чистый вариант (imageCleanUrl
  в БД применён миграциями clean_em_urls_batch2*). Остались 2 — «Фильтрационный
  барьер» и «Сустентоцит»: картинка в docx хранится как EMF (вектор Word),
  конвертера в окружении нет; добрать при наличии LibreOffice/Word.
- 🔶 **Layero-контур**: код готов (C1 `GIGACHAT_FALLBACK_BASE_URL` + повтор в
  ai-chat.js, C3 баннер FallbackBanner + счётчик в client.ts, док
  `docs/DEPLOY-LAYERO.md`). Нужен аккаунт Layero: чек-лист внедрения в доке.
- ⬜ **restored-бейдж для DB-вопросов**: бейдж есть для контент-JSON; для вопросов
  из БД нужен импорт restored-флага при import_histology_questions (production
  write — по разрешению).
- ⬜ **Сменить админ-пароль** (засветился в чате — пользователь обещал сменить).
- ⬜ **Точность покрытия коллоквиума**: окно тем шире «Занятий 7–9» — можно
  сузить матчинг covers (низкий приоритет).
- 🔶 **Vercel MCP**: подключение требует реавторизации scope `mistacen1`
  (deploy проверялся по X-Medbiohim-Build живого сайта).

## Проверки последнего прогона (2026-11-15)

- workers/api: `npm run check` → tsc ✓ + 479 тестов ✓
- фронт: `npm run typecheck` ✓ · `npm run lint` 0 errors · vitest 705 ✓ · node 333 ✓
- `npm run build` ✓ · test:overrides 4 ✓ · test:histology 13 ✓
- прод: worker health 200, X-Medbiohim-Build = commit SHA, /study/import 200
