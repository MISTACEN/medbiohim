# Портал предмета: источники контента и пересборка

**Обновлено: 17 ноября 2026.** Документ фиксирует, откуда взялось содержимое вкладки
«Портал» на странице предмета и как его пересобрать из исходных папок.

Вкладка «Портал» — не отдельный раздел-хаб, а часть существующей страницы предмета
(`/subjects/[id]`). Наборы для неё лежат статикой в `public/content/portals/` и
загружаются через `src/lib/portalContent.ts`.

## Что откуда взято

| Источник (вне репозитория) | Артефакт в репозитории | Где видно |
| --- | --- | --- |
| `course/bio-lec/topic1…9.html` | `public/content/portals/lectures-bio.json` | предмет `biology`, лекции |
| `course/chem-lec/topic1…2.html` | `public/content/portals/lectures-chem.json` | предметы химии |
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
