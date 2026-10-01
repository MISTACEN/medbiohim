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

Исправлено: `src/app/tutor/page.tsx`, `src/app/admin/lectures/page.tsx` (2026-09-23).

Vercel после database-фикса падал на:

```
./src/app/admin/lectures/page.tsx
Argument of type '{ slug: string | undefined; name: string; }[]'
  is not assignable to SetStateAction<{ slug: string; name: string; }[]>
```

(коммит деплоя был старый `aee1266` — до фикса `a4c41db`).

## Сборка и деплой

| Часть | Куда | Команда / триггер |
|-------|------|-------------------|
| Frontend (корень репо) | Vercel | `npm run build` (Next.js 15, strict TS) |
| backend/ | SpaceWeb | ручная выкладка + `.env` |

- Source of truth: ветка **`main`** на GitHub.
- `tsconfig`: `"strict": true` — ошибки типов = failed deploy.
- Не полагаться на «у меня локально ок» без `next build`: Vercel всегда гоняет полный typecheck.
- **Vercel Hobby:** ~100 deployments/day (`api-deployments-free-per-day`). Каждый push в connected branch = деплой. Пока квота 0 — Disconnect Git или `ignoreCommand: exit 0` в Settings → Git / `vercel.json`.

### Pre-deploy checklist (2026-09-23)

Проверено статически на `main`:

| Риск | Статус |
|------|--------|
| `unknown` в JSX (admin/database) | fixed `display()` |
| optional `slug` → strict state (tutor, admin/lectures) | fixed filter + type predicate |
| `LectureRenderer.escapeHtml` no-op entities | fixed `&amp;`/`&lt;`/`&gt;` |
| `subjects/[id]` stale `subject` in `else if (!subject)` | fixed local `hasCatalogHit` |
| cards / tickets / practice / search / schedule | no TS pattern like above |

Локально перед пушем: `npm run build`.

## AdminDbRow в UI

- Список/таблица: ключи и отображаемые ячейки — через `String(...)` или `display(...)`.
- Ключи строк: `String(x.id)`, составной ключ — `keyOf(row, primary_key)`.
- Редактирование: не менять primary key в инпутах (disabled); для переноса контента — отдельные экраны (content-import, специализированные редакторы).

## Связанные доки

- `docs/platform-concept-medbiohim.md` — продукт
- `docs/subject-content-matrix.md` — матрица контента
- README.md — цепочка деплоя Vercel ↔ SpaceWeb ↔ Supabase


## Trainer feed integration rule (2026-09-24)

- Production trainer requests use `/api/v1/trainers/feed` through the Next.js same-origin proxy.
- The existing backend/SpaceWeb remains the primary source for ordinary API routes and must not be changed when adding trainer modules.
- Trainer feed cards are stored in Supabase `public.trainer_feed_cards`; for `subject_slug=histology` + `specialty_slug=mbh` the current database contains 206 published cards.
- The proxy has a Supabase compatibility fallback for trainer GET/answer/image routes. It uses the authenticated user's Bearer token and never requires the Supabase service-role key.
- The server proxy keeps the same public Supabase URL/anon-key fallback as `src/lib/supabase.ts`, so a missing Vercel env variable does not turn the trainer endpoint into a 404. Prefer configuring the variables in Vercel when possible.
- Do not modify the working schedule/auth backend to fix trainer issues. First reproduce the trainer request, then check whether the failure is Vercel proxy, SpaceWeb backend, Supabase table/RLS, or media storage.
- When adding a new module, copy this pattern: existing backend first, module-specific Supabase fallback only for data that is already represented in Supabase, and document the route/data contract here before extending it.
