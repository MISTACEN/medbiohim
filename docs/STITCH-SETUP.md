# Stitch: подключение готово

Stitch — источник макетов для редизайна MEDBIOHIM. Подключение настроено и
проверено: аккаунт, MCP, проект и дизайн-система уже на месте.

## Что получилось

| Что | Значение |
|---|---|
| Google-аккаунт | `ryazansevegor@gmail.com` (владелец проекта) |
| Проект Stitch | `MEDBIOHIM` — https://stitch.withgoogle.com/projects/15048681218079585200 |
| Дизайн-система | `assets/df16484ef4f34530b66e6b16a0fc90db`, собрана из `.stitch/DESIGN.md` |
| Инструментов MCP | 18 (`create_project`, `generate_screen_from_text`, `edit_screens`, `create_design_system`, …) |
| Quota project | `cogent-splicer-451718-b0` |
| Локальные креды | `.stitch/adc/` и `.stitch/gcloud/` — в `.gitignore` |

Вам ничего делать не нужно: откройте ссылку на проект — он уже там.

## Как это устроено

Документация Stitch предлагает API-ключ (`X-Goog-Api-Key`), но сервер MCP его
отклоняет:

```
API keys are not supported by this API.
Expected OAuth2 access token or other authentication credentials that assert a principal.
```

Поэтому схема такая:

1. Google Cloud CLI лежит локально в `.stitch/gcloud/` (без установки в систему,
   без прав администратора).
2. `npm run stitch:login` один раз проводит OAuth в браузере и кладёт креды в
   `.stitch/adc/`.
3. Каждый вызов берёт свежий токен у gcloud, поэтому он не истекает через час.
4. Stitch API требует quota project — он записан в ADC, а скрипт отправляет его
   заголовком `x-goog-user-project`.

OAuth-метаданных (`/.well-known/oauth-*`) у MCP-сервера нет, так что «обычный»
OAuth MCP-клиента здесь не сработает — только gcloud.

## Команды

```bash
npm run stitch:check                 # проверка: сервер, инструменты, доступ к проектам
npm run stitch:tools                 # список всех инструментов
node scripts/stitch/mcp.mjs call list_projects '{"filter":"owned"}'
node scripts/stitch/mcp.mjs call generate_screen_from_text '{"projectId":"15048681218079585200","prompt":"..."}'
node scripts/stitch/upload-design.mjs            # перезалить .stitch/DESIGN.md
npm run stitch:install                           # если gcloud потерялся
npm run stitch:login                             # перелогин, если отозвали доступ
```

`npm run stitch:check` на исправном подключении печатает 18 инструментов и
ваш проект.

## Если что-то сломалось

- **`missing_code` при входе.** Кто-то (или скрипт) обратился к
  `http://localhost:8085` во время входа — gcloud принял это за ответ OAuth.
  Просто повторите `npm run stitch:login` и не трогайте порт.
- **`requires a quota project`.** Выполните
  `gcloud auth application-default set-quota-project <project>` (через
  `.stitch/gcloud/google-cloud-sdk/bin/gcloud.cmd`) или задайте
  `STITCH_GCP_PROJECT`.
- **`API has not been used in project … or it is disabled`.** Stitch API нужно
  включить в проекте: `gcloud services enable stitch.googleapis.com`.
  В `cogent-splicer-451718-b0` он уже включён.
- **Токен для IDE.** `.mcp.json` и `.cursor/mcp.json` берут
  `STITCH_ACCESS_TOKEN`, а он живёт час:

  ```bash
  .stitch/gcloud/google-cloud-sdk/bin/gcloud.cmd auth application-default print-access-token
  ```

  Мне это не нужно: `scripts/stitch/mcp.mjs` каждый раз получает свежий токен.

## Браузер и аккаунты

- Вход выполнялся в браузере под Google-аккаунтом `ryazansevegor@gmail.com`.
  Если сессия вылетит — войдите тем же аккаунтом.
- Аккаунт MEDBIOHIM (почта сайта) для Stitch не подходит: нужен Google.
- Тестовый аккаунт я не создавал: регистрация требует вашего подтверждения.
  Скажите, если нужен отдельный — подготовлю.
