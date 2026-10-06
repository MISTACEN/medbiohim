# Unified Schedule + Homework — 2026-10-06

## Goal

Расписание становится единой точкой работы с учебным днём. Отдельная пользовательская вкладка «Задания» больше не нужна.

## Implemented

- Removed `/homework` from the main student sidebar.
- Existing `/homework` route now redirects to `/schedule`, so старые ссылки не ломаются.
- Dashboard links «Все задания» now open `/schedule`.
- Schedule lesson modal now uses the selected **date + subject** as the homework context.
- Lesson modal shows all homework matching that date and subject.
- Student can:
  - mark homework completed;
  - reopen it as unfinished;
  - write/save a text answer;
  - attach and submit a file.
- Admin/moderator/teacher can create homework directly from the selected lesson:
  - subject is taken from the lesson;
  - date is taken from the lesson;
  - group is taken from the current academic context.
- Existing planner API and group-aware homework access remain the source of truth.

## Data check

At implementation time Supabase contained 309 schedule entries and 0 rows in `homeworks`, `homework_progress`, and `homework_submissions`. Therefore the UI integration is ready, but existing homework cannot be demonstrated until homework records are created.

## Intended UX

Расписание → День/Неделя → выбрать день → выбрать занятие/предмет → тема занятия + что изучать + ДЗ → выполнить/ответить/прикрепить файл.

This keeps the academic context explicit and avoids a second independent homework calendar.

## Verification

GitHub commit: `f2153dc9f9a7d6bb1203031d7316ee2276787c18`.

Vercel status for this commit is currently `pending`; browser/runtime verification is therefore not yet considered green.
