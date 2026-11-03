# MEDBIOHIM — FREE-TIER / ZERO-COST ARCHITECTURE & FULL-FUNCTIONALITY POLICY

Дата: 2026-10-07

## 1. Жёсткое требование
MEDBIOHIM должен предоставлять полный запланированный функционал без обязательных платных сервисов.

Это не означает урезать функции ради бесплатности. Правильная стратегия: сначала сохранить функцию, затем оптимизировать её реализацию под бесплатные квоты.

Платный тариф, платный API, платный AI, платное хранилище, платный CDN или обязательная покупка домена не являются допустимым условием работы основной системы без отдельного явного решения пользователя.

## 2. Канонический бесплатный стек
| Сервис | Бесплатный слой | Основная роль |
|---|---|---|
| GitHub | Free | исходный код, миграции, документация, CI в бесплатных лимитах |
| Vercel | Hobby | Next.js frontend и deployment/CDN в пределах Hobby |
| SpaceWeb | Бесплатный тариф | PHP API, runtime и физический контент в доступном дисковом лимите |
| Supabase | Free | PostgreSQL, Auth, RLS, metadata, учебные данные |
| Backblaze B2 | Free allowance | объектное хранение крупных файлов и media |

## 3. Распределение нагрузки
### Supabase Free
Пользователи, роли, группы, memberships, предметы, modules/topics, расписание, academic context, вопросы, тесты, попытки, результаты, homework metadata, trainer/material metadata, source_key/object_key/provenance, RLS и связи.

Не использовать Supabase Storage как обязательное хранилище всего большого архива.

### SpaceWeb Free
PHP API, существующий /public_html/content, уже размещённый контент, небольшие файлы и controlled media delivery.

### Backblaze B2 Free
Большие изображения, документы, архивы и новые media, которые неразумно помещать в Supabase Free или ограниченный диск SpaceWeb.

B2 не должен быть единственным источником истины для metadata: DB хранит object key и состояние объекта.

### Vercel Hobby
Next.js, frontend, статическая оптимизация, CDN-кэширование и deployment. Не использовать Vercel как постоянное файловое хранилище.

### GitHub Free
Source code, migrations, docs, configuration и небольшие декларативные content manifests. Большие бинарные архивы не должны без необходимости попадать в Git.

## 4. Принцип «без потери функций»
При каждом новом ограничении сначала применять:
1. кэширование;
2. пагинацию;
3. lazy loading;
4. streaming;
5. компрессию без потери требуемого качества;
6. дедупликацию;
7. manifest/inventory вместо повторной загрузки архивов;
8. хранение metadata отдельно от binary;
9. перенос тяжёлых объектов между SpaceWeb/B2;
10. deterministic/local processing вместо обязательного AI;
11. batch-запросы и индексы;
12. graceful degradation только для необязательных внешних сервисов.

Нельзя удалять функцию только ради экономии, делать AI обязательным там, где хватает deterministic logic, хранить один большой binary в нескольких местах без причины, загружать весь archive в Supabase или превращать Vercel runtime в файловое хранилище.

## 5. Бесплатность = отсутствие обязательных расходов
Каждую новую функцию проверять: работает ли на $0; permanent free это или trial; что произойдёт при достижении лимита; может ли превышение автоматически создать платный расход.

Если сервис может незаметно привести к расходам, функция должна иметь лимит, защиту или отключение расходного пути.

## 6. Graceful degradation
Необязательные внешние возможности могут отключаться без потери базовой функции.

Smart grading: MCQ и нормализованное точное совпадение проверяются deterministic; орфография не влияет; AI используется только для смысловой проверки; недоступность AI не теряет ответ и допускает pending/recheck.

## 7. Лимиты
При проектировании учитывать DB size, object storage, egress, API requests, server execution, build/deployment, CI minutes, concurrent connections, authentication quotas и media bandwidth.

При приближении к лимиту сначала менять способ хранения, доставки, кэширования или batching, а не пользовательскую функцию.

## 8. Media strategy
Канонический поток Histology: DB metadata → выбранный storage (SpaceWeb/B2) → API/controlled URL → browser.

Для большого архива manifest является источником проверки полноты. Duplicate/alias не требует второй копии. Существующие SpaceWeb media не удалять только потому, что бинарник отсутствует в GitHub.

## 9. Release gate
Перед production проверять: нет обязательного платного dependency; media paths; тяжёлые запросы; cache/lazy loading; отсутствие ненужных binary duplicates; optional AI; graceful degradation; runtime соответствует проверенному commit.

## 10. Главный принцип
Не урезать функциональность из-за free-tier. Оптимизировать архитектуру, хранение, запросы, кэширование и распределение нагрузки так, чтобы полный функционал оставался доступным при $0 обязательных расходов.

Связанные документы: docs/PROJECT-SOURCE-OF-TRUTH-AUDIT-2026-10-07.md, docs/HISTOLOGY-CONTENT-MANIFEST.md, docs/QUESTION-BANK-ARCHITECTURE.md, ROADMAP.md, PHASES_STATUS.md.