# Гистология — сквозная карта контента 2026-10-05

## Правило текущего контекста

Активный предмет: `histology`, 2 курс, **3 семестр**.
Следующий семестр не смешивается с текущим интерфейсом: source-данные можно хранить заранее, но по умолчанию они скрыты и открываются через «Весь курс».

## 1. Учебный план

Сейчас в активном предмете:
- 14 модулей;
- 19 тем от недели 1 до недели 18;
- форма контроля в текущем curriculum record — зачёт.

Модули:
1. Цитология
2. Общая эмбриология
3. Эпителиальные ткани
4. Кровь и лимфа
5. Соединительные ткани
6. Скелетные ткани
7. Мышечные ткани
8. Нервная ткань
9. Нервная система (частная)
10. Сенсорные системы
11. Сердечно-сосудистая система
12. Эндокринная система
13. Кроветворение и иммунная защита
14. Пищеварительный канал (начало)

## 2. Source of truth

Главный источник гистологии — `Гистология.zip`.

Live Supabase:
- 261 source-файл с `id LIKE 'histology-%'`;
- 178 фотографий препаратов;
- 81 DOC/DOCX;
- 2 GIF;
- 80 опубликованных material rows активного предмета.

Разбивка 80 материалов:
- 28 электронограмм;
- 27 схем/таблиц;
- 2 GIF;
- 7 методичек;
- 4 сборника тестов;
- 2 федеральных тестовых документа;
- 2 контрольных работы;
- 5 экзаменационных/списочных документов;
- 1 памятка;
- 1 документ по схемам спинного мозга;
- остальные source rows соответствуют текущему content package.

## 3. Микропрепараты

В source: 178 фотографий.

В trainer:
- 206 опубликованных карточек;
- 169 имеют `plan_status=ПРИВЯЗАНО`;
- 37 сохранены как будущий/вне текущего плана материал.

В текущем интерфейсе по умолчанию показывается только привязанный к текущему 3 семестру контент. Остальное не удаляется.

## 4. Электронограммы

В source: 28 DOCX.
В trainer: 28 опубликованных electronogram cards.
Captions присутствуют в `preparation.captions`.

Текущая UI-категория — отдельная: «Электронограммы».
Она больше не смешивается со схемами.

## 5. Схемы и таблицы

Source package содержит 27 scheme/table DOC/DOCX и 2 GIF.

В Materials они показываются отдельно от:
- электронограмм;
- методичек;
- тестов;
- экзаменационных материалов;
- фотографий препаратов.

Схемы до текущего блока учебного плана относятся к текущему UI; последующие источники остаются в архиве «Весь курс».

## 6. Методички и тестовые документы

Все source documents из ZIP заведены как `content_sources` и материалами активного предмета.

Критический момент:
метаданные уже были в Supabase; реальная проблема была в физической доступности файлов на SpaceWeb. Поэтому подготовлен отдельный SpaceWeb content patch с исходными документами и HTML-зеркалами для legacy `.doc`.

Видео намеренно не входят в эту поставку.

## 7. Вопросы и тесты

Live active histology:
- 273 published questions;
- 194 archived questions;
- 0 published questions with NULL `source_key`;
- 8 published tests;
- 1 archived duplicate test;
- 76 published `exam_questions`.

Все опубликованные questions сейчас имеют явный source key; source-less legacy rows остаются архивом и не выдаются как опубликованный контент.

Некоторые большие legacy banks всё ещё содержат архивированные связи внутри test_questions. Это не восстанавливается автоматически без однозначного source match.

## 8. Экзаменационные вопросы

В ZIP есть отдельные исходники:
- экзаменационные вопросы леч./пед.;
- экзаменационные вопросы стоматологии;
- задачи по гистологии;
- список экзаменационных препаратов;
- эталоны ответов к задачам.

В DB на текущем проходе подтверждено 76 published exam_questions от source `histology-zip-exam-med-ped`.

Полная source-подборка из ZIP больше текущего опубликованного набора, поэтому оставшаяся часть должна проходить отдельный source-backed import, а не восстанавливаться по старым hashed IDs.

