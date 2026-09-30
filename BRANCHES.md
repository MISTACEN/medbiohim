# Ветки репозитория MEDBIOHIM

| Ветка | Назначение | Деплой |
|-------|------------|--------|
| **`main`** | **Прод.** Стабильный код. Source of truth для Vercel и согласованных релизов. | Vercel production |
| **`beta`** | **Только тесты и эксперименты.** Песочница. Не прод. Может ломаться, расходиться с main. | Preview / локально |
| `backup/*` | Снимки перед крупными изменениями | Нет |

## Правила (постоянные)

1. **`beta` = эксперимент.** Любая незавершённая или рискованная работа — сначала на `beta`.
2. **Коммиты на `beta`** по возможности помечают суть: `experiment: …`, `test: …`, `wip: …`.
3. **На `main`** попадает только то, что готово к проду: через PR или точечный перенос файлов.
4. **Не деплоить `beta` как production** SpaceWeb / основной домен.
5. Документ **[docs/ACTIVE-EXPERIMENTS.md](docs/ACTIVE-EXPERIMENTS.md)** — что сейчас крутится на `beta` (обновлять при старте/закрытии эксперимента).

## Что уже перенесено с beta → main (2026-09-30)

- Chemical engine: PubChem resolver, `ChemicalMolecule`, `/api/chemistry/*`, `/chemistry`
- SQL: `chemical_engine_*.sql` (применить на Supabase отдельно)

## Что остаётся экспериментом на beta

- RDKit.js / Ketcher / 3Dmol.js UI
- Рендереры Фишер / Haworth / Newman / Chair
- Редактор реакций, structure-answer checker
