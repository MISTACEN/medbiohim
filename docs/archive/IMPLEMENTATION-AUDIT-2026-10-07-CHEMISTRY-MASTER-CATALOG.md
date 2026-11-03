# Chemistry Master Catalog Audit — 2026-10-07

## Source package

User supplied:
- `smallpdf-compress-20261007-001659.zip`
- 7 scanned PDF documents
- 142 total PDF pages

The PDFs have no usable native text layer. OCR was tested, but it is not accepted as the sole source of truth because chemical formulas and schemes are frequently distorted.

Previously validated project artifacts were therefore cross-checked:
- `organic_chemistry_open_tasks_fixed.sql`
- `MEDBIOHIM_все_вопросы_по_темам_и_порядку.docx`
- existing current chemistry question bank in Supabase

## Live Supabase state

Before this pass:
- 260 published organic-chemistry open/exam tasks
- 176 published current-semester chemistry test questions
- 0 rows in `chemical_questions`

After this pass:
- `chemistry_master_documents` exists
- version: `2026-10-07-v1`
- one canonical document record
- 436 JSON items:
  - 260 open tasks
  - 176 test questions
- 176 test items retain options and authoritative answer
- all imported items retain source identifiers and curriculum references where available

## Formula safety

This pass deliberately does **not** fabricate structural or skeletal formulas.

If a formula/reaction is present in the source text, it is retained in Unicode/text form, including symbols such as:
`→`, `≡`, `=`, subscripts, chemical groups and reagents.

For prompts such as:
`Напишите структурные формулы ...`
the source sometimes gives only the compound name and expects the student to draw the structure. The original scan may contain surrounding graphical chemistry, but a generated formula is not treated as authoritative without checking the original page image.

This is important because replacing a scanned structural/skeletal formula with an OCR guess can silently change the chemistry.

## Current limitation

The source DOCX contains a larger archived test section than the 176 questions currently selected for the canonical current-semester production bank. A full expansion of every archived test item should be a separate controlled import with image-level verification for formula-heavy questions.

The 260 open tasks are already represented in the existing canonical `exam_questions` source and are included in the unified master document.

## Plan

Next chemistry-content pass:
1. verify every formula-heavy page against the original scan;
2. extract structural/skeletal formulas into a machine-readable representation where possible;
3. attach a source-page reference to each formula-heavy item;
4. create authoritative answers for open tasks only after verification;
5. expand the archived test section only after OCR/image verification;
6. keep current production tests and ticket banks untouched during the migration;
7. run final Supabase integrity checks;
8. run GitHub/Vercel build and browser verification.

## Safety rule

No existing ticket-bank UUIDs were modified.
No existing question text or answer was rewritten in this pass.
The master catalog is additive and is not the runtime source for scoring until separately verified.


## Pass 26A — formula-answer extraction

- Supabase master catalog now has 436 items: 260 open tasks + 176 test questions.
- 40 items now contain a prepared answer payload in the master catalog.
- 19 formula-heavy items have a prepared textual structural-formula answer representation.
- Formula answers are explicitly marked `formula_answer_status=prepared_from_text`, **not** image-verified.
- This distinction is intentional: OCR/source text can preserve a chemical name while the original scan may contain a graphical structure whose exact stereochemistry or placement must still be checked visually.
- The production `exam_questions.answer` field remains untouched; the master catalog is additive and is not yet the scoring source.
- RLS was enabled on `chemistry_master_documents`; authenticated users can read the catalog, while writes remain outside the client policy.
- GitHub migration added: `database/migrations/20261007_chemistry_master_catalog.sql`.

### Next required pass

Visually verify every formula-heavy source page and convert the prepared formulas into authoritative answers. Then continue answering the remaining 220 open tasks in batches, with reaction equations and names checked against the source and curriculum topic.


## Pass 26B — два независимых методических источника

В ходе повторной проверки установлено, что химический материал нельзя считать одним источником.

### Источник 1
**Учебно-методическое пособие по органической и физической химии** ДВГМУ.
Оно содержит контрольные вопросы и задания по органической и физической химии, включая темы 1.1 и далее.

### Источник 2
**Н.Н. Минаева, С.А. Пронкина — «Сборник задач, упражнений и тестовых заданий по органической химии»**, Дальневосточный государственный медицинский университет.
Это самостоятельный сборник задач/упражнений/тестов, а не просто продолжение первого файла.

В Supabase создан справочник `chemistry_source_documents`, где эти источники заведены раздельно. Общий `chemistry_master_documents` теперь хранит оба источника в `source_documents`.

### Правило объединения

- общий каталог — один;
- методички — две независимые provenance-сущности;
- одинаковый текст не удаляет запись автоматически;
- структурная/скелетная формула считается отдельным типом контента;
- источник задания должен быть известен до помещения ответа в production scoring;
- если по текущей расшифровке нельзя надёжно определить источник конкретной строки, она остаётся `source_unresolved`, а не получает выдуманную привязку.

Это предотвращает потерю заданий второй методички при дедупликации.


## Pass 27A — инфраструктура хранения: Supabase Free + SpaceWeb

Уточнена фактическая архитектура хранения проекта с учётом ограничений бесплатного Supabase.

- Supabase используется прежде всего как **БД и слой метаданных**: PostgreSQL, Auth, RLS, связи предметов/тем/вопросов/тестов, trainer cards, captions, source_key и идентификаторы/пути медиа.
- Физические тяжёлые изображения и фотографии не требуется переносить в Supabase Storage. Для Histology канонический физический слой — **SpaceWeb**, прежде всего `/public_html/content/histology` / `HISTOLOGY_MEDIA_ROOT`.
- GitHub не должен становиться обязательным хранилищем всего большого media-архива; в репозитории остаются код, миграции, документация и небольшие декларативные контентные файлы.
- Vercel является frontend/deployment layer, а не постоянным хранилищем изображений.

### content.zip и ограничение вложения

Полный `content.zip` не обязан загружаться в чат: если архив превышает лимит вложения, он анализируется и переносится частями. Нельзя считать отсутствующий в чате архив отсутствующим в проекте.

По уже проанализированному архиву:
- 444 фактических файлов;
- 389 изображений;
- 207 уникальных изображений после дедупликации;
- 206 trainer feed cards уже представлены в Supabase;
- 28 EM представлены в trainer/material metadata.

При этом запись в Supabase не доказывает наличие физического файла. Для финальной проверки используется цепочка:
**Supabase metadata → API media route → SpaceWeb file → HTTP 200/image**.

### Важное решение

Не переносить все фотографии из `content.zip` в `public.files` или Supabase Storage только для того, чтобы «архив был в БД». Это не соответствует выбранной архитектуре и бесплатному лимиту Supabase. В БД должны быть необходимые метаданные/связи, а сам тяжёлый бинарный контент — на SpaceWeb.

Статус: 🟡 metadata/content structure largely synchronized; physical SpaceWeb media remains a target-environment verification step.
