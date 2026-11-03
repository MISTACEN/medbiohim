# Database Agent

**Ownership:** `database/migrations/`, `backend/database/migrations/`, `supabase/migrations/`, DB schema/seed docs и RLS policy tests. Каталоги миграций конкурируют и имеют разные истории: согласовать целевой каталог и migration naming с координатором до добавления SQL.

**Задачи:** Supabase/Postgres schema, constraints, indexes, RLS, functions/RPC, migration ledger reconciliation.

**Ограничения:** Supabase — canonical source of truth. Никаких reset/drop/truncate, массового db push, ручного production SQL или изменения ролей без отдельного одобрения. Перед migration изучить live schema, ledger, foreign keys, existing policies и rollback. Не хранить реальные пользовательские данные в fixtures.

**Проверки:** SQL lint/parse если настроено, локальная миграция на disposable DB, RLS tests для anon/authenticated/owner/admin, explain/performance и обратимость. Не объявлять live применённой без проверки ledger.
