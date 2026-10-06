# Admin Data Console — architecture and roadmap

## Purpose

MEDBIOHIM keeps Supabase/PostgreSQL as the single source of truth. The admin interface is a convenience layer over the existing API and must never become a second database.

The current admin database screen is an Excel-like table editor with:
- whitelisted tables only;
- server-side admin authorization;
- insert/update/delete;
- composite-key support;
- audit log and rollback;
- XLSX import/export;
- row search and paginated display.

## Direction

The console should evolve into a lightweight PC-style data manager rather than expose raw SQL.

### Database workspace

1. **Left/navigation pane**
   - database domains: Users & access, Academic, Tests & questions, Homework, Content, Histology, System;
   - table search;
   - row counts.
2. **Main grid**
   - column sorting;
   - filters;
   - pagination;
   - frozen key columns;
   - readable JSON/object viewer;
   - edit only explicitly selected cells/rows;
   - dirty-state indicator.
3. **Right details panel**
   - complete row;
   - relations and linked records;
   - history;
   - safe actions.
4. **Operations**
   - create/edit/archive/restore;
   - XLSX/CSV import/export;
   - dry-run validation before bulk import;
   - audit trail.
5. **Safety**
   - never expose arbitrary SQL in the normal UI;
   - keep a strict table allowlist;
   - server-side role checks;
   - destructive actions require confirmation;
   - rollback where a safe snapshot exists.

## File/object workspace

A separate future tab should manage physical files without pretending they are PostgreSQL rows:

- SpaceWeb content tree;
- Backblaze B2 objects;
- Supabase file metadata;
- object key/path;
- MIME type and size;
- existence check;
- orphan detection;
- metadata ↔ physical-file reconciliation;
- safe move/rename/delete;
- upload/download where the provider supports it;
- checksum/deduplication where useful.

The file workspace must not copy the whole Histology archive into Supabase. Supabase remains metadata/database; SpaceWeb/B2 remain binary storage layers.

## Important boundary

The UI may aggregate information from Supabase, SpaceWeb and B2 into one screen, but each resource keeps a canonical owner:

- PostgreSQL data → Supabase;
- PHP/API runtime → SpaceWeb;
- existing Histology physical media → SpaceWeb;
- optional heavy-object/backup layer → B2;
- frontend → Vercel.

If a secondary provider is unavailable, the core MEDBIOHIM database and educational flows must continue to work.

## Free-tier rule

This console is an administration convenience, not a reason to introduce a paid dependency. Provider APIs must be used with pagination, caching, bounded scans and explicit limits.

## Next safe improvements

- table/column filters and sorting;
- relation-aware row inspector;
- bulk edit with dry-run;
- database health/reconciliation checks;
- SpaceWeb/B2 file manager;
- provider capacity/status panel;
- backup/export snapshots.

These improvements should be incremental and preserve the stable 2026-10-07 baseline.
