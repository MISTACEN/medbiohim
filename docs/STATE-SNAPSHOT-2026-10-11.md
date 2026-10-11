# MEDBIOHIM — полный снимок состояния проекта
**Дата:** 2026-10-11  
**Назначение:** контрольная точка перед паузой; что задумано, что изменено в исходниках, что проверено, что не завершено и с чего продолжать. Это сводка, а не заявление о прохождении тестов.

## 1. Идентичность и принцип продукта
- MEDBIOHIM — самостоятельная учебная платформа для самоподготовки студентов к экзаменам, тестам, зачётам и занятиям.
- Это не официальный сайт вуза и не замена официальной ЭИОС.
- Принцип: «от студентов для студентов», приоритет самостоятельной работе и удобству студентов.
- Пользователь просит сохранять существующую структуру сайта и визуальный язык, встраивать функции в текущий интерфейс, а не делать параллельный сайт/глобальный редизайн.
- Целевая аудитория на текущем этапе небольшая; проект некоммерческий по замыслу, но это не отменяет правил платформ и лицензий.
- Реальные импортированные вопросы должны иметь происхождение/источник. AI-сгенерированные и непроверенные данные должны быть маркированы, а не молча выдаваться за официальные.

## 2. Архитектура и инфраструктура, известная на момент снимка
- GitHub: `MISTACEN/medbiohim`, рабочая ветка — `main`; не создавать новые ветки без необходимости/разрешения.
- Frontend: Next.js, текущий сайт: https://medbiohim.vercel.app
- Frontend hosting/deploy: Vercel, автодеплой из GitHub.
- Backend: PHP API, развёртывание/целевое окружение связано со SpaceWeb.
- Database/auth: Supabase; не заменять Supabase Firebase без отдельного обоснования.
- Files: Backblaze B2 private bucket `medbiohim-files`, endpoint `s3.eu-central-003.backblazeb2.com`; изображения/часть контента также хранятся в структуре `content` и на SpaceWeb.
- Telegram: отдельный Node.js webhook MVP в `integrations/telegram-bot`; существующая PHP-обработка в `backend/src/Services/TelegramHomeworkService.php`.
- Основные документы проекта: `ROADMAP.md`, `PHASES_STATUS.md`, `SYNC_STAMP.md`, `docs/UNFINISHED-REGISTRY.md`, `docs/STUDENT-FIRST-MAP.md`, `docs/FUTURE-INTEGRATIONS-IDEAS-MAP.md`, `docs/MEDBIOHIM-PRODUCT-INTENT-AND-INTEGRATION-CONTRACT.md`.
- Настоящий документ является снимком, следующие изменения нужно отражать также в основных документах, не заменяя их этой сводкой.

## 3. Изменения последнего прохода 2026-10-11
### Backend / PHP
- Добавлен `backend/src/Support/TelegramWebhookSecret.php`: пустой или отсутствующий ожидаемый/переданный секрет не проходит; сравнение выполняется через `hash_equals`.
- `TelegramHomeworkService::webhookSecretMatches()` переведён на этот helper.
- Добавлен `backend/tests/TelegramWebhookSecretTest.php`.
- В `.github/workflows/code-check.yml` добавлен запуск этого PHP regression test.
- В `backend/config/routes/homework.php` снято требование, чтобы общий homework создавал только staff/starosta. Ранее существующая проверка академической группы остаётся обязательной. Требуется реальный отрицательный тест: участник своей группы может создать задание, неучастник — нет.
- В `src/app/schedule/page.tsx` create UI стал доступен авторизованному пользователю (`canCreateHomework = Boolean(user)`), заменив прежнее ограничение по роли. Нужно проверить, что сервер остаётся источником истины, что предмет/группа/вложения проверяются и что не открылись другие административные действия.

