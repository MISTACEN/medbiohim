-- MEDBIOHIM least-privilege hardening for the exposed public schema.
-- Date: 2026-10-10
-- Purpose: RLS does not govern TRUNCATE, and browser-facing roles do not need
-- MAINTAIN, REFERENCES, or TRIGGER privileges on application tables.
-- IMPORTANT: this migration is committed but has NOT been applied to live Supabase.
-- Review in staging and apply only after confirming the migration runner role.
-- Privilege syntax is intended for the observed PostgreSQL 17.6 server;
-- migration execution in staging/production has not yet been performed.

BEGIN;

REVOKE MAINTAIN, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

-- Keep future tables created by either observed migration owner from regaining
-- non-RLS privileges for browser-facing roles.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE MAINTAIN, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE MAINTAIN, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

COMMIT;
