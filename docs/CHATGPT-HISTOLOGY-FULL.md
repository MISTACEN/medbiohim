# ChatGPT / Supabase — полная инструкция по гистологии (MEDBIOHIM)

**Дата:** 2026-09-28  
**Репозиторий:** https://github.com/MISTACEN/medbiohim (branch `main`)  
**Фронт:** Vercel (корень репо)  
**Бэкенд PHP:** SpaceWeb (`spaceweb_upload/` → хостинг), API проксируется с Vercel на SpaceWeb  

Ты работаешь с **Supabase (PostgreSQL)** и при необходимости с storage.  
Не выдумывай данные. Все SQL/JSON лежат в `docs/` и `backend/data/` репозитория.

---

## 0. Архитектура (кратко)

| Слой | Где | Роль |
|------|-----|------|
| Next.js UI | Vercel | `/subjects/[id]` вкладки, `/trainers/feed/histology`, билеты, тесты |
| PHP API | SpaceWeb | `/api/v1/trainings`, `/api/v1/tests`, `/api/v1/tickets`, media |
| БД | Supabase | `trainer_feed_cards`, `exam_questions`, `ticket_banks`, tests-таблицы, `learning_sessions` |
| Медиа | SpaceWeb `content/histology/` + B2/Supabase storage | JPG препаратов, PNG ЭМ |

`subject_slug` для предмета: **`histology`** (алиас `histology_cytology`).

---

## 1. Что уже сделано на фронте (GitHub main)

- Вкладка **Микропрепараты** = атлас (с подписями) + тренажёр (без подписей).
- Атлас: галерея по темам → клик → fullscreen + captions.
- Тренажёр: полноценный тест на `/trainers/feed/histology?training=…`.
- Дедуп карточек ЭМ на клиенте (id / source_key / name).
- Билеты для histology **включены**: `SUBJECT_HAS_TICKET_BANK.histology = true`.
- Кэш URL картинок тренажёра + нейтральный alt (не светить имя файла до ответа).

Ключевые файлы:
- `src/components/trainers/HistologyTrainer.tsx`
- `src/app/(main)/subjects/[id]/page.tsx`
- `src/lib/subjectSlug.ts`
- `src/lib/api.ts` (getTrainerImageUrl / prefetch)

---

## 2. Электронограммы (28) + captions

### Задача GPT
1. Проставить `preparation.captions` для всех 28 ЭМ.
2. Убрать дубликаты feed-карточек ЭМ (одинаковые фото/имена).

### Файлы
| Файл | Назначение |
|------|------------|
| `docs/histology-em-captions-28.json` | JSON всех 28 подписей |
| `docs/20260928_sync_histology_em_captions.sql` | UPDATE по `id` карточки |
| `docs/20260928_sync_histology_em_captions_by_name.sql` | UPDATE по имени препарата (fallback) |
| `docs/20260928_dedupe_histology_em_cards.sql` | Диагностика/удаление дублей |

### Порядок
```text
1) Выполнить 20260928_sync_histology_em_captions.sql
2) Если часть строк 0 rows → 20260928_sync_histology_em_captions_by_name.sql
3) 20260928_dedupe_histology_em_cards.sql — найти дубли, оставить одну карточку на source_key/name
4) Проверка:
   SELECT id, preparation->>'name' AS name,
          jsonb_array_length(COALESCE(preparation->'captions','[]'::jsonb)) AS n
   FROM trainer_feed_cards
   WHERE id LIKE 'feed-em-%' OR source_key LIKE 'histology-em-%';
```

**Важно:** у PNG/JPG ЭМ текста нет; подписи только в Word. В режиме «изучение/атлас» UI показывает captions, в «подготовка/экзамен» — чистая картинка.

---

## 3. Тесты (MCQ) — что уже в репо

### Импортировано
Только **Сборник тестовых заданий по цитологии и эмбриологии** (закрытый тип):

| test id | Тема | Вопросов |
|---------|------|----------|
| `histology-cyto-closed-2007` | Цитология | 96 |
| `histology-embryo-closed-2007` | Эмбриология | 67 |
| `histology-cyto-embryo-mixed-2007` | Оба раздела | 163 |

Файлы:
- `backend/data/tests.json` — локальный/SpaceWeb fallback
- `docs/histology-tests-cyto-embryo.json`
- `docs/20260928_import_histology_tests.sql`

### Ещё НЕ импортировано (features)
- `Сборник тестовых заданий по общей гистологии.doc`
- `Сборник тест зад по общ. и частн. гист. 2008.doc`
- `федеральные тесты пед. и леч.doc`
- `федеральные тесты стом.doc`
- открытый тип (вписать ответ) из цито/эмбрио

