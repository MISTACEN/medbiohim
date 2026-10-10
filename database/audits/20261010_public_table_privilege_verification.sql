-- MEDBIOHIM public table privilege verification (read-only)
-- Run before and after the least-privilege migration.
-- No INSERT/UPDATE/DELETE/DDL is performed by this audit.
-- PostgreSQL 17 supports MAINTAIN as a table privilege.

SELECT current_setting('server_version') AS server_version;

SELECT
  p.rolname AS client_role,
  v.privilege,
  count(*) FILTER (
    WHERE has_table_privilege(p.rolname, c.oid, v.privilege)
  ) AS tables_with_privilege,
  count(*) AS public_base_or_partitioned_tables
FROM pg_roles p
CROSS JOIN pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN (VALUES ('MAINTAIN'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) v(privilege)
WHERE p.rolname IN ('anon', 'authenticated')
  AND n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
GROUP BY p.rolname, v.privilege
ORDER BY p.rolname, v.privilege;

-- Expected post-migration result: tables_with_privilege = 0 for all 8 rows.
-- If any row remains non-zero, inspect ownership/inherited privileges and defaults.
SELECT
  d.defaclrole::regrole::text AS object_owner,
  n.nspname AS schema_name,
  d.defaclobjtype AS object_type,
  x.grantee::regrole::text AS grantee,
  x.privilege_type,
  x.is_grantable
FROM pg_default_acl d
JOIN pg_namespace n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) x
WHERE n.nspname = 'public'
  AND d.defaclobjtype = 'r'
  AND x.grantee IN (
    (SELECT oid FROM pg_roles WHERE rolname = 'anon'),
    (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
  )
  AND x.privilege_type IN ('MAINTAIN', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
ORDER BY object_owner, grantee, privilege_type;
