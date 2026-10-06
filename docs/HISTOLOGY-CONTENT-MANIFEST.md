# HISTOLOGY CONTENT MANIFEST

> Канонический реестр физического контента гистологии для MEDBIOHIM.  
> Обновлено: 2026-10-07.

## 1. Физическое расположение

**Production / SpaceWeb:**

`/public_html/content/histology/`

Схема:

`Supabase Free (metadata) → PHP API → SpaceWeb /public_html/content/histology/`

Большие JPG/PNG/DOCX не обязаны находиться в GitHub или Supabase Storage. Supabase Free используется как БД и слой metadata.

## 2. Структура SpaceWeb

```
/public_html/
└── content/
    └── histology/
        ├── source-materials/
        ├── electronograms/
        │   └── images/
        ├── em/
        ├── 5_Фотографии препаратов/
        ├── 5_#U0424#U0433.../   # фактическое encoded-имя проверяется на сервере
        └── README.md
```

| Каталог | Назначение |
|---|---|
| `source-materials/` | исходные/методические материалы |
| `electronograms/images/` | физические изображения электронограмм |
| `em/` | alias/совместимый путь электронограмм |
| `5_Фотографии препаратов/` | фотографии микропрепаратов |
| encoded-каталог `5_#U...` | дополнительный физический контент; имя не переименовывать без проверки |
| `README.md` | инструкция по media |

## 3. Исходный архив

Источник: `content.zip`

Подтверждённый состав:

- 444 файлов;
- 323 JPG;
- 62 PNG;
- 4 JPEG;
- 52 DOCX;
- `docx-captions.json`;
- `docx-to-image-map.json`;
- `README.md`;
- 389 файлов изображений;
- 207 уникальных наборов байтов после дедупликации.

## 4. Supabase

Таблица trainer cards:

`public.trainer_feed_cards`

Подтверждено:

- **206 trainer cards**;
- **178** карточек микропрепаратов;
- **28** карточек электронограмм.

Ключевые поля связи:

- `subject_slug = histology`;
- `specialty_slug = mbh`;
- `mode_set = electronogram` для EM;
- `source_key`;
- `preparation.imagePath`;
- `plan_module_id`;
- `plan_topic_id`;
- `is_published`.

### Materials

Ранее проверено:

- 80 материалов всего;
- 28 EM;
- 27 `histology-zip-scheme-*`;
- у 28 EM есть captions;
- у этих EM `external_url` ранее был NULL.

Metadata в Supabase сама по себе не доказывает наличие физического файла.

## 5. Пути media

Основной endpoint:

`GET /api/v1/trainers/feed/{id}/image`

Микропрепараты:

`5_Фотографии препаратов/<раздел>/<файл>.jpg`

Электронограммы:

`electronograms/images/<slug>.png`

совместимый alias:

`em/<slug>.png`

Есть исторический пример EM с `histology-em-capillary-20261005` и расширением `.jpeg`. Расширение нельзя менять без проверки реального файла.

## 6. Что считается синхронизацией

Карточка полностью синхронизирована, только если:

1. запись есть в Supabase;
2. `source_key` / `imagePath` корректен;
3. физический файл существует в `/public_html/content/histology/`;
4. PHP route правильно разрешает путь;
5. production HTTP возвращает файл (например HTTP 200);
6. MIME соответствует файлу.

## 7. Статус

| Проверка | Статус |
|---|---|
| Supabase Free как DB/metadata | 🟢 |
| SpaceWeb как physical media | 🟢 |
| `/public_html/content/histology/` существует | 🟢 подтверждено по FTP |
| `source-materials/` | 🟢 |
| `electronograms/` | 🟢 |
| `em/` | 🟢 |
| `5_Фотографии препаратов/` | 🟢 |
| README | 🟢 |
| 206 trainer cards | 🟢 |
| 28 EM metadata/captions | 🟢 |
| все 206 cards сопоставлены с физическими файлами | 🟡 |
| 52 DOCX полностью проверены на SpaceWeb | 🟡 |
| Materials → physical files | 🟡 |
| production HTTP smoke-test всех media | 🟡 |

## 8. Не делать

- Не переносить весь media-архив в бесплатный Supabase только ради хранения.
- Не считать отсутствие JPG/PNG в `public.files` Supabase ошибкой само по себе.
- Не считать GitHub источником истины для больших бинарных файлов.
- Не удалять существующий SpaceWeb `content/histology` при backend deploy.
- Не переименовывать Unicode/encoded-файлы без проверки ссылок.
- Не менять расширение файла только по предположению.
- Не смешивать Histology media с другими предметами.

## 9. Связанные файлы GitHub

- `data/content_packages/histology-mbh-trainer-cards.json` — пакет 206 trainer cards.
- `database/migrations/20260925_fix_histology_feed_source_key.sql` — исправление старых source_key.
- `ROADMAP.md` — архитектура хранения.
- `PHASES_STATUS.md` — статус реализации.

## 10. Следующая контрольная проверка

Выполнить reconciliation:

`content.zip → SpaceWeb files → Supabase trainer_feed_cards/materials → API URLs`

И сформировать список:

- missing files;
- orphan files;
- wrong paths;
- wrong extensions;
- duplicate/alias paths;
- missing Materials links;
- HTTP status;
- MIME type;
- конкретный `trainer_feed_card.id` / `source_key`.

**Этот файл является постоянной точкой отсчёта для будущих проверок Histology media.**
