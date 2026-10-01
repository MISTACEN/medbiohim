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


## Media из features.zip

`features.zip` содержит 206 изображений (178 фотографий препаратов + 28 электронограмм).
Бинарные файлы не должны попадать в PostgreSQL или в JSON bundle. Перед публикацией
backend media нужно извлечь в его `content/`-каталог:

`python tools/import_histology_media.py features.zip --out content`

Скрипт создаёт:
- `content/histology/em/*` для электронограмм;
- `content/histology/photos/5_Фотографии препаратов/.../*` для фотографий.

Frontend тренажёра использует авторизованный media proxy `/api/v1/trainers/feed/{id}/image`.
