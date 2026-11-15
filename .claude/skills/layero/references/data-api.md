# Data API, sign-in and files — the path for an agent

Layero gives a Postgres database a Supabase-compatible HTTP API: tables and
functions (`/rest/v1`), sign-in (`/auth/v1`) and files (`/storage/v1`) at
`https://data.layero.ru/<database>`. Use the regular
`@supabase/supabase-js@2` client; there is nothing Layero-specific to learn
on the client side.

Data API, sign-in and files are an experimental feature available on the Pro
plan (and to organizations in the beta list). On the free plan, enabling
them answers `402` with an upgrade offer — tell the person, do not retry.

## The path: database → table with RLS → sign-in → files

| Step | Who | How |
|---|---|---|
| 1. Database | agent | `npx layero@latest db create <name> --json` — the password comes ONCE, inside `connection_string` only; the event's `secrets` field lists what to mask. Databases are a Pro feature: the plan includes one shared database per organization (on Free, `db create` is refused). |
| 2. Connect it to the project | agent | `npx layero@latest db connect <database> --project <project>` — the project gets the connection string and the Data API address and public key in its build. |
| 3. Data API | agent | `npx layero@latest data enable --db <database>` — as in Supabase: new tables in `public` are open to the roles, RLS decides the rows. |
| 4. Tables, RLS, grants | agent | `npx layero@latest db sql <database> -c "<sql>"` — a script of several statements runs as one transaction. |
| 5. Sign-in | **person** | Dashboard: Databases → the database → «Авторизация» → «Включить авторизацию». Neither the CLI nor MCP enables it: ask the person and wait. |
| 6. Files | **person** | Dashboard: Databases → the database → «Файлы» → «Включить файлы». |
| 7. Keys for local development | agent | `npx layero@latest data env --write` writes the address and the public key into `.env.local`. |

Ask the person for steps 5 and 6 up front, before you write code that depends
on them: `auth.uid()` and the `auth` schema appear only after sign-in is
enabled (`schema "auth" does not exist` means exactly that).

## Roles — as in Supabase

`anon`, `authenticated` and `service_role` exist in every Layero database, so
migrations and tutorials work as written:

```sql
create table public.notes (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  body text not null
);
alter table public.notes enable row level security;
create policy "own notes" on public.notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

No `grant` lines are needed — access works exactly as in Supabase:

- **Default privileges.** A new table, sequence or function in `public` is
  open to `anon`, `authenticated` and `service_role` by itself; RLS decides
  the rows. **Enable RLS on every table at once** — a table without RLS gives
  every row to anyone with the public key, and `npx layero@latest data
  methods` warns about it. Tables created without RLS before 26.10.2026 stay
  closed: enable RLS, then `npx layero@latest data grant <table> --get visitor`.
- **Guest and signed-in are different roles.** `to anon` applies to guests
  only, `to authenticated` to signed-in users only.
- **`service_role` (the secret key) bypasses RLS** — it sees and changes every
  row, so it lives on a server only.
- **`supabase.rpc("name")` calls functions in `public`** (and `api`); a new one
  needs no grant. The response is the result itself, as in PostgREST. A
  function callable only through `PUBLIC` is closed — the refusal names the
  `GRANT`.
- **`localhost` works as a return address** for sign-in links and OAuth
  (`emailRedirectTo: "http://localhost:5173"`), as long as the database's
  «localhost» switch in «Доступ» is on (default).
- **Email confirmation is on** for newly enabled sign-in, as in Supabase:
  `signUp` returns no session until the link in the email is followed. The
  person can switch it off in «Авторизация» → «Подтверждать почту».
- **Test users — through the admin API with the secret key**, as in
  Supabase: `supabase.auth.admin.createUser({ email, password,
  email_confirm: true })` creates a confirmed user that can sign in right
  away; `auth.admin.updateUserById(id, { password })` changes one. Run it
  from a server or a script, never from the browser: the secret key bypasses
  RLS. With email confirmation on, this is the way to get test users without
  a mailbox.

## Client

```js
import { createClient } from "@supabase/supabase-js";

export const db = createClient(
  import.meta.env.VITE_LAYERO_DATA_URL, // https://data.layero.ru/<database>
  import.meta.env.VITE_LAYERO_DATA_KEY, // pk_live_… — public, safe in the bundle
);
```

Only the public key `pk_live_…` goes to the browser; the secret `sk_live_…`
lives on the server.

## Limits per database (Free / Pro)

The Free column applies only to organizations in the beta list — otherwise Free cannot enable the Data API at all.

Requests per day 50,000 / 1,000,000 (then `429 quota_exceeded` until 00:00
UTC); sign-in users 10,000 / 100,000 (then new sign-ups are refused); file
size 50 MB; file storage 1 GB / 100 GB.

## MCP

`data_api_status`, `data_api_methods`, `data_api_grant`, `data_api_keys`,
`data_api_origins`, `data_api_probe` read and change access to an enabled
Data API. `data_api_buckets` lists and creates storage buckets;
`data_api_auth` shows sign-in methods and providers and sets the sender name
of sign-in emails. Provider secrets never go through the chat — the person
sets them in the dashboard or with `layero data auth provider set`. Creating a database, SQL and enabling the API go through the CLI
(steps 1–4); sign-in and files — through the person (steps 5–6).
`data_api_grant`, key changes and origins need the person's explicit consent.
