# Ветки репозитория MEDBIOHIM

| Ветка | Назначение | Деплой |
|-------|------------|--------|
| **`main`** | **Прод.** Стабильный код. Source of truth для Vercel. | Vercel production |
| **`beta`** | **Только тесты и эксперименты.** Песочница. Не прод. | Preview / локально |
| `backup/*` | Снимки перед крупными изменениями | Нет |

## Правила

1. **`beta` = эксперимент.** Рискованная и незавершённая работа — сюда.
2. Коммиты: `experiment: …` / `test: …` / `wip: …`.
3. Готовое → **`main`** (PR или точечный перенос).
4. **Не деплоить beta как production.**
5. Журнал: [docs/ACTIVE-EXPERIMENTS.md](docs/ACTIVE-EXPERIMENTS.md)

Эта ветка **сейчас** используется для экспериментов: structure renderers (RDKit/Ketcher/3Dmol), проекции Фишер/Newman/Chair, reaction editor.
