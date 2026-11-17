# Портал предмета: источники контента и пересборка

**Обновлено: 18 ноября 2026.** Документ фиксирует, откуда взялось содержимое вкладки
«Портал» на странице предмета и как его пересобрать из исходных папок.

Вкладка «Портал» — не отдельный раздел-хаб, а часть существующей страницы предмета
(`/subjects/[id]`). Наборы для неё лежат статикой в `public/content/portals/` и
загружаются через `src/lib/portalContent.ts`.

## Что откуда взято

| Источник (вне репозитория) | Артефакт в репозитории | Где видно |
| --- | --- | --- |
| `course/bio-lec/topic1…9.html` | `public/content/portals/lectures-bio.json` | предмет `biology`, лекции |
| `course/chem-lec/topic1…2.html` | `public/content/portals/lectures-chem.json` | предметы химии |
| Травень Т.1–Т.3 (PDF) + канон курса Тюкавкиной | `public/content/portals/lectures-chem-organic.json` (модули `scripts/organic-lectures/org-*.mjs`, сборка `scripts/build-organic-lectures-authored.mjs`) | предметы `organic_chemistry` и `chemistry_organic_physical`, блок «lecturesOrganic» |
| Конспекты физики (DOCX, `Desktop/вуз/документы/матиматика и физика`) | `lectures-phys.json` — 10 лекций (колебания, циклы, поверхностное натяжение, волны, МКТ, формулы), конфиг `scripts/phys-lectures.config.json` | предмет `physics`, вкладка «Портал» |
| Конспекты латыни (DOCX, `Desktop/вуз/документы/англ и латин`) | `lectures-latin.json` — 10 лекций (лексминимумы, афоризмы, диагнозы, фарма, элементы, растения), конфиг `scripts/latin-lectures.config.json` | `/latin`, вкладка «Конспекты» |
| PPTX-презентации физики (там же) | `lectures-phys.json` — +3 лекции (слайды + картинки в `public/content/lectures-assets/`), сборка `node scripts/build-pptx-lectures.mjs scripts/phys-presentations.config.json public/content/portals/lectures-phys.json` | предмет `physics`, вкладка «Портал» |
| Конспекты математики (DOCX, там же) | `lectures-math.json` — +4 лекции (векторы, СЛАУ, пределы, матрицы), конфиг `scripts/math-lectures.config.json` | предмет `math`, вкладка «Портал» |
| Конспекты биологии (DOCX, `Desktop/вуз/документы/биология`) | `lectures-bio.json` — 16 лекций (генетика, цитология, эмбриология, экология), конфиг `scripts/bio-lectures.config.json`, сборка `node scripts/build-chem-lectures.mjs scripts/bio-lectures.config.json public/content/portals/lectures-bio.json` | предмет `biology`, вкладка «Портал» |
| «Сборник тестов. Часть I» (tests.json) | `mc-organic-part1-*.json` — темы 1.1–1.4 целиком (122 вопроса), сборка `scripts/build-chemistry-mc-part1-full.mjs` | MC-тренажёры химии |
| chem2/chem3 (распознанные сканы) | `mc-chem2-*.json`, `mc-chem3-*.json` — 133 вопроса с верифицированными ответами (`scripts/chem23-answers.mjs`, сборка `scripts/build-chem23-mc.mjs`) | MC-тренажёры химии |
| B2 `medbiohim-files` (медиа-манифест) | `public/content/library-media.json` (`scripts/build-library-media.mjs`) + раздача `/api/media/<key>` (подписанные ссылки) | `/library`, вкладка «Облачный архив» |
| `course/hoba/*` | `public/content/portals/hoba-theory.json`, `hoba-practical.json`, `hoba-tasks.json` | предмет `inorganic_chemistry`, вкладка «Коллоквиум» |
| `course/biotestkr/test1…4.js` | `tests[parasitology-test1…4]` в `parasitology-tests.json` | предмет `biology`, таблицы протистов/гельминтов |
| `на сайт/паразиты/script.js` | `tests[parasitology-helminths, parasitology-arthropods]` + `quiz` | предмет `biology`, режимы «Таблица», «Экзамен», «Контрольная» |
| `на сайт/вопросы.txt` | `public/content/portals/mc-biology-parasitology-arthropods-mc.json` + запись в `mc-index.json` | предмет `biology`, MC-тесты |
| `паразиты` (латынь, рецепты) | `public/content/portals/latin-recipes.json` | латынь |
| химия-SDF | `public/content/portals/chem-sdf.json` | химия, режим `sdf` |