### Telegram Node/Mini App
- В `integrations/telegram-bot/lib/commands.js` добавлен Web App entry: `/start` и `/app` формируют URL сайта (по умолчанию `https://medbiohim.vercel.app/`, настройка `MEDBIOHIM_APP_URL`).
- В `integrations/telegram-bot/api/webhook.js` добавлена кнопка открытия сайта в Telegram Web App.
- В `integrations/telegram-bot/test/commands.test.js` добавлен тест URL.
- В том же Node webhook добавлен опциональный HTTPS relay сообщений групп/supergroups в `TELEGRAM_HOMEWORK_WEBHOOK_URL`; секрет передаётся через `X-Telegram-Bot-Api-Secret-Token`. Node остаётся единственным Telegram webhook destination, поскольку Telegram принимает только один активный webhook для бота.
- Каналы и прочие типы чатов игнорируются; при отсутствии endpoint relay не вызывается. Endpoint проверяется на HTTPS.
- В `integrations/telegram-bot/test/webhook.test.js` добавлены тесты relay success и fallback без конфигурации; прежний тест группового поведения изолирован от переменной окружения.
- README Telegram обновлён: отдельный Vercel project с Root Directory `integrations/telegram-bot`, env vars, BotFather domain, единственный webhook и оговорка, что кнопка не является авторизацией.
- В `backend/src/Support/TelegramWebAppInitData.php` уточнена строгая проверка Telegram user ID (положительное целое/цифровая строка, не дробь и не ноль).
- В `backend/tests/TelegramWebAppInitDataTest.php` добавлены отрицательные тесты для отсутствующего/плохого user ID, дробного/нулевого ID и некорректной/слишком большой initData.
- Добавлены/обновлены записи в `ROADMAP.md`, `PHASES_STATUS.md`, `SYNC_STAMP.md`, `docs/UNFINISHED-REGISTRY.md`, README интеграции.

### Чего изменения НЕ сделали
- Не выполнен production deploy и не менялись live environment variables, Telegram webhook settings, production secrets или production database.
- Не настроен реальный `TELEGRAM_HOMEWORK_WEBHOOK_URL`: публичный правильный PHP API origin нужно подтвердить перед конфигурацией.
- Не выполнено end-to-end сохранение Telegram homework в Supabase/БД.
- Не реализованы безопасная регистрация через Telegram, связывание существующего аккаунта, восстановление доступа и полная авторизация Mini App. Открытие страницы внутри Telegram — только входная кнопка.
- Не подтверждена идемпотентность Telegram updates, дедупликация, извлечение вложений/фото, сопоставление группы с группой MEDBIOHIM и review-процесс AI-классификации.
- Нельзя объявлять Node/PHP тесты успешными, пока runner не выполнил шаги.

## 4. CI — актуальный блокер
- На серии запусков 2026-10-11 workflows `MEDBIOHIM code checks`, `MEDBIOHIM optional integrations checks`, `MEDBIOHIM smoke`, `Build SpaceWeb backend archive`, `Package MEDBIOHIM source` завершались failure до запуска шагов.
- У ряда jobs наблюдались `runner_id=0`, пустой `runner_name`, `steps=[]`, длительность около 2–3 секунд; у некоторых jobs при чтении API на короткое время status был queued/in progress, затем тоже failure.
- Доступные данные не показывают точную причину. Это похоже на проблему provisioning/доступности runner или настройки GitHub Actions, но без UI/settings/logs это гипотеза, а не установленный диагноз.
- Примеры запусков из последней серии: https://github.com/MISTACEN/medbiohim/actions/runs/38101031997 и https://github.com/MISTACEN/medbiohim/actions/runs/38101031991. Проверять актуальный список в https://github.com/MISTACEN/medbiohim/actions.
- Следующий обязательный шаг — восстановить выполнение runner/проверить Actions settings, затем запустить все тесты. Не маскировать blocker отключением проверок и не считать source edits тестами.

