# Supabase synchronization — MEDBIOHIM

## Canonical architecture

- **Frontend:** Next.js/React on Vercel.
- **API:** PHP backend on SpaceWeb.
- **Database/Auth:** Supabase project `gnobvyjywtqbdfeejxmf`.
- **File binaries:** Backblaze B2.
- **Application source:** `MISTACEN/medbiohim`, branch `main`.
- **`beta`:** experimental branch; it is intentionally allowed to diverge.

Browser requests stay same-origin:

```
Browser
  -> Vercel Next.js /api/v1/*
  -> SpaceWeb PHP API
  -> Supabase / Backblaze B2
```

There is deliberately **no PHP runtime requirement on Vercel**. The old `api/index.php` bridge was experimental and is no longer part of the deployment architecture.

## Source of truth

- Runtime application data: **Supabase PostgreSQL**.
- Runtime file binaries: **Backblaze B2**.
- Frontend/backend source: **GitHub**.
- `backend/data/*.json`: legacy import source only; never runtime persistence.

## Migration synchronization policy

The connected Supabase project is the production database and its remote migration history is authoritative for what has already been applied.

The repository currently contains historical SQL under `database/migrations/`, but that directory is **not a byte-for-byte copy of the remote migration history**. In particular, several 2026-09-22/23 repository filenames do not have the same migration versions as the remote project.

Therefore:

1. **Do not run `supabase db push` against the current repository migration directory as a blind reconciliation.**
2. Do not rename old migration files to pretend that their versions match remote history.
3. Do not re-apply schema changes that are already present in production.
4. New schema changes must be reviewed against the actual remote schema first.
5. When the migration baseline is reconstructed, it must be committed as a deliberate baseline/reconciliation change.

This is a safety measure against duplicate indexes, policies, functions and tables.

## Remote migration snapshot

Verified 2026-09-24 against Supabase project `gnobvyjywtqbdfeejxmf`.

- Remote migration history: **58 applied migrations**.
- Latest remote migration: `20260924003228 add_histology_content_model`.
- Repository SQL under `database/migrations/` is **not** a complete mirror of those 58 remote migrations; GitHub currently contains only the historical/reconciliation SQL files that are intentionally tracked there.
- Therefore the remote history remains authoritative. Do not blindly run `supabase db push` from the repository migration directory.

## Current data snapshot

The current database has structural/academic data, including:

- users: 3
- groups: 4
- subjects: 114
- schedules: 5 (1 active)
- active schedule entries: 361
- trainer_feed_cards: 206 (all 206 published)
- trainer_feed_answers: 0
- files: 0
- user_roles: 4

The currently active schedule is:

- id: `4cc2d535-4da4-43fa-93f7-bcb3cff471d4`
- academic year: `2026/2027`
- semester: `3`
- version: `5`
- entries: `361`

Trainer content currently present:

- `subject_slug=histology`
- `specialty_slug=mbh`
- `206` published cards

Other application-content tables such as tests/homeworks may remain empty or partially populated depending on the import state.

This is an **import/content state**, not a reason to move the backend to Vercel.

## Legacy import

The JSON files remain an import source. Import them only as a separate, verified operation:

```bash
php backend/scripts/migrate_json_to_supabase.php
```

Do not delete/archive the JSON source until row counts and application behaviour have been verified.

## Current synchronization status — 2026-10-17

This section supersedes the earlier snapshots above where they conflict with newer live inspection. The active API target is Cloudflare Worker `medbiohim-api`, not the legacy PHP API. SpaceWeb is frozen; do not deploy to it or use it as an active runtime.

- Supabase project `gnobvyjywtqbdfeejxmf` is the relational source of truth. Current verified counts include subjects 114, schedule_entries 342, questions 875, exam_questions 884, tests 36, materials 80 (all published), curriculum_items 198, trainer_feed_cards 206, files 1.
- Migration `files_upstash_blob_provider_20261017` was applied successfully and is recorded remotely as `20261017005831`; the live `files_storage_provider_check` constraint now permits `upstash_blob`.
- Private Upstash Blob bucket `medbiohim-files` contains histology objects. Keep the bucket private and preserve all existing objects while reconciling object keys to Supabase metadata.
- Upstash Redis `medbiohimcache` is active in EU. A live SET/GET/TTL/DEL connectivity test succeeded and the temporary check key was deleted. The canonical Worker was missing `UPSTASH_REDIS_REST_TOKEN`; it has now been installed as a Cloudflare secret binding. The newest Worker deployment record shows 100% traffic on the new version. Redis remains cache/temporary state only.
- Redis had 21 legacy `mbhdeploy:v1:*` deployment-stamp keys; they were preserved.
- Important unresolved parity gap: all 206 trainer cards currently have `source_file_id IS NULL`, and `public.files` has one row. Existing Blob objects alone do not prove every card can resolve/download its correct image. Build a verified manifest and reconcile card-to-object mapping before marking media complete.
- No authenticated browser end-to-end tests were run in this pass. Do not mark dashboard, schedule CRUD, tests, materials, curriculum, upload/download, or admin CRUD as fully accepted until real authenticated requests pass.

Migration safety remains in force: compare remote migration history and live schema before applying additional DDL. Do not blindly run a full historical migration directory or reseed existing content.
