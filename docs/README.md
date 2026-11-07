# Документация MEDBIOHIM

**Обновлено: 7 ноября 2026 года.** Документация консолидирована до трёх главных документов + технических контрактов. Старые аудиты, статусы и планы — в [archive/](archive/) или удалены.

## Три главных документа

1. **[../PROJECT-MAP.md](../PROJECT-MAP.md)** — где что лежит: структура по слоям, спорные и требующие решения места, монолиты-кандидаты.
2. **[../ROADMAP.md](../ROADMAP.md)** — единый план: все задачи из всех списков в 14 этапах со статусами (✅/🟡/❌/🔍), Задача A (монолиты), Задача B (движок v2), порядок дальнейшей работы.
3. **[HISTORY.md](HISTORY.md)** — сжатая история работ по датам.

## Технические контракты (живые)

- [WORKERS-TOPOLOGY.md](WORKERS-TOPOLOGY.md) — топология воркеров (LOCKED): medbiohim-api = прод, shadow = fallback, telegram = бот.
- [COOKIES-RFC-E1.md](COOKIES-RFC-E1.md) — cookie-транспорт авторизации (упомянут в коде прокси).
- [ARCHITECTURE.md](ARCHITECTURE.md) — схема приложения и API.
- [architecture/SHARED-COMPONENT-REGISTRY.md](architecture/SHARED-COMPONENT-REGISTRY.md) + [architecture/registry/](architecture/registry/) — реестр общих компонентов (контракт, проверяется тестом).

## Инструкции ИИ-агентов

- [../AGENTS.md](../AGENTS.md) — корневые правила.
- [../AGENT-ARCHITECTURE.md](../AGENT-ARCHITECTURE.md), [../AGENT-OWNERSHIP.md](../AGENT-OWNERSHIP.md), [../AGENT-TASK-PROTOCOL.md](../AGENT-TASK-PROTOCOL.md) — роли, владение файлами, протокол задач.
- [../API-CONTRACTS.md](../API-CONTRACTS.md) — межслойные контракты.

## Архив

[archive/](archive/) — датированные аудиты, статусы, планы и гайды (перенесены 2026-11-07). Историческая ценность есть, актуальности — нет: сверять с main обязательно.