Старые наборы `parasitology-test1…4` сохранены без изменений — это контент из
`biotestkr`, он не пересекается с новыми наборами по видам.

## Банк паразитологии: состав

`public/content/portals/parasitology-tests.json` — 6 тестов, 88 строк:

- `parasitology-test1…4` — старые таблицы (14 + 9 + 9 + 9 строк, колонки типа/вида/морфологии).
- `parasitology-helminths` — 18 видов (трематоды, цестоды, нематоды), 8 диагностических параметров.
- `parasitology-arthropods` — 29 видов членистоногих, 8 параметров + 87 вопросов КР (`quiz`).

Тип банка описан в `src/lib/portalContent.ts` (`PortalMatchingTest.quiz`), интерфейс —
`src/components/portals/MatchingTrainer.tsx`: режим «Контрольная» появляется только у
наборов, где есть `quiz`.

## MC-банк паразитологии (членистоногие)

`public/content/portals/mc-biology-parasitology-arthropods-mc.json` — 59 вопросов с четырьмя
вариантами и подтверждённым ответом, 15 тем-видов (клещи, вши, блохи, комары).
Показывается в предмете «Биология» через `LegacyMCTests` вместе с остальными MC-тестами
(`subjectId: biology`).

Источник `вопросы.txt` содержит две части: с ответами и тот же набор без ответов.
Парсер берёт только вопросы с подтверждённым `Правильный ответ: X`, поэтому дубль
отбрасывается сам. Второй части без ответов в банк не попадает.

```bash
node scripts/build-parasitology-mc.mjs \
  "/path/to/на сайт/вопросы.txt" \
  public/content/portals/mc-biology-parasitology-arthropods-mc.json \
  public/content/portals/mc-index.json
```

## Пересборка

Генератор читает исходный `script.js` (данные `allParasites`) и перезаписывает два
набора в банке, не трогая старые четыре:

```bash
node scripts/build-parasitology-bank.mjs \
  "/path/to/на сайт/паразиты/script.js" \
  public/content/portals/parasitology-tests.json
```

Скрипт:

- выполняет только блок данных из `script.js` (до `function generateOptions`) в `vm`,
  UI-код исходника не исполняется;
- дедуплицирует виды по `id` (в источнике `haemaphysalis` и `dermacentor` повторяются),
  оставляя запись с наибольшим числом заполненных полей;
- помечает виды контрольной работы суффиксом `· КР` в названии;
- переносит вопросы КР в `quiz` (текст, варианты, правильный ответ).

## Что сознательно не влито

- `medbiohim-library-archive/` (378 МБ, 423 png лекций + 5 pdf) — снятый с деплоя архив
  `public/library` от 2026-11-04: он переполнял лимит Vercel (21.99 / 10 ГБ). PDF уже в
  хранилище и таблице `materials`, картинки лекций нигде не используются. Возвращать папку
  в `public/` нельзя — вернётся превышение лимита.
- `bio-topic8` (страница `course/biology.html`) — это легаси-хаб с навбаром, модалками
  регистрации/входа и ссылками на старые пути. В архиве лекций он удалён: скрипты внутри
  `dangerouslySetInnerHTML` не исполняются, поэтому модалки мертвы, а хаб противоречит
  интеграции в существующие разделы.