## 5. Известные ранее технические риски — перепроверить по текущему main
Ниже — ранее найденные проблемы; их статус после текущего прохода не подтверждён и нельзя автоматически считать их всё ещё существующими или исправленными:
- duplicate method в ContentStore;
- missing B2 columns / несовпадение схемы файлов;
- RLS для homework_submissions;
- риск self-role assignment;
- отсутствующий/неполный `/auth/register`;
- `/auth/me` не возвращает ожидаемые roles/groups/course/semester;
- запись неподдерживаемого enum `finished`;
- устаревшая схема questions;
- dashboard 500/UNAUTHORIZED Bearer;
- `AccountSettingsService::getPreferences()` undefined из `/api/v1/auth/me`;
- auth/schedule endpoints 401;
- trainer images 404/502;
- ошибка типов Router в `routes.php:6` / `Bootstrap.php:93`;
- тест проверки session status отвергает `cancelled`;
- проверить webhook-secret fail-open (helper добавлен, но фактическое выполнение теста не подтверждено).
Провести повторный аудит текущего кода, SQL migrations, RLS, маршрутов, fallback-путей и API contracts.

## 6. Контент, гистология, материалы и интерфейс — сохранённые требования
- Атлас на главной/в текущем интерфейсе визуально одобрен; изображения идут через существующую структуру `content`. Не переносить viewer наверх и не ломать центрирование.
- Viewer должен поддерживать fullscreen, zoom/loupe, pan в любой области, мобильные жесты и desktop pointer, сохранять подписи/легенды, readable quality; видео — приемлемое качество FullHD и переключение качества/fallback, если это возможно.
- Гистология: `subject_slug=histology`, `specialty_slug=mbh`, `mode_set=electronogram`; существующие 5 ticket_banks UUID не трогать; EM карточек ранее 28; JSON `data/content_packages/histology-mbh-trainer-cards.json` — 206 карточек (178 prep + 28 EM); проверить migration `20260925_fix_histology_feed_source_key.sql`; вопросы по гистологии должны расширяться без замены существующих наборов.
- Вопросы: доступ к банку вопросов с правильными ответами для самоподготовки без входа в режим теста; жалоба на вопрос/ответ; AI-проверка ответа семантически, не учитывать орфографию, вызывать AI только когда точного/простого совпадения недостаточно.
- Расписание: week/month/semester views, домашние задания и фото, предмет/день, отметки посещения и прогресса; индивидуальное выполнение отделено от общего задания группы.
- Telegram и ручное добавление должны приходить в одну canonical homework model; неизвестное/сомнительное распознавание — на подтверждение; защита от дублей и сохранение source provenance.

## 7. Требования к будущей hosting topology
См. `docs/HOSTING-RESILIENCE-AND-FREE-TIERS.md`. Принцип: текущие Vercel + Supabase + SpaceWeb + B2 не удалять и не заменять. Сначала анализ и минимальный независимый proof-of-concept, затем переключение/пилот только с подтверждением.

## 8. Порядок возобновления работ
1. Проверить состояние main и GitHub Actions; выяснить точную причину runner failure.
2. Выполнить unit/regression tests Node + PHP, syntax/lint/build и smoke tests.
3. Аудировать текущие изменения homework permissions: участник/неучастник, чужая группа, subject mismatch, attachment validation, duplicate request.
4. Проверить Telegram relay: правильный backend origin, shared secret, one active webhook, group mapping, update replay/idempotency, safe logs.
5. Завершить secure Telegram identity linking/Mini App auth только после аудита auth model и миграций.
6. Затем внедрять hosting acceleration/failover по отдельному документу, не переносить всю систему одновременно.
7. Повторно пройти список ранее найденных PHP/API/SQL/RLS/UI дефектов и обновлять статусы только после доказательства.
8. После каждого прохода синхронно обновлять `ROADMAP.md`, `PHASES_STATUS.md`, `SYNC_STAMP.md`, `docs/UNFINISHED-REGISTRY.md`.

## 9. Правило статусов
- «Изменено в исходниках» ≠ «тесты прошли».
- «Тест прошёл» ≠ «работает в production».
- «Работает в production» фиксируется только после целевого smoke/E2E теста.
- Все открытые/непроверенные элементы сохраняются в unfinished registry; не удалять проблемы только потому, что добавлен новый helper или UI.
