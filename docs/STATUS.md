# MEDBIOHIM — актуальный статус

Последняя проверка: 2026-10-15 (UTC).

## Архитектура и production-границы

| Компонент | Состояние |
|---|---|
| Frontend | Next.js на Vercel; frontend commit с передачей режима раскладки тренажёра есть в `main`, но Vercel показывает `build-rate-limit`, поэтому его публикация не подтверждена |
| Production API | PHP API на SpaceWeb; контрактный эталон сохранён |
| Cloudflare API | Shadow Worker `medbiohim-api-shadow`; текущие мигрированные обработчики развёрнуты, Production-трафик не переключался |
| Supabase | Источник истины для Auth, учебных данных и RLS |
| Private media | Архив гистологии загружен в приватный Upstash Blob; Worker secret `UPSTASH_BLOB_TOKEN` присутствует (само значение не читалось) |

## Подтверждённая сборка Cloudflare

- Build: `c8b8e66e-e43c-49f8-a5b8-1b199ff0315c`.
- Source commit: `1730a184c97c4f6bb200167ac9a9294e6af4eed6`.
- Результат: **330 тестов пройдены, 0 ошибок**; Wrangler dry-run и команда развёртывания завершились успешно.
- Shadow deployment: `52d04056-7a83-471f-ad37-4cee4599c598`; версия Worker `5ba30477-dd73-4b37-a466-9b52d8be6931` на 100%.
- Это подтверждает актуальную сборку/Shadow deployment, но не переключение production сайта на Worker.

## Завершённый технический контур: тренажёры и микропрепараты

### Supabase

Миграции `secure_histology_training_lifecycle_rpc_20261015`, `persist_histology_training_score_20261015` и `secure_histology_training_lifecycle_reconcile_20261015` применены к live-проекту; процент завершения сохраняется в `trainings.score` и доступен в истории. Добавлены RPC:

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

Прогон на реальной схеме Supabase прошёл: создание → чтение скрытого снимка → ответ → завершение → история → отдельная отмена. Для проверки временно созданы две сессии на тестовом членстве группы, затем обе сессии и их ответы удалены; проверка не оставила тренировок в истории. Дополнительно проверен helper для удаления ключей ответов/подписей и ограничения прямых прав.

**Ограничение проверки:** это тест RPC внутри транзакции с установленным тестовым JWT claim, а не сквозной HTTP smoke с реальным подписанным токеном браузера. Поэтому реальный студенческий сценарий по HTTP всё ещё требует acceptance-теста.

## Другие обработчики Cloudflare, требующие live acceptance

- Главная: dashboard/profile, расписание, задания и статистика.
- Поиск и каталог предметов: subjects, subjects-catalog, search, subject plans.
- Учебные данные: curriculum, lectures, materials, subject-materials, tickets, questions, test catalog, progress.
- Гистология: trainer feed, изображения, мини-тесты, жалобы, файлы/источники, частная выдача учебников.
- Другие разделы: community posts, academic state/planner, attendance, calculators, chemistry resolver, tutor, AI conversations, SRS, notes/favorites, settings и presence.

Наличие обработчика в Worker не значит, что соответствующая страница уже использует его в Production.

## Что осталось

1. **Vercel / frontend:** Vercel status по последним коммитам — `build-rate-limit`. Успешное production-обновление frontend не подтверждено.
2. **Реальный HTTP smoke тренажёра:** пройти feed → create → answer/skip → review → complete/cancel с настоящим студентским bearer JWT и убедиться, что данные сессии не протекают другому пользователю.
3. **Production routing:** API-трафик по-прежнему обслуживает PHP/SpaceWeb; безопасное переключение на Cloudflare потребует успешного Vercel deployment и полного smoke-набора с планом отката.
4. **Атлас/медиа:** проверить выдачу изображений всех 206 карточек. Не разрешена неоднозначная связь `photos/5. Эмалевый орган.jpg` ↔ `2. Эмалевый орган.jpg`; не подменять файл автоматически.
5. **Учебные планы:** проверить фактическую наполненность `site_content`, `curriculum_items`, модулей/тем и расписания; не придумывать отсутствующие темы или даты.
6. **Остальные страницы:** провести сквозную проверку главной, поиска, расписания, предметов, прогресса, материалов, тестов, калькуляторов, химии, Al-тьютора и сообщества.

## Принципы миграции

- Supabase остаётся источником истины; не дублировать учебные данные в Worker.
- Upstash Blob — для приватных бинарных файлов; Redis — только для кэша, не для канонических материалов.
- Использовать JWT вызывающего пользователя и RLS; не применять service-role обходы.
- Не возвращать ключи ответов до ответа/пропуска; сохранять приватные снимки только в серверных функциях.
- Production не переключать, пока не пройдены живые проверки и не подтверждён рабочий frontend deployment.