### Схема импорта tests
Типичные поля (уточни по живой схеме):
- `tests`: id, subject_slug, title, description, is_published / is_active, question_count
- `test_questions`: id, test_id, prompt, options jsonb, correct_index / answers, sort_order

Выполни `docs/20260928_import_histology_tests.sql`.  
Если колонки отличаются (`is_active` vs `is_published`) — адаптируй SQL, не ломай данные.

Проверка:
```sql
SELECT id, title, question_count FROM tests WHERE subject_slug = 'histology';
```

---

## 4. Билеты / экзаменационные вопросы

### Импортировано из features (все 4 файла «экзаменационные вопросы»)
| Источник | Результат |
|----------|-----------|
| экз. вопросы леч./пед. | теория open |
| экз. вопросы стом. | теория open |
| задачи + эталоны | case + answer |
| списки препаратов | preparation |

**~350** вопросов `kind=ticket`, `subject_slug=histology`.

### Банки (`ticket_banks`)
| id | Название |
|----|----------|
| `bank-histology-lech-ped` | Билеты — Гистология (леч./пед.) |
| `bank-histology-stom` | Билеты — Гистология (стом.) |
| `bank-histology-cases` | Ситуационные задачи |
| `bank-histology-preparations` | Экзаменационные препараты |
| `bank-histology-all` | Полный банк |

Файлы:
- `backend/data/questions_by_subject/histology.json`
- `backend/data/questions_bank.json`
- `backend/data/tickets_bank.json`
- `docs/histology-ticket-questions.json`
- `docs/20260928_import_histology_ticket_questions.sql`

### Порядок для GPT
1. Выполнить SQL импорта ticket questions + banks.
2. Проверки:
```sql
SELECT COUNT(*) FROM exam_questions WHERE subject_slug = 'histology';
SELECT id, title FROM ticket_banks WHERE subject_slug = 'histology';
```
3. API: `GET /api/v1/tickets` → банки histology; `POST /api/v1/tickets/generate`.

Таблица `exam_questions` (ориентир):
`id, subject_id, subject_name, subject_slug, topic, text, answer, kind, type, for_exam, for_ticket, source, is_published`

---

## 5. Тренажёр / learning_sessions / boolean bug

Ошибка: `SQLSTATE[22P02]: invalid input syntax for type boolean: ""` (`is_skipped=''`).

**Фикс SpaceWeb:** в `trainings.php` биндить `is_correct` / `is_skipped` как `PDO::PARAM_BOOL` или `NULL`, никогда `''`.

Индекс resume:
```sql
CREATE INDEX IF NOT EXISTS learning_sessions_resume_idx
  ON learning_sessions (user_id, type, ref_id, status, updated_at DESC);
```
`type` для гисто-ленты: `histology_feed`.

---

## 6. Медиа

- Препараты: пути в БД есть; бинарники — storage/SpaceWeb `content/histology/`. 404 = файл не загружен.
- ЭМ: PNG в `content/histology/electronograms/`; Word только для captions.
- Image API: fallback `source_key` → `preparation.imagePath`.

---

## 7. SpaceWeb — залить вручную (не Vercel)

```text
data/tests.json
data/tickets_bank.json
data/questions_bank.json
data/questions_by_subject/histology.json
content/histology/
trainings.php   (boolean fix)
```

---

## 8. Чеклист GPT (по порядку)

1. [ ] SQL captions ЭМ (28)
2. [ ] SQL dedupe ЭМ
3. [ ] SQL import tests (цито+эмбрио)
4. [ ] SQL import exam_questions + ticket_banks histology
5. [ ] Проверить storage URL картинок
6. [ ] Отдать пользователю counts

Не трогать чужие предметы. Не DELETE без `WHERE subject_slug='histology'`.

---

## 9. Ещё НЕ сделано

- Сборники: общая гистология, 2008, федеральные
- Открытые тесты
- schemes / methodics / memo / lists
- Captions световых препаратов
- Недостающие бинарники фото

---

## 10. Файлы в репо

```text
docs/CHATGPT-HISTOLOGY-FULL.md
docs/GPT-SUPABASE-HISTOLOGY-READY.md
docs/20260928_sync_histology_em_captions.sql
docs/20260928_sync_histology_em_captions_by_name.sql
docs/20260928_dedupe_histology_em_cards.sql
docs/20260928_import_histology_tests.sql
docs/20260928_import_histology_ticket_questions.sql
docs/histology-em-captions-28.json
docs/histology-tests-cyto-embryo.json
docs/histology-ticket-questions.json
backend/data/tests.json
backend/data/tickets_bank.json
backend/data/questions_bank.json
backend/data/questions_by_subject/histology.json
```

После SQL — написать counts и список банков.
