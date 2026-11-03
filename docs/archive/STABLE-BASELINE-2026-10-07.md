# MEDBIOHIM — STABLE BASELINE / FREE-TIER CAPACITY REGISTER — 2026-10-07

## 1. Назначение

Этот документ фиксирует текущее состояние проекта как базовую точку перед дальнейшими изменениями.

Пользователь сообщает, что текущая версия по наблюдениям работает. Это фиксируется как пользовательское наблюдение, но не подменяет production/runtime verification.

**Baseline HEAD:** 5dc6d663a63fdf3cca85ac4cf02a3621ee494d9f

Последние связанные документационные commits:
- 7213f20e763a3d49cb409783a7f39db7dad09ccf — source-of-truth zero-cost rule
- 55fdfb94826886a4e9b89b33406976291d008aef — roadmap zero-cost rule
- 5dc6d663a63fdf3cca85ac4cf02a3621ee494d9f — phase status zero-cost gate

## 2. Правило сохранения рабочего состояния
До любого крупного изменения: фиксировать текущий commit; не смешивать несколько крупных подсистем в один непроверяемый шаг; сохранять rollback point; после изменения проверять affected flow; не считать изменение успешным только по наличию commit.

Если новая реализация ухудшает уже работающий сценарий, приоритет — восстановить baseline и реализовать оптимизацию другим способом.

## 3. Что уже должно сохраняться без регрессии
- авторизация и /api/v1/me;
- группы и academic context;
- расписание;
- planner/homework;
- предметы;
- материалы;
- trainer/atlas;
- тесты;
- preparation;
- банк вопросов с ответами;
- жалобы на вопросы;
- admin problem center;
- server-authoritative scoring;
- immutable test/preparation snapshots;
- smart grading;
- curriculum/topic mapping;
- Histology content;
- chemistry master catalog;
- mobile UI.

## 4. Zero-cost rule
Полный функционал должен сохраняться при $0 обязательных расходов.

Текущий бесплатный стек:
- GitHub Free;
- Vercel Hobby;
- SpaceWeb Free;
- Supabase Free;
- Backblaze B2 Free allowance.

Если бесплатного ресурса не хватает, сначала оптимизировать архитектуру, а не урезать функцию.

## 5. Дополнительный поиск бесплатных ресурсов
Разрешено и желательно искать новые бесплатные сервисы, если они:
- permanent free, а не только trial;
- не требуют обязательной оплаты;
- реально закрывают часть нагрузки;
- не создают vendor lock-in без необходимости;
- имеют приемлемые лимиты;
- не ухудшают безопасность/приватность;
- позволяют сохранить текущий функционал.

Приоритет поиска:
1. бесплатный object storage;
2. CDN/cache;
3. image/document delivery;
4. бесплатные compute/serverless;
5. бесплатные database/read replicas или KV только если это действительно полезно;
6. бесплатные monitoring/logging;
7. бесплатные search/indexing;
8. бесплатные AI/API только как optional;
9. бесплатные backup/export layers.

## 6. Не дублировать функцию ради количества сервисов
Новый сервис добавляется только если он снижает нагрузку, увеличивает бесплатную ёмкость, повышает надёжность, ускоряет систему или закрывает реально недостающую возможность.

Не добавлять сервис только потому, что у него есть free tier.

## 7. Free-tier capacity register
Для каждого сервиса при дальнейшем аудите фиксировать: free quota; storage; egress; request limits; compute limits; concurrency; build/deploy limits; retention; sleep/suspension policy; условия перехода в paid; возможность hard limit/disable; фактическое потребление MEDBIOHIM.

## 8. Основная стратегия
Работающий baseline не ломаем.

Дальнейшая стратегия:
работающий функционал → измерение нагрузки → поиск бесплатного ресурса → оптимизация → безопасная интеграция → проверка → документирование

а не:
ограничение free-tier → урезание функционала

Полная архитектурная политика: docs/FREE-TIER-FULL-FUNCTIONALITY-POLICY-2026-10-07.md.