# MEDBIOHIM — исторический статус-снимок

Снимок от 2026-10-15 (UTC); не считать актуальным live-статусом без повторной проверки. В нём сохранены важные результаты SQL/RPC и smoke-проверок, но описание production-топологии устарело относительно исходников `main` от 2026-10-19. Для текущей статической схемы см. [WORKERS-TOPOLOGY.md](WORKERS-TOPOLOGY.md) и [API route parity audit](API-ROUTE-PARITY-AUDIT-2026-10-19.md).

## Архитектура и production-границы

| Компонент | Состояние |
|---|---|
| Frontend | Next.js на Vercel; GitHub Vercel check на коммите `adda422` — `success`. Точный production alias отдельно не проверен |
| Production API | PHP API на SpaceWeb; контрактный эталон сохранён |
| Cloudflare API | Shadow Worker `medbiohim-api-shadow`; текущие мигрированные обработчики развёрнуты, Production-трафик не переключался |
| Supabase | Источник истины для Auth, учебных данных и RLS |
| Private media | Архив гистологии загружен в приватный Upstash Blob; Worker secret `UPSTASH_BLOB_TOKEN` присутствует (само значение не читалось) |

## Подтверждённая сборка Cloudflare

- Build: `31ae9afd-1466-4e12-ad13-bf2132a6d829`.
- Source commit: `adda422197b70912a5cca3cc159bb0f9809b1e5d`.
- Результат: **330 тестов пройдены, 0 ошибок**; Wrangler dry-run и команда `npx wrangler deploy` завершились успешно.
- Shadow deployment: `d6fa407b-ce7b-459a-83eb-2359e3abe66e`; версия Worker `88d4a621-31e1-4f10-ad10-6246f6ffad4e` распределена на 100%.
- GitHub показывает Vercel check `success` на этом коммите, но проверка production alias отдельно не выполнялась. API сайта по-прежнему не переключён с PHP/SpaceWeb на Cloudflare.

## Завершённый технический контур: тренажёры и микропрепараты

### Supabase

Миграции `secure_histology_training_lifecycle_rpc_20261015`, `persist_histology_training_score_20261015`, `secure_histology_training_lifecycle_reconcile_20261015` и `remove_duplicate_histology_training_rpc` применены к live-проекту. Оставлен один канонический набор из шести RPC; временные параллельные имена удалены. Процент завершения сохраняется в `trainings.score` и доступен в истории. Добавлены RPC:

- `histology_training_create(p_input)`
- `histology_training_list(p_status)`
- `histology_training_get(p_training_id)`
- `histology_training_answer(p_training_id, p_order, p_user_answer, p_is_skipped)`
- `histology_training_complete(p_training_id)`
- `histology_training_cancel(p_training_id)`

Проверено через каталог PostgreSQL: все шесть RPC — `SECURITY DEFINER`, владелец `postgres`; EXECUTE разрешён `authenticated`, а `anon` и `PUBLIC` доступа не имеют. Прямые SELECT/INSERT права роли `authenticated` на `public.trainings` и `public.training_answers` отсутствуют.

Сервер проверяет `auth.uid()`, активное членство в группе МБХ и владельца сессии. Создание/ответ/завершение/отмена выполняются атомарными RPC. Верность ответа вычисляется на сервере; присланные клиентом `user_id` или `is_correct` не используются для выставления результата. У незавершённого вопроса снимок ответа и подписи скрыты; материал разбора раскрывается только после ответа/пропуска.

### Cloudflare Worker

- `GET /api/v1/trainings` — история сессий через RPC.
- `POST /api/v1/trainings` — создание с фильтрами по темам, типу материала, количеству, выбранным карточкам и раскладке.
- `GET /api/v1/trainings/{id}` — продолжение/просмотр своей сессии.
- `POST /api/v1/trainings/{id}/answer` — ответ или пропуск.
- `POST /api/v1/trainings/{id}/complete` — досрочное/обычное завершение со статистикой.
- `POST /api/v1/trainings/{id}/cancel` — отмена без выставления оценки.

Прогон на реальной схеме Supabase прошёл в откатываемой транзакции: создание → чтение скрытого снимка → ответ → проверка разбора → попытка прочитать чужую сессию (отказ) → завершение с сохранением оценки → история с оценкой → отдельная отмена. Транзакция откатилась, тестовые сессии не сохранены. Дополнительно подтверждены отсутствие прямых table grants и EXECUTE-права только для `authenticated`.

**Ограничение проверки:** это откатываемый RPC smoke с установленным тестовым JWT claim, а не сквозной HTTP smoke с настоящим подписанным bearer JWT браузера. Реальный студенческий сценарий по HTTP всё ещё требует acceptance-теста.

## Другие обработчики Cloudflare, требующие live acceptance

- Главная: dashboard/profile, расписание, задания и статистика.
- Поиск и каталог предметов: subjects, subjects-catalog, search, subject plans.
- Учебные данные: curriculum, lectures, materials, subject-materials, tickets, questions, test catalog, progress.
- Гистология: trainer feed, изображения, мини-тесты, жалобы, файлы/источники, частная выдача учебников.
- Другие разделы: community posts, academic state/planner, attendance, calculators, chemistry resolver, tutor, AI conversations, SRS, notes/favorites, settings и presence.

Наличие обработчика в Worker не значит, что соответствующая страница уже использует его в Production.

## Что осталось

1. **Реальный HTTP smoke тренажёра:** пройти feed → create → answer/skip → review → complete/cancel с настоящим студенческим bearer JWT через развёрнутый Worker и убедиться, что чужая сессия возвращает 404. Текущий smoke был внутри PostgreSQL с тестовым JWT claim; реальный браузерный bearer ещё не проверен.
2. **Production routing:** API-трафик по-прежнему обслуживает PHP/SpaceWeb. Перед переключением нужно подтвердить production alias Vercel, пройти полный smoke-набор с реальным JWT и подготовить план отката.
3. **Атлас/медиа:** проверить выдачу изображений всех 206 карточек. Не разрешена неоднозначная связь `photos/5. Эмалевый орган.jpg` ↔ `2. Эмалевый орган.jpg`; не подменять файл автоматически.
4. **Учебные планы:** проверить фактическую наполненность `site_content`, `curriculum_items`, модулей/тем и расписания; не придумывать отсутствующие темы или даты.
5. **Остальные страницы:** провести сквозную проверку главной, поиска, расписания, предметов, прогресса, материалов, тестов, калькуляторов, химии, Al-тьютора и сообщества.

## Принципы миграции

- Supabase остаётся источником истины; не дублировать учебные данные в Worker.
- Upstash Blob — для приватных бинарных файлов; Redis — только для кэша, не для канонических материалов.
- Использовать JWT вызывающего пользователя и RLS; не применять service-role обходы.
- Не возвращать ключи ответов до ответа/пропуска; сохранять приватные снимки только в серверных функциях.
- Production не переключать, пока не пройдены живые проверки и не подтверждён рабочий frontend deployment.
