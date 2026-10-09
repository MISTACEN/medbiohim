# MEDBIOHIM — единый чек-лист проверки GitHub, production и ошибок

**Дата:** 2026-10-10  
**Главный источник кода:** `main`  
**Production frontend:** https://medbiohim.vercel.app  
**Назначение:** один повторяемый список проверок после каждого крупного исправления и перед тем, как считать функцию готовой.

> Важно: зелёный Vercel deployment не доказывает, что PHP на SpaceWeb обновлён, тесты прошли, файлы физически существуют или авторизованный сценарий работает. Статус DONE разрешён только после проверки целевого окружения и фиксации результата.

## 0. Правила проведения проверки

- [ ] Зафиксировать commit SHA и deployment ID перед началом.
- [ ] Не запускать массовые UPDATE/DELETE, импорт или дедупликацию учебных данных без read-only сверки и backup.
- [ ] Не публиковать в issue, логах и скриншотах пароли, JWT, cookies, Supabase service/secret key, FTP credentials, персональные данные студентов.
- [ ] Для каждого дефекта сохранить: URL/endpoint, время с часовым поясом, роль пользователя (без email/ID), шаги воспроизведения, ожидаемое и фактическое поведение, HTTP status/request ID, скриншот или redacted log.
- [ ] Проверять обе роли там, где есть ограничения доступа: участник МБХ и пользователь без доступа к МБХ.
- [ ] После исправления повторить и исходный сценарий, и соседние регрессионные сценарии.

## 1. GitHub Actions — runner, jobs, логи

Сначала открыть вкладку Actions: https://github.com/MISTACEN/medbiohim/actions

- [ ] Последний запуск **MEDBIOHIM code checks** на текущем `main` завершился `success`.
- [ ] В каждом job есть реальный runner, не `runner_id=0`; список шагов не пуст.
- [ ] Проверить отдельно frontend и backend jobs; не путать сбой выделения runner с ошибкой команды.
- [ ] В логах подтверждены этапы install, audit, TypeScript, production build, PHP lint и route-registration smoke.
- [ ] **Build SpaceWeb backend archive** создаёт артефакт для точного commit SHA.
- [ ] **Deploy backend to SpaceWeb** запускается только при наличии секрета `FTP_PASSWORD`, выполняет pre-deploy checks и подтверждает post-deploy smoke.
- [ ] Workflow не печатает секреты; при ошибке сохраняет понятную диагностику без credentials.
- [ ] Для каждого результата записать ссылку на run и SHA.

Последние workflow:

- [MEDBIOHIM code checks](https://github.com/MISTACEN/medbiohim/actions/workflows/code-check.yml)
- [MEDBIOHIM smoke](https://github.com/MISTACEN/medbiohim/actions/workflows/smoke.yml)
- [Build SpaceWeb backend archive](https://github.com/MISTACEN/medbiohim/actions/workflows/build-spaceweb-archive.yml)
- [Optional integrations checks](https://github.com/MISTACEN/medbiohim/actions/workflows/optional-integrations-check.yml)
- [Deploy backend to SpaceWeb](https://github.com/MISTACEN/medbiohim/actions/workflows/deploy-backend.yml)

Если run завершился за секунды, `runner_id=0`, `steps=[]` и без логов, пометить как **runner/dispatch failure**; не заявлять, что код прошёл или провалил тесты.

## 2. Статические проверки и сборка

Запускать в GitHub Actions либо локально из корня репозитория:

```bash
npm install --no-audit --no-fund
npm run typecheck
npm run lint
npm run predeploy:audit
npm run build
```

Для PHP:

```bash
find backend -type f -name '*.php' -print0 | xargs -0 -n1 php -l
```

Дополнительно проверить:

- [ ] PHP route-registration smoke загружает `Medbiohim\\Http\\Router` и регистрирует маршруты без fatal error.
- [ ] Нет повторяющихся пар HTTP method + route.
- [ ] Нет несуществующих импортов, неопределённых методов/классов, конфликтов типов и неиспользуемых legacy-путей.
- [ ] TypeScript проверяется отдельно: текущая конфигурация Next.js может пропускать TS-ошибки во время production build, поэтому один только статус Vercel недостаточен.
- [ ] ESLint запускается отдельно и действительно анализирует файлы; успешная команда без проверки файлов не считается результатом.
- [ ] Все новые миграции проверены на повторное применение, права доступа и безопасный rollback.
- [ ] Изменения схемы БД не требуют ручных действий, не описанных в migration/runbook.

## 3. Production deployment: Vercel → SpaceWeb → Supabase

- [ ] Vercel production deployment имеет состояние `READY` и ожидаемый commit SHA.
- [ ] В response headers `X-Medbiohim-Build` соответствует ожидаемому build, если заголовок доступен.
- [ ] `SPACEWEB_API_ORIGIN` настроен на серверную переменную окружения; он не попадает в клиентский bundle.
- [ ] `GET /api/v1/health` возвращает ожидаемый JSON и HTTP 200.
- [ ] SpaceWeb health/version или deployment marker подтверждает фактически установленный PHP commit/version.
- [ ] После деплоя проверены HTTP status, response body, content-type и request ID; не только факт загрузки страницы.
- [ ] Проверено, что fallback на альтернативный API path не маскирует настоящую 500/401 ошибку и не отправляет mutation повторно.
- [ ] При сбое SpaceWeb frontend показывает понятную ошибку, не зависает бесконечно и не выдаёт фальшивый успех.

## 4. Авторизация и роли

Проверить в отдельной сессии каждого типа пользователя, не используя чужие реальные учётные данные.

- [ ] Вход с корректными данными → `/api/v1/me` → dashboard.
- [ ] Неверный пароль не раскрывает наличие аккаунта сверх принятой политики.
- [ ] Logout действительно удаляет локальную сессию; защищённый API после logout возвращает 401.
- [ ] Отсутствующий, просроченный или поддельный Bearer token не даёт доступ.
- [ ] Студент не может вызвать admin endpoints, изменить себе роль или обойти group/specialty scope.
- [ ] Участник другой группы не видит закрытые домашние задания, отправки и результаты.
- [ ] CORS, redirects и cookie/session поведение проверены в Safari и Chromium.
- [ ] API ошибки не возвращают stack trace, SQL, environment values или secret key.

## 5. Тренажёры гистологии и конфиденциальность ответов

Проверять в первую очередь после изменений Pass 42–44.

- [ ] До ответа в Network/JSON отсутствуют правильный ответ, explanation, correctness flags и ключи правильных вариантов.
- [ ] Нельзя прочитать answer keys через прямой запрос к базовой таблице `trainer_feed_cards` от `anon`/обычного `authenticated` клиента.
- [ ] Публичная безопасная view `trainer_feed_cards_public` показывает только разрешённые карточки и не раскрывает grading fields.
- [ ] Участник МБХ видит опубликованные карточки гистологии.
- [ ] Пользователь без активного доступа МБХ не получает закрытые карточки через feed, detail, image или ответный endpoint.
- [ ] Отправка ответа оценивается сервером через `submit_trainer_feed_answer`; клиент не может прислать `correct=true` или самостоятельно назначить балл.
- [ ] Правильный ответ и объяснение доступны после ответа/пропуска согласно правилам тренажёра.
- [ ] MCQ correct, MCQ incorrect, free-text, skipped, preparation и electronogram сценарии завершаются без потери review.
- [ ] Созданная тренировка сохраняет snapshot вопроса, но не выдаёт answer keys до отправки.
- [ ] Проверены invalid card ID, invalid option ID, пустой текст, повторный submit, слишком большое время ответа и невалидный JSON.
- [ ] Не появилось регрессии: атлас всё ещё показывает нужные названия и подписи; ограничение применяется к ответам/закрытым полям, а не ломает учебную карточку.

## 6. Тесты, билеты и оценивание

- [ ] Опубликованный тест открывается, вопросы и варианты соответствуют выбранному предмету/курсу.
- [ ] Вопросы с одним и несколькими правильными вариантами оцениваются правильно.
- [ ] Свободный ответ допускает регистр/пробелы/пунктуационные и орфографические отклонения согласно правилам смысловой проверки.
- [ ] ИИ не вызывается для простых точных совпадений и не нужен для базовой работы теста.
- [ ] Недоступность AI provider не блокирует MCQ и детерминированную проверку.
- [ ] `start → answer → finish → review` проходит целиком; refresh не обнуляет завершённую попытку.
- [ ] Не допускается отправка ответа в чужую/завершённую попытку.
- [ ] Пропуски, таймер и статусы сессии соответствуют enum/check constraints БД.
- [ ] История и баллы совпадают между ответом API, страницей результата и базой.
- [ ] Банк билетов и UUID записей не пересоздаются при синхронизации.
- [ ] Дубликаты вопросов только отчётируются и сравниваются; автоматическое удаление не выполняется без подтверждённого canonical source.

## 7. Атлас, изображения, электронограммы и материалы

Метаданные в Supabase не доказывают наличие физического файла.

- [ ] Все 28 опубликованных электронограмм открываются по реальным URL; HTTP 200 и корректный image MIME.
- [ ] Изображения препаратов загружаются в атласе, тренажёре, detail и mobile viewer.
- [ ] Для каждого `source_key` / `imagePath` / `imageUrl` найден физический файл на SpaceWeb/B2; нет только записи metadata.
- [ ] DOCX, PDF, изображения и методички открываются через Materials viewer, в том числе на iPhone.
- [ ] Большие файлы не читаются целиком в память без необходимости; загрузка/ошибка имеют таймаут и понятное состояние.
- [ ] Нет 404/403/502, HTML-страницы вместо изображения, неверного MIME, битого URL или смешанного HTTP/HTTPS.
- [ ] Image viewer поддерживает pinch-to-zoom, кнопки увеличения/уменьшения, pan, fit-to-screen, поворот/закрытие где предусмотрено.
- [ ] Подписи и названия доступны в атласе, но не раскрывают ответ в закрытом вопросе до его отправки.
- [ ] Дубли `source_key` сверяются с физическими файлами; файлы и карточки не удаляются автоматически.

## 8. Расписание, домашние задания, предметы и учебный план

- [ ] Неделя, месяц и семестр показывают одни и те же записи с правильными датами и часовым поясом.
- [ ] События на границе месяца/недели не исчезают и не дублируются.
- [ ] Повторяющиеся занятия и переносы отображаются корректно.
- [ ] Смена группы/семестра не смешивает чужие расписания и задания.
- [ ] Создание/изменение занятия валидирует дату, предмет, группу и права.
- [ ] Статусы домашней работы согласованы: назначено → в работе → отправлено/проверено (по реализованной модели).
- [ ] Отметки посещения/уважительной причины/пропуска доступны только разрешённым ролям.
- [ ] Ошибка API не превращается в пустое расписание без объяснения.
- [ ] При медленном ответе есть loading/skeleton; после ошибки есть retry.

## 9. Админ-панель и операции с данными

- [ ] Admin-only страницы закрыты и на UI, и на сервере.
- [ ] Поиск, фильтры, сортировка и пагинация работают на серверных наборах данных.
- [ ] Редактирование валидирует поля и показывает ошибки, а не скрывает их.
- [ ] Импорт сначала показывает preview/diff и количество create/update/skip; destructive apply требует подтверждения.
- [ ] Экспорт не включает секреты, токены и данные, недоступные текущей роли.
- [ ] Audit log фиксирует actor, действие, объект, время и результат без секретов.
- [ ] Rollback восстанавливает только выбранную транзакцию/пакет, не откатывая посторонние изменения.
- [ ] Bulk operations имеют лимиты, dry-run и backup/rollback plan.
- [ ] Мобильная пагинация, длинные таблицы, модальные окна и клавиатура проверены.

## 10. Адаптивность и браузеры

Минимальная матрица:

- [ ] iPhone Safari: portrait/landscape, safe areas, тёмная тема, модалки, фото, формы и таблицы.
- [ ] Android Chrome: touch, back navigation, viewport, загрузка файлов.
- [ ] Desktop Chrome/Edge/Firefox.
- [ ] Safari macOS.
- [ ] Ширина 320–390 px, планшет, ноутбук и широкий монитор.
- [ ] Нет горизонтального overflow, чёрных/пустых блоков, перекрывающихся кнопок и обрезанных диалогов.
- [ ] Reduced Motion, клавиатурная навигация, фокус и контраст не ломают работу.
- [ ] Lazy loading не оставляет пустой экран при возвращении назад или плохой сети.

## 11. Производительность, доступность и безопасность

- [ ] Повторный запрос не загружает повторно тяжёлые данные без причины.
- [ ] Кэш не смешивает ответы разных пользователей/ролей.
- [ ] При logout/account switch очищаются trainer card, image blob и material caches; blob URLs отзываются.
- [ ] B2 presigned URLs не сохраняются как бессрочный cache; malformed/opaque JWT не использует общий `auth` cache bucket. См. [Pass 46](RELIABILITY-FIX-2026-10-10-PASS46.md) и [Pass 47](SECURITY-FIX-2026-10-10-PASS47.md).
- [ ] Abort/timeout корректно прерывает запрос; stale cache помечается как устаревший, а не как свежий ответ.
- [ ] Изображения lazy-load; длинные списки имеют пагинацию/виртуализацию там, где нужно.
- [ ] Нет неограниченных запросов, циклов повторов или retry storm.
- [ ] CSP/headers, rate limits и server-side validation проверены для auth, upload, AI и admin mutations.
- [ ] Файловые endpoints не допускают path traversal и произвольный fetch URL.
- [ ] Нет секретов в git history, client bundles, source maps, logs и issue attachments.
- [ ] Сбои внешнего AI, B2 или Supabase не блокируют независимые функции сайта.

## 12. ИИ, расширение браузера и Telegram-бот

Это дополнительные клиенты, а не альтернативный источник данных.

- [ ] AI-провайдеры проверяются отдельно: health, timeout, quota, error mapping, fallback; без ключей базовый сайт остаётся рабочим.
- [ ] Расширение браузера использует официальный same-origin API, не хранит service-role key и не обходит авторизацию.
- [ ] Telegram-бот работает через отдельный серверный webhook/long polling и не содержит токен в репозитории.
- [ ] Привязка Telegram к аккаунту делается одноразовым короткоживущим кодом; нельзя привязать чужой аккаунт только по username.
- [ ] Бот не отправляет приватные оценки, задания или расписание до подтверждённой привязки и проверки роли/группы.
- [ ] Webhook проверяет секретный заголовок; повторная доставка update безопасна (idempotency).
- [ ] Бот/расширение можно отключить без влияния на основной сайт.
- [ ] Все дополнительные сервисы optional и не создают вторую конкурирующую базу.

## 13. GitHub Code Search — быстрый поиск потенциальных дефектов

Открывать в контексте репозитория `MISTACEN/medbiohim`; результат поиска — кандидат на проверку, а не автоматически подтверждённый баг.

- [Поиск TODO/FIXME/HACK](https://github.com/MISTACEN/medbiohim/search?q=TODO+OR+FIXME+OR+HACK&type=code)
- [Поиск mock/stub/demo data](https://github.com/MISTACEN/medbiohim/search?q=mock+OR+stub+OR+fixture+OR+demo&type=code)
- [Поиск необработанных ошибок и console logging](https://github.com/MISTACEN/medbiohim/search?q=console.log+OR+console.error+OR+TODO&type=code)
- [Поиск опасных обходов TypeScript](https://github.com/MISTACEN/medbiohim/search?q=as+any+OR+ts-ignore+OR+eslint-disable&type=code)
- [Поиск legacy API paths](https://github.com/MISTACEN/medbiohim/search?q=%2Fapi-compat%2F+OR+api%2Findex.php&type=code)
- [Поиск answer/correctness fields в trainer code](https://github.com/MISTACEN/medbiohim/search?q=correctAnswer+OR+is_correct+OR+submit_trainer_feed_answer&type=code)
- [Поиск fetch/timeout/retry logic](https://github.com/MISTACEN/medbiohim/search?q=AbortController+OR+setTimeout+OR+retry&type=code)
- [Поиск environment variables и случайных секретов](https://github.com/MISTACEN/medbiohim/search?q=SUPABASE_SERVICE_KEY+OR+FTP_PASSWORD+OR+GEMINI_API_KEY&type=code) — проверять только имена переменных и способы чтения; никогда не копировать значения секретов.
- [Поиск непроверенных ссылок/медиа-путей](https://github.com/MISTACEN/medbiohim/search?q=imageUrl+OR+source_key+OR+presignedDownloadUrl&type=code)
- [Все workflow-файлы](https://github.com/MISTACEN/medbiohim/tree/main/.github/workflows)

Для быстрого оформления можно использовать [готовую GitHub Issue Form](../.github/ISSUE_TEMPLATE/bug_report.yml), которая требует commit SHA, шаги, ожидаемый/фактический результат и безопасные логи.

## 14. Создание issue на каждый подтверждённый дефект

Использовать шаблон:

```text
Заголовок: [BUG][область] короткое наблюдаемое описание

Commit SHA:
Deployment ID / URL:
Окружение: production / preview / local
Устройство и браузер:
Роль/контекст доступа (без личных данных):
Endpoint или URL:
Время и timezone:
Предусловия:
Шаги воспроизведения:
1.
2.
3.

Ожидаемый результат:
Фактический результат:
HTTP status / request ID:
Ошибки Console/Network (секреты удалены):
Скриншот или короткая запись:
Частота: всегда / иногда / один раз
Регрессии после исправления:
Критичность: P0 / P1 / P2 / P3
```

Не открывать issue с одним только «не работает»; если runner не выделен и логов нет, это issue инфраструктуры CI, а не ошибка приложения.

## 15. Условия завершения большого аудита

Большой аудит можно закрыть только когда:

- [ ] Все обязательные workflow завершились успешно на одном зафиксированном SHA.
- [ ] Production frontend и backend имеют подтверждённые версии.
- [ ] Login, /me, schedule, materials, trainer, test lifecycle и admin проверены end-to-end.
- [ ] В тренажёре подтверждена конфиденциальность ответов до submit.
- [ ] Физические media paths проверены HTTP-запросами, а не только по metadata.
- [ ] Открытые P0/P1 дефекты исправлены или явно заблокированы с ответственным следующим шагом.
- [ ] README, ROADMAP, PHASES_STATUS и SYNC_STAMP совпадают по состоянию и дате.
- [ ] Итоговый отчёт содержит PASS/FAIL/BLOCKED по каждой области и ссылки на логи/issue.
