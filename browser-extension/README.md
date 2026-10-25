# MEDBIOHIM Importer 1.2.0

Браузерное расширение (Manifest V3) для ручного сохранения материалов с публичного сайта ДВГМУ (`www.fesmu.ru`), ЕИОС ДВГМУ, NeoFamily Lab и Школы Сеченова в личную библиотеку MEDBIOHIM.

- Читает только открытую страницу и только по нажатию «Разобрать страницу».
- Показывает найденные ссылки; пользователь снимает лишние и подтверждает импорт.
- Ничего не отправляет автоматически, не хранит пароли и не обходит платный доступ.
- Сохраняет заголовок, ссылку, тип, источник, дату публикации и короткое описание.

## Что нового в 1.2.0

- Публичные страницы ДВГМУ (`www.fesmu.ru`) помечаются источником `fesmu` («ДВГМУ»), а не `eios`: это официальный сайт вуза, а не ЕИОС.
- Заголовок карточки читается из атрибутов `area-label` / `data-title` / `title` / `alt` — карточки Bitrix на `www.fesmu.ru` содержат пустую ссылку-картинку, из-за чего новости, объявления и расписание раньше не разбирались.
- Дата `дд.мм.гггг` из карточки сохраняется как `published_at`; несуществующие даты (`31.02.2026`) отбрасываются.
- Сопоставление хостов стало строгим: шаблон `fesmu.ru` больше не совпадает с чужими доменами вида `notfesmu.ru`.

## Сборка

```bash
cd browser-extension
npm ci
npm run build      # dist/
npm run package    # dist/ + ../public/downloads/medbiohim-importer.zip
```

`dist/` — распакованное расширение, `public/downloads/medbiohim-importer.zip` — архив для страницы `/extension`. CI workflow `deploy-browser-extension.yml` собирает проект, проверяет ссылки манифеста, пересобирает архив и загружает artifact.

## Установка

1. Скачайте архив со страницы `/extension` или возьмите `browser-extension/dist`.
2. Откройте `chrome://extensions`, включите режим разработчика.
3. «Загрузить распакованное» → выберите папку.
4. В попапе укажите адрес API (по умолчанию production Worker) и access token MEDBIOHIM, нажмите «Сохранить».

Токен хранится в `chrome.storage.sync` и отправляется только на указанный API.

## API

- `POST /api/v1/integrations/imports` — `{ items: [{ title, url, kind, source, summary?, published_at? }] }`, максимум 50.
- `GET /api/v1/integrations/imports` — свои записи.
- `DELETE /api/v1/integrations/imports/:id` — удалить свою запись.
- Алиасы для старых сборок: `POST /api/v1/integrations/fesmu/import`, `POST /api/v1/integrations/fesmu/dedup`.

Записи хранятся в `site_content` под `extimport:<user id>:<sha256(url)>`; дубликаты одного пользователя пропускаются.

## Структура

```
manifest.json                 MV3, хосты и разрешения
webpack.config.cjs            сборка background/popup/analyzer
src/background/serviceWorker.js  отправка пакета в API, ретраи
src/content/analyzer.js       разбор DOM трёх платформ
src/js/popup.js               настройки, превью, выбор, импорт
src/popup/popup.html          интерфейс попапа
scripts/package.mjs           ZIP без внешних зависимостей
```

## Ограничения

- Селекторы страниц ориентированы на публичную разметку; при редизайне платформы разбор может потребовать правок.
- Импорт не создаёт вопросы или тесты — это ссылки в личной библиотеке.
- Для постоянного хранения нужна отдельная таблица с RLS; сейчас используется `site_content`.
