# Автодеплой backend на SpaceWeb — одноразовая настройка (≈5 минут)

После этих двух шагов каждый push в `main`, меняющий `backend/src/**` или
`backend/config/routes/platform.php`, будет сам заливаться на SpaceWeb
(с бэкапом и проверкой). Также можно запускать вручную.

## Шаг 1. Добавить секрет с паролем FTP

1. Откройте **Settings → Secrets and variables → Actions** репозитория.
2. **New repository secret**:
   - Name: `FTP_PASSWORD`
   - Secret: пароль FTP-аккаунта `ryazansev3_logigpt`
3. **Add secret**.

## Шаг 2. Установить workflow-файл

Токен бота не имеет права создавать файлы в `.github/workflows/`,
поэтому файл лежит здесь (`deploy/deploy-backend.yml`) и его нужно
один раз скопировать на место через веб-интерфейс:

1. Откройте `deploy/deploy-backend.yml` → **Raw** → выделите всё и скопируйте.
2. Вкладка **Actions → New workflow → set up a workflow yourself**.
3. Удалите шаблон, вставьте скопированный текст.
4. Имя файла оставьте `deploy-backend.yml` → **Commit changes…** → **Commit directly to the main branch**.

## Запуск

- Первый запуск произойдёт автоматически при коммите из шага 2
  (либо: **Actions → Deploy backend to SpaceWeb → Run workflow**).
- Прогон займёт 1–3 минуты. Зелёная галочка = всё залито и проверено.
- В логе шага **Discover site root on FTP** будет найден путь сайта
  (например `public_html/…`), а в артефактах прогона — бэкап серверной
  копии `backend/src` на 14 дней.

## Что делает workflow

1. Находит корень сайта (ищет `backend/public/index.php`, до 3 уровней вглубь).
2. Скачивает текущую серверную копию `backend/src` + `platform.php` (бэкап).
3. Полностью перезаписывает `backend/src/**` из репозитория (без удаления
   чужих файлов на сервере).
4. Заливает `backend/config/routes/platform.php`; удаляет забытые
   `trainings.payload.*.b64` на сервере.
5. Скачивает залитые файлы обратно и проверяет маркеры исправлений
   (PDO-warning fix, `questions_count`, импорт B2Storage, `getPreferences`).

## Если что-то пойдёт не так

- **Secret not set** — см. шаг 1.
- **backend/public/index.php not found** — структура FTP отличается;
  в логе будет список верхнего уровня, пришлите его.
- Откат: скачайте артефакт `backend-backup-*` из неудачного прогона и
  залейте обратно по FTP (FileZilla) или попросите повторить прогон с ним.

После успешного прогона временный FTP-пароль можно сменить
(и обновить секрет `FTP_PASSWORD`).
