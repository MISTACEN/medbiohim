# Data integrity reconciliation — Pass 54

Date: 2026-10-10  
Branch: `main`  
Scope: read-only Supabase integrity audit for published tests, question links, and exam/ticket question answer semantics.

## Read-only checks performed

Project: `gnobvyjywtqbdfeejxmf`. No INSERT, UPDATE, DELETE, schema migration, or ticket-bank mutation was performed.

### Tests ↔ questions

- `questions`: 855 total; 660 published and non-archived.
- `tests`: 33 total; 32 published and non-archived.
- `test_questions`: 854 links.
- Duplicate `(test_id, question_id)` pairs: 0.
- Broken links to missing tests/questions: 0.
- Published active tests without questions: 0.
- Published active questions without a test link: 0.

Subject grouping showed 479 active published Histology questions and 176 active published organic/physical chemistry questions; both groups are fully linked. Five other active published questions belong to the legacy Anatomy/Biochemistry subjects whose `subjects.slug` is NULL; each has a valid subject_id and test link. This is metadata normalization/legacy cleanup, not an orphan-link defect, and was not changed.

### `exam_questions`

- Total: 876; published: 776.
- Published blank prompts: 0.
- Published records with a missing subject identity: 0.
- Broken non-null module links: 0.
- Broken non-null topic links: 0.
- Published blank `answer` values: 719.

The 719 blank answers are not evidence of 719 broken records. Grouping by `subject_slug`, `kind`, and `type` shows they are ticket/open or preparation-style records: 274 Histology open tickets, 260 organic chemistry open tickets, 35 Biology, 31 Mathematical Analysis, 24 History, 22 Physics, 20 Organic Physical Chemistry, 18 Inorganic Chemistry, 19 Histology preparation records, and 16 Histology ticket/text records. All 57 published Histology case records have non-empty answers. These question types may intentionally require a student's free-form oral/written response; do not auto-fill answers or unpublish/delete them without curriculum/source review.

## Result

- 🟢 Current test-question relationships pass the checked referential and coverage invariants.
- 🟢 Published question prompts and non-null curriculum links pass the checked completeness checks.
- 🟡 Five legacy Anatomy/Biochemistry subjects have NULL slugs; linked questions are not orphaned. Normalize only after confirming canonical subject identifiers and frontend expectations.
- 🟡 The 719 blank exam-question answers need semantic/source review by type before any remediation; the current evidence is consistent with open-ticket workflows.
- 🔴 GitHub Actions runner allocation remains blocked before steps (`runner_id=0`, `steps=[]`); this database read-only audit does not substitute for CI or runtime tests.

## Verification limitations

This pass did not validate frontend flows, PHP runtime, physical media delivery, RLS behavior under end-user JWTs, or production deployments. No database changes were made.

## Next step

Continue the roadmap with the next unresolved release gate: restore GitHub Actions runner execution and run the exact-main checks; then verify Vercel/SpaceWeb deployment and physical Histology media over HTTP. Keep ticket banks protected and do not alter content from counts alone.