## 9. Билеты

В DB сохранены 5 ticket_banks, как уже существующий контракт проекта.
Но `tickets = 0`.

Это **не** считается готовыми билетами.
Точные ticket groups в supplied ZIP не представлены отдельным структурированным ticket manifest, поэтому генерировать билеты по догадке нельзя.

## 10. Лекции

Live `histology_lectures`: 17 опубликованных rows, но `body_markdown` в них пуст.
Это отдельный незавершённый слой: наличие lecture rows не равно наличию полноценных текстов лекций.

## 11. Материалы → UI

Исправлено:
- полный набор materials, а не только EM;
- отдельные вкладки;
- текущий 3 семестр по умолчанию;
- «Весь курс» для будущего;
- сортировка сначала по модулю/теме, потом по типу;
- одинаковая light-form стилизация на iPhone/Android/desktop;
- legacy `.doc` открывается через HTML mirror;
- DOCX разбирается viewer'ом;
- изображения/GIF/PDF учитываются viewer'ом;
- у документа есть download action.

## 12. Что остаётся внешней инфраструктурной задачей

SpaceWeb не доступен как файловый upload connector в текущем окружении.

Подготовлен архив:
`MEDBIOHIM_histology_spaceweb_3sem_content_patch.zip`

Он содержит source DOC/DOCX/GIF из `Гистология.zip` и 15 HTML-зеркал для legacy `.doc`.

После размещения под:
`content/histology/`
viewer использует тот же backend route, без смены source_key.

## 13. Definition of Done по гистологии

Сделано и проверено:
- ✅ source inventory;
- ✅ active 3 semester scope;
- ✅ 178 photos source;
- ✅ 28 EM source/cards;
- ✅ 80 materials;
- ✅ current/future separation in Materials;
- ✅ mobile form normalization;
- ✅ published question source integrity;
- ✅ test link integrity at DB level;
- ✅ source-backed bird-blastula reconstruction.

Не завершено:
- 🟡 физическая загрузка document patch на SpaceWeb;
- 🟡 финальный authenticated mobile smoke «Materials → DOC/DOCX → photo» после загрузки;
- 🟡 полный import remaining exam/ticket structures from source documents;
- 🟡 lecture bodies;
- 🟡 source-backed ticket grouping.

Последовательность остаётся: **план → схемы → методички → фото → ЭМ → тесты → вопросы → экзамен → билеты**, а legacy content не используется как скрытый источник истины.


## Pass 8 correction — exam bank
Current active 3rd-semester exam bank is now **116 published source-backed questions**:
- 76 existing cytology/embryology/general-histology;
- +14 private nervous/sensory;
- +7 cardiovascular;
- +8 hematopoiesis/immunity;
- +7 endocrine;
- +4 oral-cavity/start of digestive system.

40 newly added rows have explicit current-plan module/topic links. No published row has a null source.
Future respiratory/skin/urinary/reproductive/later GI sections remain unpublished for the current semester.


## 2026-10-08 — Lecture 05 ↔ preparations / EM / tests

Lecture 05 «Кровь и лимфа» теперь имеет explicit source-backed learning links.

### Current chain
**Лекция → микропрепарат → морфологический признак → ЭМ → тест → экзаменационный вопрос**

### Preparation cards
8 published cards already exist for the blood smear and are linked from the lecture as cross-links:
- feed-prep-9f7dc534b5 — neutrophil + eosinophil;
- feed-prep-867b72a4b6 — neutrophil;
- feed-prep-a47e9dc83a — eosinophil + neutrophil;
- feed-prep-a2feb3ec86 — lymphocyte + monocyte;
- feed-prep-5a224c48f5 — lymphocyte;
- feed-prep-29f73833e0 — lymphocytes;
- feed-prep-bca30caf3b — monocyte;
- feed-prep-60e72c3e7e — platelets.

### Electronograms
- feed-em-d69cfa101f / histology-em-19b1cd0070eccd — phagocytosis by a blood neutrophil;
- histology-em-capillary-20261005 — transverse section of a blood capillary.

