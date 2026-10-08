# Гистология — Lecture 05: learning UX / visual learning / mini-tests

Дата: 2026-10-08

## Область изменений

Только каноническая гистология, текущий 3 семестр, тема **«Неделя 5–6 · Лекция 5/практика · Кровь и лимфа»**.

Не изменялись:
- другие предметы;
- 5 существующих `ticket_banks`;
- существующие trainer cards как контентные записи;
- существующие электронограммы;
- исходный конспект как источник фактов.

В предоставленном источнике подробно раскрыта кровь; отдельного содержательного материала о лимфе нет, поэтому новый материал о лимфе не придумывается.

## Что уже сделано по Lecture 05

- Live lecture: `lec-histology-blood-20261008`.
- Canonical module: `a1000001-0000-4000-8000-000000000004`.
- Canonical topic: `b1000001-0000-4000-8000-000000000007`.
- Лекция опубликована в `site_content(key=lectures)`.
- Лекция связана с 8 препаратами, 2 ЭМ, 20-вопросным тестом, 9 экзаменационными вопросами и материалами темы.
- Markdown/HTML rendering regression исправлена в `LectureRenderer`.
- Mermaid parsing/normalization исправлен.
- Собственные изображения Lecture 05 переведены на canonical `trainerId` + authenticated `getTrainerImageUrl()`.
- Markdown links исправлены.
- Добавлен единый viewport-centered image lightbox с zoom.

## Новая learning-структура

Теория организована как:

**теория → контекстный препарат → мини-тест из БД → ЭМ/практика → итоговый тест**

Lecture 05 теперь имеет 6 логичных учебных блоков:

1. Кровь как ткань → мини-тест.
2. Эритроциты → визуальная проверка → мини-тест.
3. Тромбоциты + лейкоциты → визуальная проверка → мини-тест.
4. Гемограмма + лейкоцитарная формула + возрастные перекрёсты → мини-тест.
5. Электронограмма эозинофила + быстрое распознавание → мини-тест.
6. Анализ / 4-столбчатая карточка / итог → мини-тест.

Mini-quiz использует опубликованные вопросы из `public.questions`. Сервер проверяет ответ непосредственно по БД; эталонный ответ не передаётся в браузер.

## Фото ↔ текст без дублей

Lecture body stores only canonical `trainerId` for MEDBIOHIM images.

На экране один specimen card получает:
- изображение через authenticated trainer media;
- canonical название препарата;
- окраску, если она есть;
- canonical prompt/описание, если оно есть;
- ссылку в атлас/тренажёр.

Одно и то же название/описание не нужно вручную дублировать в Markdown.

## Atlas / photo viewer

Основной просмотр препарата:
- центрируется относительно viewport;
- открывается поверх страницы через fixed overlay;
- имеет zoom + / −;
- имеет reset;
- закрывается ✕ / Escape / кликом по фону;
- имеет fullscreen API с viewport-modal fallback для iOS Safari;
- блокирует прокрутку исходной страницы под viewer.

## Code / migration

- `database/migrations/20261008_histology_lecture_05_learning_ux.sql`
- `src/components/media/ImageLightbox.tsx`
- `src/components/lectures/LectureRenderer.tsx`
- `src/components/trainers/HistologyTrainerParts.tsx`
- `src/lib/api.ts`
- `backend/config/routes/questions_rest.php`

## Runtime release gate

До production-DONE нужно проверить:
- Lecture 05 Markdown/headings/bold/tables/links;
- 6 mini-test blocks;
- загрузку вопросов из БД;
- server-side grading без раскрытия answer key;
- 5 canonical MEDBIOHIM photos;
- 2 WebPath control photos;
- centered viewer + zoom на iPhone Safari;
- close/fullscreen/scroll restore;
- переход в атлас/тренажёр;
- существующие 11 Mermaid blocks;
- полный 20-question blood test.

Browser connector не заменяет реальную авторизованную Safari-сессию; финальный UI verdict остаётся отдельным release gate.

 
## Дополнение 2026-10-08 — возрастные нормы

В Lecture 05 добавлен самостоятельный возрастной блок 7A–7E:
- временная шкала физиологических перекрёстов;
- возрастная лейкоцитарная формула;
- гемограмма для новорождённого, 10–14 суток, 3–6 месяцев, 1–2 лет, 4 лет и 14–15 лет/взрослого;
- алгоритм разбора карточки;
- мини-тест из существующей базы гистологии.

Числа сохранены по присланному материалу. Там, где пользовательский материал содержит варианты референсов из разных источников, они не объединены в одно значение без пометки.
