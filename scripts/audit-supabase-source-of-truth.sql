-- MEDBIOHIM: read-only Supabase source-of-truth audit
-- Safe to run in the Supabase SQL Editor. No DDL/DML; no secrets are read.
-- Some metadata views may require elevated SQL Editor privileges.

-- 1) Public tables and RLS state.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;

-- 2) RLS policy inventory (review the expressions, not just the count).
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'private')
order by schemaname, tablename, policyname;

-- 3) RPC/function inventory, including SECURITY DEFINER flag.
select n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as result_type,
       p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
order by n.nspname, p.proname, arguments;

-- 4) Required-object check for known Worker/schema contract risks.
select x.name,
       to_regclass('public.' || x.name) is not null as exists
from (values
  ('users'),
  ('user_preferences'),
  ('user_settings'),
  ('groups'),
  ('group_memberships'),
  ('subjects'),
  ('schedules'),
  ('schedule_entries'),
  ('student_academic_states'),
  ('user_topic_progress'),
  ('telegram_bot_chats'),
  ('telegram_accounts'),
  ('telegram_account_link_tokens'),
  ('trainer_feed_cards'),
  ('materials'),
  ('files')
) as x(name)
order by x.name;

-- 5) Constraints involving polymorphic academic-state target IDs.
-- Expected result: target_id does not have a direct FK to topics because it
-- represents curriculum_item/topic/subject depending on target_type.
select tc.table_name, kcu.column_name, ccu.table_name as referenced_table,
       ccu.column_name as referenced_column, tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.constraint_schema = kcu.constraint_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.constraint_schema = tc.constraint_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and tc.table_name in ('student_academic_states', 'user_topic_progress')
order by tc.table_name, tc.constraint_name;

-- 6) Migration history should also be checked via Supabase's migration listing
-- (or the project's migration history view) and compared to repository files.
-- Do not infer migration parity from this script alone.