### Test
- 29564479-ebb7-4c81-9d0d-4e5ca640d053 — «Гистология — общая: кровь» — 20 questions.

### Important boundary
These links do not change the canonical plan-topic ownership of existing trainer cards. They are educational cross-links from the lecture. No new preparation or unsupported lymph content was invented.

### Remaining
- production/browser smoke;
- final physical media reconciliation;
- automatic related-content block in the lecture UI;
- continue filling remaining lecture bodies from source-backed materials.


## 2026-10-08 — Full lecture set from supplied archives

Лекционный слой заполнен source-backed контентом непосредственно из уже импортированных `materials` Supabase, которые соответствуют `Гистология.zip`.

- **20 опубликованных lecture records** для `histology` в `site_content`;
- **19 новых заполненных тел** + ранее существовавшая расширенная Lecture 05 «Кровь и лимфа»;
- добавлены: цитология, эмбриология, эпителий, соединительные/хрящевые ткани, костно-мышечная ткань, нервная ткань, ЦНС/ВНС, сенсорные системы, сердечно-сосудистая, кроветворение/иммунитет, эндокринная, ЖКТ, большие железы ЖКТ, дыхательная, кожа, мочевая, половая системы, стоматологическая область;
- отдельно добавлена **дополнительная лекция по гистотехнике**;
- каждое новое тело хранит `sources` с исходными `histology-zip-scheme-*` keys;
- curriculum metadata привязывается к соответствующему модулю текущего 3 семестра, где такая привязка однозначна;
- `body_html` используется как canonical rendered body, а `body_md` сохранён как текстовый fallback;
- пустые legacy rows `public.histology_lectures` переведены в `is_published=false`, чтобы старый слой не дублировал canonical `site_content`.

Репродуцируемая миграция: `database/migrations/20261008_histology_full_lectures.sql`.

**Граница источника:** текст лекций не дополнялся неподтверждёнными сведениями. `content.zip` используется как физический media/trainer-контур; текстовая часть берётся из source-backed материалов Supabase, связанных с `Гистология.zip`.


## 2026-10-08 — Lecture-to-curriculum attachment map

Текущий 3-й семестр теперь имеет отдельную учебную связку для каждого лекционного пункта:

**точное название из curriculum → methodic source → verified section/page range → scheme/file source → preparation cards → electronograms (если есть).**

Проверка live Supabase: **16 текущих лекций; 16/16 exact title matches; 16/16 с methodics; 16/16 с файлами; 16/16 с препаратами после добавления трёх клеточных карточек в Lecture 01.**

Важно: для двух старых .doc-методичек автоматическое восстановление оригинальных страниц не считается надёжным, поэтому система хранит и показывает точное название раздела, а не придумывает страницу. Файлы остаются исходными, без замены на сгенерированные документы.

Три тематически ошибочные trainer-привязки были исправлены до формирования lecture links: кровь → «Кровь и лимфа», кора мозжечка → «Кора, мозжечок и ВНС», неоральные ЖКТ-препараты/ЭМ → вне текущего пункта «ротовая полость».

Репродуцируемые миграции: database/migrations/20261008_histology_lecture_plan_learning_links.sql, database/migrations/20261008_histology_lecture_01_preparations.sql.


## 2026-10-08 — Lecture 05 rich-content standard

Лекция 05 «Кровь и лимфа» используется как канонический образец оформления lecture UI и editor model.

Поддерживаемая цепочка редактирования:
**обычный текст → таблица → Mermaid-схема → препарат/ЭМ → мини-тест → формула/диаграмма/химическая фигура/видео → прикреплённый файл/методичка.**

Специальные blocks не считаются декоративными вставками: они являются частью source-backed lecture body и должны переживать открытие в админке и повторное сохранение без потери семантики.

Все остальные текущие лекции получили первый общий rich-template слой. Дальнейшее расширение выполняется по их собственным Word/material sources, а не копированием содержания Lecture 05 между темами.
