# Документация MEDBIOHIM

**Обновлено: 3 ноября 2026 года.** Начинайте с [единого текущего состояния](CURRENT-STATE-2026-11-03.md) — это согласованный срез архитектуры, фактов, ограничений и приоритетов.

## Текущие источники

- [CURRENT-STATE-2026-11-03.md](CURRENT-STATE-2026-11-03.md) — единый статус проекта.
- [ARCHITECTURE.md](ARCHITECTURE.md) — актуальная схема приложения и API.
- [WORKERS-TOPOLOGY.md](WORKERS-TOPOLOGY.md) — роли Cloudflare Workers.
- [STATUS.md](STATUS.md) — исторический снимок октября, не текущий статус.
- [UNFINISHED-REGISTRY.md](UNFINISHED-REGISTRY.md) — накопленный список задач; каждую старую запись проверять по main.
- [TELEGRAM-BOT-GAP-AUDIT-2026-11-03.md](TELEGRAM-BOT-GAP-AUDIT-2026-11-03.md) — что бот умеет и что осталось.
- [PYRAMID-AND-CHEMISTRY-ROADMAP.md](PYRAMID-AND-CHEMISTRY-ROADMAP.md) — «пирамида знаний» и химия.
- [DOCS-AUDIT-2026-11-03.md](DOCS-AUDIT-2026-11-03.md) — проверка всей документации: ссылки, устаревшее, выводы.

## Корневые рабочие документы

- [ROADMAP.md](../ROADMAP.md) — продуктовые направления.
- [PHASES_STATUS.md](../PHASES_STATUS.md) — фазы и контрольные точки.
- [SYNC_STAMP.md](../SYNC_STAMP.md) — датированные выкладки/проверки.
- [CICD-SETUP.md](../CICD-SETUP.md) — CI/CD; исторические инструкции требуют сверки с текущими workflow.
- [MOGRATION-STATUS.md](../MOGRATION-STATUS.md) — исторический migration snapshot, не показатель текущего процента готовности.

## Как читать аудиты

Документы с датой в имени — снимки на соответствующую дату. Более поздний аудит может закрывать или заменять прежнее наблюдение. Не удаляйте старые отчёты: фиксируйте итоговый статус и ссылку на доказательство. Наличие кода не доказывает deployment; deployment не доказывает runtime acceptance.
