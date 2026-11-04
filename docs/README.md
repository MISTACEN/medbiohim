# Документация MEDBIOHIM

**Обновлено: 4 ноября 2026 года.** Начинайте с [единого текущего состояния](CURRENT-STATE-2026-11-03.md) — это датированный срез архитектуры, фактов, ограничений и приоритетов. Перед изменениями обязательно сверяйте актуальный `main`.

## Инструкции ИИ-агентов

- [AGENTS.md](../AGENTS.md) — корневые правила.
- [AGENT-ARCHITECTURE.md](../AGENT-ARCHITECTURE.md) — координатор, независимые агенты и subagents.
- [AGENT-OWNERSHIP.md](../AGENT-OWNERSHIP.md) — матрица владения файлами.
- [AGENT-TASK-PROTOCOL.md](../AGENT-TASK-PROTOCOL.md) — задания, изоляция, patch и интеграция.
- [API-CONTRACTS.md](../API-CONTRACTS.md) — межслойные контракты.
- [.agents/](../.agents/README.md) — инструкции координатора и специализированных ролей.

## Текущие источники

- [CURRENT-STATE-2026-11-03.md](CURRENT-STATE-2026-11-03.md) — единый статус проекта на указанную дату.
- [ARCHITECTURE.md](ARCHITECTURE.md) — актуальная схема приложения и API.
- [WORKERS-TOPOLOGY.md](WORKERS-TOPOLOGY.md) — роли Cloudflare Workers.
- [STATUS.md](archive/STATUS.md) — исторический снимок октября, не текущий статус.
- [UNFINISHED-REGISTRY.md](UNFINISHED-REGISTRY.md) — накопленный список задач; каждую старую запись проверять по main.
- [TELEGRAM-BOT-GAP-AUDIT-2026-11-03.md](TELEGRAM-BOT-GAP-AUDIT-2026-11-03.md) — что бот умеет и что осталось.
- [PYRAMID-AND-CHEMISTRY-ROADMAP.md](PYRAMID-AND-CHEMISTRY-ROADMAP.md) — «пирамида знаний» и химия.
- [DOCS-AUDIT-2026-11-03.md](DOCS-AUDIT-2026-11-03.md) — проверка документации: ссылки, устаревшее, выводы.

## Корневые рабочие документы

- [ROADMAP.md](../ROADMAP.md) — продуктовые направления.
- [PHASES_STATUS.md](../PHASES_STATUS.md) — фазы и контрольные точки.
- [SYNC_STAMP.md](../SYNC_STAMP.md) — датированные выкладки/проверки.
- [CICD-SETUP.md](../CICD-SETUP.md) — CI/CD; исторические инструкции требуют сверки с текущими workflow.
- [MOGRATION-STATUS.md](../MOGRATION-STATUS.md) — исторический migration snapshot, не показатель текущего процента готовности.

## Архив

Датированные аудиты, pass-отчёты и handoff (2026-10 и ранее) перенесены в `docs/archive/`.
Они остаются историческим доказательством, но не описывают текущий `main`.

## Как читать аудиты

Документы с датой в имени — снимки на соответствующую дату. Более поздний аудит может закрывать или заменять прежнее наблюдение. Не удаляйте старые отчёты: фиксируйте итоговый статус и ссылку на доказательство. Наличие кода не доказывает deployment; deployment не доказывает runtime acceptance.
