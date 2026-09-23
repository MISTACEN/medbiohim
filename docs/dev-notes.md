# MEDBIOHIM — заметки для разработки

Краткие правила, чтобы Vercel-сборка и локальный `next build` не падали, и чтобы код оставался единообразным.

## TypeScript + React: `unknown` ≠ ReactNode

`AdminDbRow = Record<string, unknown>` (см. `src/lib/api.ts`).  
Поля такой строки (`x.action`, `x.table_name`, `r[k]` и т.п.) имеют тип **`unknown`**.

В JSX **нельзя** писать:

```tsx
{x.action}          // ❌ Type 'unknown' is not assignable to type 'ReactNode'
{row.some_field}
```

Нужно явно привести к строке (или другому ReactNode):

```tsx
{String(x.action)}
{display(x.action)}   // предпочтительно, если есть хелпер
```

### Хелпер `display` (admin/database)

В `src/app/admin/database/page.tsx`:

```ts
/** unknown → string for JSX / inputs. Objects → JSON. null/undefined → "". */
function display(v: unknown): string {
  return v === null || v === undefined
    ? ""
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);
}
```

Использование: `value={display(r[k])}`, `{display(x.action)}` и т.д.

В других admin-страницах (`tests`, `test-questions`, …) уже принят стиль `String(...)` — этого достаточно для примитивов.

### Инцидент (2026-09-23)

Vercel build падал на:

```
./src/app/admin/database/page.tsx
Type error: Type 'unknown' is not assignable to type 'ReactNode'.
```

в блоке журнала аудита (`{x.action}`, `{x.table_name}`).  
Исправлено: все поля аудита через `display()`, у `display` явный возврат `string`.  
Коммит: `0ffc159`.

**Правило:** перед каждым пушем на `main` убедиться, что в JSX нет «голых» `unknown` из `AdminDbRow` / `Record<string, unknown>`.

## Optional fields → required state

Каталог предметов: `slug?: string`. Если state требует `slug: string`:

```ts
.map((x) => ({ name: x.name, slug: String(x.slug || "").trim() }))
.filter((x): x is { name: string; slug: string } => Boolean(x.slug))
```

Исправлено превентивно: `src/app/tutor/page.tsx`, `src/app/admin/lectures/page.tsx` (2026-09-23).

## Сборка и деплой

| Часть | Куда | Команда / триггер |
|-------|------|-------------------|
| Frontend (корень репо) | Vercel | `npm run build` (Next.js 15, strict TS) |
| backend/ | SpaceWeb | ручная выкладка + `.env` |

- Source of truth: ветка **`main`** на GitHub.
- `tsconfig`: `"strict": true` — ошибки типов = failed deploy.
- Не полагаться на «у меня локально ок» без `next build`: Vercel всегда гоняет полный typecheck.

## AdminDbRow в UI

- Список/таблица: ключи и отображаемые ячейки — через `String(...)` или `display(...)`.
- Ключи строк: `String(x.id)`, составной ключ — `keyOf(row, primary_key)`.
- Редактирование: не менять primary key в инпутах (disabled); для переноса контента — отдельные экраны (content-import, специализированные редакторы).

## Связанные доки

- `docs/platform-concept-medbiohim.md` — продукт
- `docs/subject-content-matrix.md` — матрица контента
- README.md — цепочка деплоя Vercel ↔ SpaceWeb ↔ Supabase
