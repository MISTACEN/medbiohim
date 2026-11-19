# Интеграция 2026-11-20 — инструкция для интегратора

Подготовлено в ходе архитектурного рефакторинга (worktree `medbiohim-b0`,
эксперименты — `medbiohim-integration` и `medbiohim-compat`).

## Что в этой папке

| Файл | Что это | Когда применять |
|---|---|---|
| `B4-pages-second-wave-2026-11-20.patch` | Полный рефакторинг против `fab432d` (654 файла): декомпозиция 40 страниц + 22 маршрутов + 2 модулей, дедупликация хелперов, guard-стражи, кэш ADR-0002, генератор подмодулей, документация | На **чистое** дерево от `fab432d` (если твои staged-изменения коммитятся отдельно) |
| `B5-integrated-full-2026-11-20.patch` | **B4 + твои 48 staged-файлов + разрешённые конфликты** (697 файлов). Проверен полной батареей | На чистое дерево от `fab432d`, если интегрируешь всё разом |

Оба патча применяются командой `git apply <файл>` на чистое дерево от `fab432d`
и прошли полную батарею: typecheck, 368/368 FE, 530/530 worker, lint 0 errors,
fitness 6/6, `next build` exit 0 (для B4; B5 — typecheck/тесты/lint/fitness,
build см. ниже).

## Что конфликтует и как разрешено

Прямой порядок «staged → B4» даёт 3 конфликта и НЕ рекомендуется.
Проверенный порядок: **B4 на чистое дерево → твои staged через `git apply -3`**
→ ровно 1 конфликт → разрешён следующим образом:

- `src/modules/subjects/submodules/chemistry/LabBench.tsx` — твоя новая вкладка
  «Органическая лаборатория» (OrganicLabs) вписана в новую обёртку LabBench:
  файл перенесён в `chemistry/lab/OrganicLabs.tsx` (импорт ChemRichText → `../`),
  вкладка добавлена в `lab/model.ts` (TABS + тип Tab, иконка BookOpen),
  баррель `chemistry/index.ts` реэкспортирует из `./lab/OrganicLabs`.
- Твоя контентная работа доведена до зелёного:
  - `test/lectures-content.test.mjs` — в SETS добавлен `hist`
    (конспекты гистологии подключены через `LEGACY_PORTALS.histology`);
  - `public/content/lectures-search-index.json` пересобран
    (`node scripts/build-lectures-search-index.mjs`, 103 конспекта);
  - `public/content/portals/mc-index.json` — запись
    `chem2-voprosy-bez-zagolovka-temy` переименована в `chem2-alkaloids`
    (файл `mc-chem2-alkaloids.json`, 24 вопроса); запись
    `chem2-1-2-himicheskaya-svyaz-elekt` удалена (файл удалён, тема
    «Химическая связь» остаётся в банке части I
    `organic-part1-himicheskaya-svyaz-elektronnye-e`).

## Порядок интеграции (рекомендуемый)

1. `git worktree add ../integration fab432d --detach`
2. `git apply B5-integrated-full-2026-11-20.patch` (или B4 + свой staged по схеме выше)
3. Прогон: `npm run typecheck && npm test && npm run lint`,
   `cd workers/api && npm run check`, `npm run build`
4. Коммит в `main` — только с явного разрешения владельца.

## Безопасность зависимостей (npm audit --omit=dev, 2026-11-20)

- workers/api: **0 уязвимостей** — hono обновлён в рамках `^4.6.12`
  (GHSA-4h7h-rv7c-7m2v, validator form/multipart); тесты 530/530.
- frontend: 2 high — `image-size` (DoS в ICNS-парсере) через `pptxgenjs@^4.0.1`.
  Путь до уязвимого кода недостижим: pptxgenjs используется в одном клиентском
  компоненте (LectureAiActions) для сборки PPTX из собственного контента
  лекций, недоверенные ICNS не парсятся. Исправление — даунгрейд pptxgenjs до
  4.0.0 (ломающее изменение API). Решение: принято как осознанный риск,
  апгрейд после выхода pptxgenjs с обновлённым image-size.

## Ограничения

- Визуальная проверка выполнена для гостя (6 страниц) и лаборатории
  (переключение вкладок). Авторизованные страницы (teacher, admin, settings,
  journal) проверены тестами и типами, но не глазами — нужен вход.
- `next build` собран для B4 (дважды) и B5 (typecheck+тесты; build в
  medbiohim-compat прогнан для состояния до контентных правок — при
  интеграции запустить ещё раз).
- Node_modules в экспериментальных worktree — junction на b0; при переносе
  на другую машину создать заново.
