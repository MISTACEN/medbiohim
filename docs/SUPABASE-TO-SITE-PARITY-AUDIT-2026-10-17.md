# Supabase → site parity audit — 2026-10-17

Scope: read-only audit of live Supabase project `gnobvyjywtqbdfeejxmf`, frontend routes on `main`, and `workers/api/src/routes`. No database rows, RLS policies, secrets, or production routing were changed.

## Confirmed high-priority gaps

### P0 — Published materials API appears schema-incompatible
- Live `public.materials` has columns `id, subject_id, module_id, topic_id, type, title, file_id, external_url, content_html, order_index, is_published, created_at, updated_at, source_key`.
- `workers/api/src/routes/materials.ts` list query selects `id,title,subject_id,type,slug,summary,published_at`; `slug`, `summary`, and `published_at` do not exist in the live table.
- Therefore the list endpoint is expected to fail with a database column error instead of returning the 80 published material records. Confirm in a fresh authenticated request, then change the select/order to real schema columns and align response fields with frontend expectations.

### P0 — Histology trainer images are not linked to file records
- 206/206 published `trainer_feed_cards` have `source_file_id IS NULL`.
- `histology_assets`: 0 rows; `files`: 1 row total; `content_sources`: 261 rows but 0 have `file_id`.
- `histology_preparations`: 30 published rows; 206 trainer cards are published; the legacy archive previously inventoried 357 entries / 246 images but object upload and verified key mapping remain unconfirmed.
- The trainer UI exists in source, but DB metadata alone does not make the images downloadable. Reconcile object keys and verify private Blob/B2 object existence before claiming media parity.

### P1 — Histology lecture rows are all unpublished
- `histology_lectures`: 17 rows, 0 published. The lectures UI/page exists, but a published-only reader will show no lecture content until intended rows are reviewed and published.
- Do not bulk-publish without verifying scope/content quality.

### P1 — Chemistry structured knowledgebase is empty
- `chemical_molecules`: 0; `chemical_aliases`: 0; `chemical_properties`: 0; `chemical_reactions`: 0; `chemical_reaction_steps`: 0; `chemical_sources`: 0; `chemical_spectra`: 0; `chemical_questions`: 0.
- `chemical_functional_groups`: 8 and `chemical_topics`: 7.
- The visible chemistry resolver calls `/api/v1/chemistry/resolve`; the Worker route currently uses an external resolver, not the empty Supabase knowledge tables. Molecule/reaction/structure explorer and local chemistry question bank are not populated from Supabase.

### P1 — Dedicated Homework and Curriculum pages are redirects
- `src/app/homework/page.tsx` redirects to `/schedule`.
- `src/app/curriculum/page.tsx` redirects to `/academic`.
- Live DB has 198 curriculum items (178 active), 41 student academic-state rows, and 2,062 academic-history rows. The academic page exists, but the dedicated curriculum URL does not present a curriculum view. Homework tables currently have 0 `homeworks`, 0 `homework_progress`, and 0 `homework_submissions` rows; the UI can only show data once students create items or migration seeds intended content.

## Data present and source routes/pages exist (still require live authenticated smoke tests)

- Subjects: 114 rows.
- `materials`: 80 published rows, all with inline `content_html`, none with `file_id` or `external_url` (the route schema mismatch above likely blocks listing).
- `questions`: 875 rows (673 linked to histology, 182 chemistry, 15 physiology, 5 with no subject).
- `tests`: 36; `test_questions`: 913.
- `exam_questions`: 884 total, 784 published; histology 466, organic/physical chemistry 280, biology 35, physics 22, inorganic chemistry 18, physiology 8, history 24, mathematical analysis 31 (some subject_slug categories may overlap with course-specialty filters and need review).
- `ticket_banks`: 13 total, including 5 histology banks; do not replace bank UUIDs.
- `curriculum_items`: 198 total / 178 active; `subject_gradebook_entries`: 77.
- `histology_preparations`: 30 published; `trainer_feed_cards`: 206 published.

## Features with no stored user content yet (not necessarily missing implementation)

- `homeworks`: 0; `community_posts`: 0; `comments`: 0; `srs_cards`: 0; `telegram_accounts`: 0; `telegram_bot_chats`: 0.
- These may be correctly empty for a new/small student group. Verify creation flows and authenticated ownership rather than fabricating starter records.

## Audit order

1. Fix `materials.ts` against the actual schema; confirm list/detail/file endpoints with a signed-in request.
2. Finish histology file inventory → private Blob/B2 object verification → key mapping for the 206 cards; test mobile and desktop image viewing.
3. Review and selectively publish the 17 histology lectures; verify lecture-to-preparation links.
4. Populate chemistry molecule/reaction/source/question data from approved course sources, or explicitly mark those UI capabilities as not yet available.
5. Replace the Curriculum redirect with a real view over `curriculum_items` and connect status updates to `student_academic_states` / `academic_progress_history`.
6. Smoke-test user-created homework, community posting, SRS, Telegram linking, and all subject tabs with a real student session.
7. Confirm Vercel production and the canonical Worker are deployed from the intended `main` commit before closing any item.

## Limitations

This is a source/schema/data audit, not a full authenticated browser end-to-end run. No secrets were read or printed. No Supabase data or policies were modified.
