# Активные эксперименты (ветка `beta`)

> Ветка **`beta` только для тестов и экспериментов.** Прод = **`main`**.  
> Обновляйте этот файл при старте или закрытии эксперимента.

| Статус | Тема | Ветка | Описание | Начато |
|--------|------|-------|----------|--------|
| 🟡 active | Chemical structure renderers | `beta` | RDKit SVG, Ketcher, 3Dmol, Фишер/Newman/Chair | 2026-09-30 |
| 🟡 active | Reaction editor + mechanism graph | `beta` | Черновик модели реакций | 2026-09-30 |
| ✅ promoted | PubChem resolver + ChemicalMolecule | → `main` | API resolve/health, страница /chemistry | 2026-09-30 |
| ✅ promoted | chemical_* schema + seed | → `main` (SQL files) | Нужно применить на Supabase | 2026-09-30 |

## Как подписать работу

- Коммит на beta: `experiment(chemistry): …` / `test: …` / `wip: …`
- PR в main: явно «promoted from beta experiment»
- Не смешивать прод-фиксы (trainings, orgchem bank) только на beta — их сразу в main
