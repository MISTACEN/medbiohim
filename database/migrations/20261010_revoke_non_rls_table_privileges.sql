-- MEDBIOHIM least-privilege hardening for the exposed public schema.
-- Date: 2026-10-10
-- Purpose: RLS does not govern TRUNCATE, and client roles do not need to
-- create triggers or foreign-key references on application tables.
-- IMPORTANT: this migration is committed but has NOT been applied to live Supabase.
-- Review in staging and apply only after confirming the migration runner role.

BEGIN;

REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

-- Keep future tables created by either normal migration owner from regaining
-- non-RLS privileges for browser-facing roles.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

COMMIT;