- Интерактивный калькулятор `course/chemlab/lab1.html` (таблица + 5 графиков на Chart.js)
  в архивной лекции не работает по той же причине — скрипты не запускаются. Вместо мёртвых
  кнопок оставлен конспект с формулами и порядком работы, а интерактив ведёт в реальную
  `/chemistry/lab` (титрование, Нернст, Бугер–Ламберт–Бер). Если нужен именно этот опыт —
  его надо переносить в React-компонент, а не вставлять HTML.

- `trainer/` — прототип на Preact (`components.jsx`, `data.js`); карточки синтетические
  (биология/русский/физика школьного уровня), своей предметной ценности нет.
- `stitch_/` — 12 HTML-макетов дизайна (скриншоты), не контент.
- Крупные медиа: два mp4 по гистологии (~1 ГБ), `химия.zip` (352 МБ), атласы
  71–101 МБ, `*.tar`/`*.rar` (700 МБ). По аудиту от 25.10.2026 они идут в Backblaze B2
  (`B2_KEY_ID` / `B2_APPLICATION_KEY` / `B2_BUCKET`), загрузка требует ключей и
  отдельного разрешения — в `public/` их класть нельзя.

## Лекции по химии из DOCX

Конспекты химии приходят в Word, а читать их на сайте нужно без скачивания файлов.
`scripts/build-chem-lectures.mjs` разбирает `word/document.xml` через `jszip` (без новых
зависимостей) и собирает HTML-фрагменты: заголовки → `h2/h3` (в этих docx нет стилей,
уровень определяется по нумерации «1.2.» и капсу), абзацы, списки, таблицы, жирный/курсив
и формулы Office Math (`m:t`) → `code`.

```bash
node scripts/build-chem-lectures.mjs scripts/chem-lectures.config.json
```

Конфиг — массив `{ file, id, title }`; существующая лекция с тем же `id` заменяется.
Источники в `scripts/chem-lectures.config.json` (папки `документы/химия` на рабочем столе).

Важно: `sanitizeLectureHtml` в `LectureRenderer` теперь разрешает `table/thead/tbody/tr/th/td`,
`code/pre`, `sup/sub`, `dl/dt/dd` и `h5/h6` — раньше таблицы и формулы вырезались, и химические
конспекты теряли и таблицы свойств, и индексы вида H₂SO₄.

## Оценочные материалы и обзоры модулей (hoba)

`hoba/pages/criteria.html` и `hoba/modules/module1..5.html` — «Критерии оценки» и обзоры
пяти модулей. На сайте это `public/content/portals/hoba-extra.json` и вкладка «Оценка»
в блоке неорганической химии, собирается скриптом:

```bash
node scripts/build-hoba-extra.mjs "<путь>/hoba"
```

Скрипт берёт только содержательные секции (`<main>` для критериев, `#info-tab` для модулей)
и вырезает навбар, кнопки, счётчики прогресса, фильтры и ссылки на старые `.html` — всё
это в React не работает. Не перенесены: `hoba/pages/templates.html` (рекламный хаб-лендинг)
и `generator.html` (интерактивный калькулятор теплоты нейтрализации — нужен React-компонент,
а не HTML).

## Лабораторные по органике (конспекты к работам)

Методичка + разбор опытов → две веб-лекции в `lectures-chem.json`:

- `chem-lab-alcohols-phenols-ethers` — спирты, фенолы, простые эфиры (опыты 9.1–9.5, 10.3, 11.1–11.3, техника безопасности, шпаргалка уравнений);
- `chem-lab-acid-base` — кислотно-основные свойства (опыты 5.1–5.6).

```bash
node scripts/build-chem-labs.mjs   # контент: scripts/chem-labs.content.mjs
```

Уравнения пишутся LaTeX'ом в `$$…$$` и рисуются KaTeX (CDN в `LectureRenderer`),
поэтому фото схем из методички не нужны. Важно: санитайзер лекций сохраняет только
известные классы (`lec-*`, `mermaid`, `katex`, `formula`, `chem-*`) — без этого блоки
`lec-math` теряли класс и формулы просто не рендерились.

