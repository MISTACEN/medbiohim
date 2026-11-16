# GitHub-каталог: что уже есть и как это использовать

> Проверено через GitHub API 16.11.2026. Звёзды — на эту дату, они меняются. Лицензии: где GitHub показывает «Other», указано «проверить LICENSE» — это не значит «нельзя», это значит «прочитайте условия».
> Полный список фич и как их собирать — в [FEATURE-MAP.md](FEATURE-MAP.md).

---

## 1. Ядро: повторение и карточки

| Репозиторий | ★ | Лицензия | Что даёт | Как использовать | Осторожно |
|---|---:|---|---|---|---|
| [ankitects/anki](https://github.com/ankitects/anki) | 32.8k | AGPL-3.0 | Эталон SRS, FSRS, импорт колод | Как референс алгоритмов и формата; не встраивать в закрытый SaaS | AGPL; десктопный UX |
| [open-spaced-repetition/fsrs4anki](https://github.com/open-spaced-repetition/fsrs4anki) | 4.1k | MIT | FSRS-планировщик, бенчмарки, объяснение модели | Взять формулы/параметры, проверить на своих данных | Jupyter-ноутбуки, не готовая библиотека |
| [open-spaced-repetition/ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | 875 | MIT | FSRS на TypeScript (ESM/CJS/UMD) | **Основной кандидат** для веба: `schedule(card, rating)` | Нужно хранить состояние карточки |
| [open-spaced-repetition/free-spaced-repetition-scheduler](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler) | 738 | проверить | Спецификация FSRS | Понять модель перед внедрением | Не UI |
| [open-spaced-repetition/srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark) | 289 | проверить | Бенчмарк планировщиков | Сравнить свой вариант | Исследовательский код |
| [bestnite/engram](https://github.com/bestnite/engram) | 46 | проверить | Self-hosted SRS на Go: FSRS v6, REST, MCP, PWA | Если нужен готовый сервер повторений | Новый проект, мало форков |

**Вывод:** для «Изучай» — `ts-fsrs` (MIT) + своя таблица `cards`. Anki — источник идей, не зависимости.

---

## 2. LMS: готовая оболочка для курсов

| Репозиторий | ★ | Лицензия | Что даёт | Когда брать | Минусы |
|---|---:|---|---|---|---|
| [moodle/moodle](https://github.com/moodle/moodle) | 7.6k | GPL-3.0 | Всё: курсы, тесты, банк вопросов, роли, оценки, плагины | Нужны преподаватели и ведомости | PHP, тяжёлый UI, «не для студентов» |
| [frappe/lms](https://github.com/frappe/lms) | 3.4k | AGPL-3.0 | Современная LMS на Frappe: курсы, квизы, сертификаты | Небольшой проект, Python-стек | AGPL, меньше экосистема |
| [instructure/canvas-lms](https://github.com/instructure/canvas-lms) | 6.9k | AGPL-3.0 | Промышленная LMS | Большая организация | Ruby, сложно, AGPL |
| [openedx/openedx-platform](https://github.com/openedx/openedx-platform) | 8.2k | AGPL-3.0 | Open edX LMS + Studio | Университетский масштаб | Много сервисов, тяжёлый деплой |
| [discourse/discourse](https://github.com/discourse/discourse) | 48k | GPL-2.0 | Форум/сообщество | Нужны обсуждения, а не лента | Отдельный сервис, Ruby |

**Вывод:** LMS — только если нужен «учительский» контур. Для ежедневной петли студента они слишком тяжёлые. Гибрид: своё ядро + Moodle/Frappe для курсов.

---

## 3. Контент, интерактив, медиа

| Репозиторий | ★ | Лицензия | Что даёт | Как использовать |
|---|---:|---|---|---|
| [h5p/h5p-php-library](https://github.com/h5p/h5p-php-library) | 155 | GPL-3.0 | H5P-контент: интерактивные видео, drag&drop, тесты | Сервер H5P или интеграция с Moodle |
| [tunapanda/h5p-standalone](https://github.com/tunapanda/h5p-standalone) | 347 | MIT | Проигрыватель H5P без H5P-сервера | Встраивать готовые H5P-пакеты в Next.js |
| [ueberdosis/tiptap](https://github.com/ueberdosis/tiptap) | 39k | MIT | Headless rich-text редактор | Редактор конспектов/вопросов |
| [KaTeX/KaTeX](https://github.com/KaTeX/KaTeX) | 20.5k | MIT | Быстрая математика/формулы | Формулы в вопросах и разборах |
| [videojs/video.js](https://github.com/videojs/video.js) | 40.2k | Apache-2.0 | HTML5-плеер, HLS/DASH | Лента/видеоуроки |
| [discourse/discourse](https://github.com/discourse/discourse) | 48k | GPL-2.0 | Форум | Сообщество, вопросы, модерация |

**H5P-лицензии:** контент на h5p.org — CC BY 4.0; код — по репозиториям (часто GPL/MIT). Проверяйте каждый content type.

---

## 4. Химия: редактор, расчёты, 3D

| Репозиторий | ★ | Лицензия | Что даёт | Как использовать |
|---|---:|---|---|---|
| [epam/ketcher](https://github.com/epam/ketcher) | 939 | Apache-2.0 | Профессиональный редактор структур | Рисование молекул/реакций, SMILES/MOL/CDX |
| [rdkit/rdkit](https://github.com/rdkit/rdkit) | 3.7k | BSD-3-Clause | Хемоинформатика: свойства, SMILES, реакции | Серверные расчёты, валидация |
| [rdkit/rdkit-js](https://github.com/rdkit/rdkit-js) | 257 | проверить (BSD?) | RDKit в браузере через WASM | Клиентские расчёты без сервера |
| [openbabel/openbabel](https://github.com/openbabel/openbabel) | 1.4k | GPL-2.0 | Конвертация химических форматов | Импорт SDF/MOL/SMILES |
| [3dmol/3Dmol.js](https://github.com/3dmol/3Dmol.js) | 1k | BSD-3-Clause | WebGL-визуализация молекул | 3D-модели, орбитали, белки |
| [Bowserinator/Periodic-Table-JSON](https://github.com/Bowserinator/Periodic-Table-JSON) | 733 | проверить (обычно MIT) | Данные всех элементов | Таблица Менделеева, карточки |
| [Paivel/reactio-draw](https://github.com/Paivel/reactio-draw) | 48 | проверить | Редактор структур/реакций, CDX/CDXML | Альтернатива Ketcher, новый проект |
| [LluisV/Z-Anatomy](https://github.com/LluisV/Z-Anatomy) | 417 | проверить (CC BY-SA/GPL) | 3D-анатомия на Unity | Анатомический атлас, но Unity-стек |

**Чего нет в открытом виде:** готовый «химический калькулятор на естественном языке» как у Acetyl. Это придётся писать: парсер + RDKit/OpenBabel + SymPy + база реакций.

---

## 5. ИИ-тьютор и RAG

| Репозиторий | ★ | Лицензия | Что даёт | Как использовать |
|---|---:|---|---|---|
| [open-webui/open-webui](https://github.com/open-webui/open-webui) | 158.8k | проверить (BSD-3 + бренд) | Готовый чат-UI, RAG, Ollama/OpenAI | Быстрый ИИ-тьютор, но не учебная петля |
| [Mintplex-Labs/anything-llm](https://github.com/Mintplex-Labs/anything-llm) | 68.3k | MIT | Локальный RAG-воркспейс | Загрузка методичек, чат с цитатами |
| [ollama/ollama](https://github.com/ollama/ollama) | 187.2k | MIT | Локальный запуск моделей | Приватность, офлайн, без API |
| [n8n-io/n8n](https://github.com/n8n-io/n8n) | 210.6k | Sustainable Use (не OSI) | Автоматизация: Telegram, почта, LLM | Пайплайны «PDF → вопросы → ревью» |

**Вывод:** ИИ-тьютор собирается за неделю, но он не заменяет SRS и практику. Лучше — RAG с обязательными цитатами и лимитами.

---

## 6. Инфраструктура, поиск, аналитика

| Репозиторий | ★ | Лицензия | Что даёт | Как использовать |
|---|---:|---|---|---|
| [supabase/supabase](https://github.com/supabase/supabase) | 115k | Apache-2.0 | Postgres + Auth + Storage + Realtime | Основа «Изучай» |
| [coollabsio/coolify](https://github.com/coollabsio/coolify) | 66.1k | Apache-2.0 | Self-hosted PaaS, 360+ сервисов | Развернуть всё на своём VPS |
| [meilisearch/meilisearch](https://github.com/meilisearch/meilisearch) | 59.9k | MIT + BUSL-1.1 (EE) | Быстрый поиск | Поиск по темам/вопросам |
| [typesense/typesense](https://github.com/typesense/typesense) | 27.1k | GPL-3.0 | Поиск, typo-tolerance | Альтернатива Meilisearch |
| [PostHog/posthog](https://github.com/PostHog/posthog) | 40.8k | проверить (MIT + EE) | Аналитика, воронки, replay | Метрики D7, активация |
| [umami-software/umami](https://github.com/umami-software/umami) | 40.2k | MIT | Простая privacy-аналитика | Быстрый старт без cookie-ада |
| [pocketbase/pocketbase](https://github.com/pocketbase/pocketbase) | 61.6k | MIT | Backend в одном файле | Маленький проект; **репозиторий архивирован** |
| [grammyjs/grammY](https://github.com/grammyjs/grammY) | 3.8k | MIT | Telegram-бот фреймворк | Напоминания, карточка дня |

---

## 7. Симуляции и графика (базовые библиотеки)

Это не «готовые симуляции», а то, на чём их собирают. Звёзды не проверялись в этом аудите — проверьте актуальные.

| Библиотека | Лицензия | Для чего |
|---|---|---|
| three.js | MIT | 3D-сцены, молекулы, анатомия |
| @react-three/fiber | MIT | Three.js в React |
| matter.js | MIT | 2D-физика |
| phaser | MIT | 2D-игры/сцены |
| fabric.js | MIT | Canvas-редактор |
| konva | MIT | 2D-Canvas-сцены |
| p5.js | LGPL-2.1 | Скетчи/визуализации |
| d3 | ISC | Графики, деревья, схемы |
| @xyflow/react (React Flow) | MIT | Дерево навыков, графы связей |
| framer-motion | MIT | Анимации переходов |

**Готовые симуляции:**
- **PhET** — HTML5-симуляции, файлы CC BY 4.0, исходники в основном MIT/GPL; PhET-iO — нет. Можно встраивать с атрибуцией.
- **ChemCollective** — виртуальные лаборатории, лицензия **CC BY-NC-ND 3.0**: нельзя коммерчески и нельзя изменять. Только вдохновение/ссылка, не форк.
- **LabXchange** — библиотека OER, полезно для идей и ссылок.

---

## 8. Что искать дальше самому

Готовые запросы для GitHub:

```
spaced repetition web app stars:>1000
fsrs scheduler language:TypeScript
quiz platform self-hosted stars:>500
moodle plugin gamification
h5p content type [topic]
chemistry education simulation
medical education quiz open source
anatomy 3d webgl open source
telegram bot quiz spaced repetition
nextjs supabase flashcards
```

**Фильтры:** `license:mit`, `license:apache-2.0`, `pushed:>2026-01-01`, `archived:false`.

---

## 9. Чего на GitHub нормально нет

1. **Готового аналога «Школы Сеченова» целиком** — это продукт, а не репозиторий.
2. **Готового «Изучай»** — придётся собирать.
3. **Хорошего SRS-UI для вуза** — Anki не про это, Moodle не про это.
4. **Химического калькулятора на естественном языке** — только компоненты.
5. **Библиотеки симуляций по гистологии/патанатомии** — контент придётся делать/лицензировать.
6. **Готовой геймификации «серия + лига + квесты»** — только плагины LMS или писать.

---

## 10. Минимальный набор для старта

Если брать только 7 репозиториев:

1. `supabase/supabase` — база и auth.
2. `open-spaced-repetition/ts-fsrs` — повторение.
3. `ueberdosis/tiptap` — редактор контента.
4. `KaTeX/KaTeX` — формулы.
5. `grammyjs/grammY` — Telegram.
6. `umami-software/umami` — аналитика.
7. `coollabsio/coolify` — деплой (если свой VPS).

Этого достаточно, чтобы проверить петлю. Химия, H5P, ИИ и симуляции — следующим слоем.