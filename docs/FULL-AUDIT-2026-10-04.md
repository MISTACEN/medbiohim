# MEDBIOHIM — полный аудит заглушек, незавершённых функций и мёртвого кода

Дата: 2026-10-04
Ветка: main

Аудит проведён в 3 прохода:
1. пользовательский/runtime слой;
2. код, дубликаты и неиспользуемые функции;
3. deployment, документация и source-of-truth.

Цель — определить не только слова TODO, а всё, что реально может быть заглушкой, ложным fallback, мёртвым кодом или недоделанной функцией.

# Итог

## P0 — блокирует нормальную стабилизацию

### P0-1. GitHub Code Checks сейчас красные

Текущий commit: a3d580b978f30309837f60095e9bd47d4e828b04.

Smoke workflow проходит, backend PHP syntax проходит, но frontend job падает на проверке literal escaped-newline.

Точный источник:
src/components/trainers/HistologyTrainer.tsx:248

В JSX реально находится строка с literal "\n" между закрывающим button и div.

Действие: удалить literal \n и вернуть обычный перенос строки.

### P0-2. В src/lib/api.ts сохранился старый /api-compat слой

Есть 66 вариативных функций с сигнатурой (..._args: any[]).

Множество функций отправляют запросы на /api-compat/*.
Отдельного backend route для /api-compat сейчас нет.

Это не просто мёртвый код: часть этих функций используется реальным frontend.

Проверенные пользовательские места:

| Функция | Используется | Реальный backend endpoint |
|---|---|---|
| register | ✅ | /auth/register |
| createCommunityPost | ✅ | /community/posts |
| getLecture | ✅ | /lectures/{id} |
| getLessonPlan | ✅ | /lesson-plan |
| getQuestion | ✅ | /questions/{id} |
| getFile | ✅ | /files/{id} |
| reportQuestion | ✅ | /questions/{id}/report |
| adminSaveSchedule | ✅ | /admin/schedule |

Следствие:
- регистрация — риск сломанного запроса;
- создание поста — риск сломанного запроса;
- открытие лекции — риск сломанного запроса;
- lesson-plan helper — риск сломанного запроса;
- получение отдельного вопроса — риск сломанного запроса;
- получение файла — риск сломанного запроса;
- отправка жалобы на вопрос — риск сломанного запроса;
- сохранение расписания в CMS — риск сломанного запроса.

Действие: убрать compatibility layer и перевести frontend на реальные endpoints. Не создавать новый fake api-compat backend.

### P0-3. Режим «Весь банк подряд» сейчас расходится с Preparation UI

src/app/tests/bank/[id]/page.tsx строит ссылку:
 /tests/preparation/{id}?flow=sequential&mode=prepare

Но src/app/tests/preparation/[id]/page.tsx не обрабатывает flow=sequential.

Он видит только mode и запускает begin("count", n) с лимитом по умолчанию.

То есть кнопка «Весь банк подряд» фактически может запускать не весь банк, а выборку.

Действие: единый контракт mode/flow между bank и preparation.

### P0-4. Preparation frontend старой версии не соответствует backend-модели вопросов

Backend preparation уже учитывает:
- type;
- structured options;
- правильные варианты;
- несколько вариантов ответа;
- UUID test resolution.

Текущий frontend preparation всё ещё делает упрощённую проверку через String(answer) === String(q.answer), а варианты выводит через String(o).

Это опасно, если options — объекты.

Действие: перевести preparation UI на текущую структуру question/options.

### P0-5. Homework имеет реальный production mock fallback

src/app/homework/page.tsx импортирует homeworks as initial из src/lib/mock-data.ts.

Начальное состояние строится из mock.
При ошибке API интерфейс оставляет fake homework и пишет «API недоступен — mock».

Это недопустимо для production source-of-truth.
Пользователь может увидеть старые тестовые задания вместо состояния БД.

Действие: убрать mock из пользовательского runtime. При сбое показывать error/degraded state.

### P0-6. Admin schedule сохраняет через api-compat

Страница CMS расписания загружает данные через прямой adminListSchedule, но saveAll вызывает adminSaveSchedule → /api-compat/adminSaveSchedule.

Действие: сохранить через реальный /admin/schedule endpoint.

# P1 — серьёзные незавершённые/legacy участки

## P1-1. Два backend deployment workflow

Сейчас есть:
- .github/workflows/main.yml
- .github/workflows/deploy-backend.yml

Старый main.yml деплоит только backend/src и отдельно platform.php.
Новый deploy-backend.yml деплоит backend/src и весь backend/config/routes, умеет histology media и проверяет markers.

Это опасная архитектурная развилка.

Действие: оставить один официальный backend deploy workflow.

## P1-2. spaceweb_upload — дублирующий source tree

В spaceweb_upload сейчас два файла:
- config/routes/trainings.php
- config/routes/preparation.php

trainings.php совпадает с backend 1:1.

preparation.php не совпадает:
- backend: 229 строк;
- spaceweb_upload: 134 строки.

Backend содержит answer normalization, isAnswerCorrect и resolveTestId, которых нет в spaceweb_upload.

Следовательно, spaceweb_upload содержит устаревшую копию.

Действие: перестать считать spaceweb_upload источником кода. Удалить или генерировать как artifact.

## P1-3. Trainer media

Ранее зафиксированы runtime ошибки:
- feed-prep-5d0a74aa33/image → 502;
- feed-prep-a20a028e5e/image → 404;
- feed-prep-fc80ea08ed/image → 404.

Backend route существует.
Проблема относится к фактическому media/storage deployment.

Действие: отдельный SpaceWeb/B2 media smoke-test.

## P1-4. AI provider chain не закрыт

Цепочка существует, но ранее были реальные provider failures:
- Groq 403;
- GigaChat старый model → исправлено на GigaChat-2-Max;
- Gemini direct недоступен с RU SpaceWeb;
- Mistral возвращал 422;
- OpenRouter 403.

Действие: выбрать гарантированный primary provider и только после end-to-end проверки считать AI готовым.

## P1-5. Progress degraded state слишком похож на реальные нули

src/app/progress/page.tsx при ошибке создаёт overall_pct=0 и пустые homework/tests, а затем показывает service notice.

Это технически degraded state, но визуально пользователь видит реальные цифры 0.

Действие: показывать «данные временно недоступны», а не нулевой прогресс.

# P2 — мёртвый код / старые артефакты

## P2-1. Старая shadow-копия frontend

frontend/ содержит только:
- src/app/tests/preparation/[id]/page.tsx
- src/lib/content-api.ts

Нет frontend/package.json.
Это не отдельное приложение.

Статус: удалить после финальной сверки, root src/ — единственный frontend.

## P2-2. Неиспользуемый Sparkline

src/components/ui/Sparkline.tsx.
Поиск использования нашёл только сам файл.

Статус: dead code.

## P2-3. Неиспользуемые chemistry fixtures

src/lib/chemistry/fixtures.ts.
Использований chemistryFixtures в application code нет.

Статус: dev/demo fixture.

## P2-4. Legacy exam ticket JSON

backend/data/exam_tickets_legacy_2026.json.
Ссылок на него в runtime не найдено.

Статус: legacy artifact.

## P2-5. Demo / legacy schedule JSON

backend/data/schedule.json.
Документация прямо говорит, что production source of truth — Supabase, а этот файл является старым/demo data.

Статус: не runtime source of truth; после удаления fallback можно убрать.

## P2-6. Organic Chemistry placeholder artifact

docs/organic_chemistry-exam-questions-id-map.json содержит:
{"orgchem-task-1":"placeholder", ...}

Это реально незаполненная карта.

При этом organic_chemistry-import-summary.json говорит о 260 open tasks.

Статус: misleading documentation artifact.

# P2 — устаревшая документация

## docs/EM-DEPLOY-20261001.md

До сих пор утверждает, что backend/config/routes/trainings.php overwritten with PLACEHOLDER.
Это уже не соответствует main.

## docs/HOTFIX-TRAININGS-SQL-42601.md

Содержит инструкцию использовать docs/restore-trainings-gh.sh.
Файл уже удалён.

Документ устарел и ведёт к несуществующему recovery script.

## Legacy histology SQL folder

docs/histology-sql-exam-questions/ сейчас фактически содержит только 18.sql + README.
Канонический вариант:
docs/histology-sql-exam-questions-uuid/

Статус: архивировать или удалить после финальной сверки.

# Что НЕ является заглушкой

## ServiceNoticeBanner
Это нормальный компонент degraded status.

## HistologyTrainerParts
Используется текущим тренажёром.

## RDKit / 3Dmol
Не заглушки:
- RDKit загружается runtime через CDN;
- 3Dmol загружается runtime;
- есть fallback на PubChem.

## Packed trainings.php
backend/config/routes/trainings.php выглядит необычно, потому что содержит gzip/base64 payload.
Это реальный packed implementation, а не placeholder.

## Input placeholder
Обычные HTML placeholder="..." не относятся к заглушкам.

# Что реально работает сейчас

По текущим GitHub Actions:
- ✅ Smoke — проходит.
- ✅ /api/v1/health через Vercel — проходит.
- ✅ Backend PHP syntax check — проходит.
- ✅ Package backend archive — проходит.
- ✅ Package full source — проходит.
- ❌ Frontend code check — падает до typecheck/build из-за literal \n.

Важный вывод:
сейчас нельзя считать production frontend полностью проверенным через CI, потому что CI не доходит до TypeScript/build.

# Приоритет исправлений

## P0
1. удалить literal \n из HistologyTrainer.tsx;
2. убрать api-compat и подключить реальные routes;
3. исправить preparation modes / sequential;
4. исправить structured question options;
5. удалить mock homework runtime fallback;
6. исправить admin schedule save.

## P1
7. удалить/синхронизировать spaceweb_upload;
8. оставить один backend deploy workflow;
9. trainer media 404/502;
10. AI primary/fallback;
11. progress degraded UI.

## P2
12. удалить Sparkline;
13. удалить chemistry fixtures;
14. убрать legacy frontend tree;
15. убрать legacy JSON;
16. очистить stale docs;
17. убрать misleading organic chemistry placeholder map.

# Definition of clean codebase

После этой очистки в проекте не должно оставаться:
- production mock data;
- missing /api-compat calls;
- duplicate frontend trees;
- divergent SpaceWeb source copies;
- stale deployment workflows;
- документации на несуществующие recovery-файлы;
- placeholder data maps;
- неиспользуемых UI utilities без причины.
