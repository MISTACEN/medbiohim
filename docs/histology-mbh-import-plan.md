# Гистология — МБХ

## Правило интеграции

Этот пакет дополняет существующий контент. Никакие существующие предметы, карточки, тесты или материалы не удаляются.

## Source of truth

- subject: `histology`
- specialty: `mbh`
- package builder: `tools/build_histology_bundle.py`
- UI trainer: `src/app/trainers/feed/histology/page.tsx`
- API: `/trainers/feed?subject=histology&specialty=mbh`

## Импорт

Builder читает `features.zip`, собирает trainer cards, electronograms, lectures, Word sources и тесты в единый JSON bundle.

Перед повторным импортом необходимо сохранять существующие записи и использовать стабильные `source_key`/ID. Конфликтующие записи обновляются по ключу, новые добавляются.

## Media

Пути изображений сохраняются как source paths. Медиа подключается отдельно через существующий backend media route; отсутствие файла не должно ломать карточку.

## Safety

Для histology backend уже требует specialty `mbh`. Это правило не менять и не ослаблять при последующих дополнениях.


## Медиа из features.zip или content.zip

Импортёр `tools/import_histology_media.py` поддерживает два источника:

- старый `features.zip`: `features/histology-content/photos/**` и `electronograms/images/**`;
- текущий `content.zip`: `content/histology/5_Фотографии препаратов/**`, `electronograms/images/**`, `em/**` и карты подписей.

Запуск из корня репозитория:

```bash
python tools/import_histology_media.py content.zip --out backend/content
python -m unittest tools/test_import_histology_media.py
```

Результат помещается в `backend/content/histology/`, который ожидает PHP media endpoint. Скрипт декодирует старые ZIP-пути вида `#U0424...`, не перезаписывает конфликтующие файлы молча, создаёт SHA-256 manifest и сохраняет алиасы `em/*` для старых карточек. База данных не меняется.

Бинарные изображения не должны попадать в PostgreSQL или в JSON bundle. DOCX-оригиналы из пользовательского архива остаются исходниками и не публикуются как media автоматически; извлечённые подписи доступны в `electronograms/docx-captions.json` и `docx-to-image-map.json`.

Frontend тренажёра использует авторизованный media proxy `/api/v1/trainers/feed/{id}/image`. Перед загрузкой на SpaceWeb проверьте, что каталог `backend/content/histology/` попадает в deployment archive и что PHP-окружение указывает на правильный media root.
