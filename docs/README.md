# MEDBIOHIM documentation

## Главные документы

| Документ | Назначение | Статус |
|---|---|---|
| [../ROADMAP.md](../ROADMAP.md) | Единый порядок работ | ✅ актуальный |
| [../PHASES_STATUS.md](../PHASES_STATUS.md) | Текущее состояние фаз | ✅ актуальный |
| [BRANCHES.md](../BRANCHES.md) | main / beta rules | ✅ актуальный |
| [ACTIVE-EXPERIMENTS.md](ACTIVE-EXPERIMENTS.md) | Что находится в beta | ✅ актуальный |
| [platform-concept-medbiohim.md](platform-concept-medbiohim.md) | Общая архитектурная идея | ✅ актуальный |
| [subject-content-matrix.md](subject-content-matrix.md) | Матрица предметов | 🟡 поддерживается |
| [dev-notes.md](dev-notes.md) | Технические правила разработки | ✅ справочный |

## Content / migration

Основные живые источники:
- `database/migrations/`
- `docs/histology-sql-exam-questions-uuid/`
- `docs/histology-sql-tickets/`
- `docs/20260928_sync_histology_em_captions.sql`
- `docs/20260928_dedupe_histology_em_cards.sql`

## Deployment / infrastructure

- [EM-DEPLOY-20261001.md](EM-DEPLOY-20261001.md)
- [SPACEWEB-TRAININGS-AND-SESSIONS.md](SPACEWEB-TRAININGS-AND-SESSIONS.md)
- [SPACEWEB-BOOLEAN-FIX.md](SPACEWEB-BOOLEAN-FIX.md)
- [SYNC_STAMP.md](../SYNC_STAMP.md)

## Chemistry

- [CHEMISTRY-CORE-PLAN.md](CHEMISTRY-CORE-PLAN.md)
- [CHEMISTRY-EMBEDS.md](CHEMISTRY-EMBEDS.md)
- [DEPLOY-CHEMISTRY.md](DEPLOY-CHEMISTRY.md)
- [DEPLOY-ORGANIC-CHEMISTRY.md](DEPLOY-ORGANIC-CHEMISTRY.md)
- [chemical-engine.md](chemical-engine.md)
- [ai-topology.md](ai-topology.md)

## Historical / recovery notes

Historical recovery notes are useful only when debugging an old incident.  
Они не являются текущим планом и не должны дублировать ROADMAP/PHASES_STATUS.

- [DEEP-AUDIT-3-2026-10-04.md](DEEP-AUDIT-3-2026-10-04.md) — третий глубокий проход по скрытым unfinished/legacy следам и live data integrity