## Тесты по органике «Сборник часть I»

`Сборник тестов Часть I/tests.json` → 4 банка MC-тестов (53 вопроса с проверяемыми
ответами) в индексе `mc-index.json`.

```bash
node scripts/build-chemistry-mc.mjs "<путь>/Сборник тестов Часть I/tests.json"
```

Важно по формату: загрузчик портала (`loadMcTest`) читает `/content/portals/mc-<id>.json` —
файл обязан называться именно так (`mc-biology-parasitology-arthropods-mc.json` — исторический
случай, где `-mc` уже входит в id). `answer` в источнике — номер варианта с единицы,
в банке хранится `correct` с нуля.

## Сборник, часть II: открытые вопросы

`node scripts/build-chemistry-mc-part2.mjs "<путь>/tests.json"` — темы 3.1 (алканы)
и 3.6 (амины) в формате `kind:"text"` (ввод ответа, `acceptedAnswers`, эталон после проверки).

Из 41 + 43 вопросов части II импортировано только 10: у остальных в источнике `answer: null`
(эталоны только на сканах таблицы ключей), поэтому сверять ответ было бы нечем. Вопросы
`kind:"single"` и `match` со сканов не импортируются до появления распознанных ключей.

## Аудит архивного контента

```bash
node scripts/audit-portal-content.mjs   # код выхода 1, если что-то найдено
```

Скрипт только читает `public/content/portals/*.json` и ловит три класса дефектов, которые
уже встречались: легаси-разметка (навбар, модалки входа, кнопки, `<script>`, `onclick`),
интерактивные блоки без работающих скриптов и ссылки на старые `.html`-страницы.
Текущий прогон: чисто.

## Медиа для B2: готовый манифест

Крупные файлы не кладутся в `public/` и не коммитятся. Для них собран манифест
`docs/media-upload-manifest.json`: 11 уникальных файлов, 1.93 ГБ, с размером, MIME,
sha256 и предложенным объектным ключом `library/<предмет>/<slug>.<ext>`.

```bash
node scripts/build-media-manifest.mjs "<папка 1>" "<папка 2>" --out=docs/media-upload-manifest.json
```

Скрипт только читает файлы: ничего не загружает и не меняет. Дубли отбрасываются по
sha256 — в исходных папках один и тот же файл лежит в нескольких копиях (в текущем
прогоне пропущено 7 копий). Порог — 20 МБ; мелкое идёт в `public/library`.

Загружать в бакет нужно существующим путём проекта (`B2_KEY_ID`, `B2_APPLICATION_KEY`,
`B2_BUCKET`, `B2_ENDPOINT` в secrets Worker'а; загрузка — `integrations/cloudflare-api/src/file-upload.js`),
а не самодельным клиентом из репозитория.

## Проверки

```bash
npm run typecheck          # tsc --noEmit
npm run lint               # 0 errors (warnings — унаследованные)
npm run build              # next build
```

Проверено 17.11.2026: банк отдаётся по `/content/portals/parasitology-tests.json`
(200, 103 КБ), в браузере видны наборы «Гельминты · 18 видов» и
«Членистоногие · 30 видов», режим «Контрольная · 87» показывает вопросы и сразу
проверяет ответ. MC-банк `biology-parasitology-arthropods-mc` появляется
в списке тестов биологии (59 вопросов), выбор варианта учитывается в счётчике
«Отвечено N из 59».

Полный набор проверок: `npm run test:unit` (710 тестов в 67 файлах), `npm test`
(335 тестов), включая новый `src/components/portals/__tests__/MatchingTrainer.test.tsx`
на режим «Контрольная» (5 тестов).

Страница `/subjects/biology` требует авторизации: без входа вкладка «Портал» не
рендерится (401 от `/api/v1/subjects/biology`), поэтому UI проверялся на временном
стенде с тем же компонентом.
