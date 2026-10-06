# Chemistry Master Catalog Audit — 2026-10-07

## Source package

User supplied:
- `smallpdf-compress-20261007-001659.zip`
- 7 scanned PDF documents
- 142 total PDF pages

The PDFs have no usable native text layer. OCR was tested, but it is not accepted as the sole source of truth because chemical formulas and schemes are frequently distorted.

Previously validated project artifacts were therefore cross-checked:
- `organic_chemistry_open_tasks_fixed.sql`
- `MEDBIOHIM_все_вопросы_по_темам_и_порядку.docx`
- existing current chemistry question bank in Supabase

## Live Supabase state

Before this pass:
- 260 published organic-chemistry open/exam tasks
- 176 published current-semester chemistry test questions
- 0 rows in `chemical_questions`

After this pass:
- `chemistry_master_documents` exists
- version: `2026-10-07-v1`
- one canonical document record
- 436 JSON items:
  - 260 open tasks
  - 176 test questions
- 176 test items retain options and authoritative answer
- all imported items retain source identifiers and curriculum references where available

## Formula safety

This pass deliberately does **not** fabricate structural or skeletal formulas.

If a formula/reaction is present in the source text, it is retained in Unicode/text form, including symbols such as:
`→`, `≡`, `=`, subscripts, chemical groups and reagents.

For prompts such as:
`Напишите структурные формулы ...`
the source sometimes gives only the compound name and expects the student to draw the structure. The original scan may contain surrounding graphical chemistry, but a generated formula is not treated as authoritative without checking the original page image.

This is important because replacing a scanned structural/skeletal formula with an OCR guess can silently change the chemistry.

## Current limitation

The source DOCX contains a larger archived test section than the 176 questions currently selected for the canonical current-semester production bank. A full expansion of every archived test item should be a separate controlled import with image-level verification for formula-heavy questions.

The 260 open tasks are already represented in the existing canonical `exam_questions` source and are included in the unified master document.

## Plan

Next chemistry-content pass:
1. verify every formula-heavy page against the original scan;
2. extract structural/skeletal formulas into a machine-readable representation where possible;
3. attach a source-page reference to each formula-heavy item;
4. create authoritative answers for open tasks only after verification;
5. expand the archived test section only after OCR/image verification;
6. keep current production tests and ticket banks untouched during the migration;
7. run final Supabase integrity checks;
8. run GitHub/Vercel build and browser verification.

## Safety rule

No existing ticket-bank UUIDs were modified.
No existing question text or answer was rewritten in this pass.
The master catalog is additive and is not the runtime source for scoring until separately verified.
