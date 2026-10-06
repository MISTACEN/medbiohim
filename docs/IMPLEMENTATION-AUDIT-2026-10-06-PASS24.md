# IMPLEMENTATION AUDIT — 2026-10-06 — PASS 24

## Tests / questions ↔ lesson topics

### Implemented

1. The existing relational model is reused instead of introducing a duplicate topic system:
   - `subjects`;
   - `modules`;
   - `topics`;
   - `questions.module_id/topic_id`;
   - `tests.module_id/topic_id`.
2. Added `TestRepository::curriculumMap()`.
3. Added `GET /api/v1/tests/curriculum-map`.
4. The endpoint is scoped to the user's canonical group academic context:
   - course;
   - semester;
   - specialty;
   - optional subject.
5. The API explicitly reports published questions that have no `topic_id` instead of guessing their topic.
6. `GET /api/v1/tests` now exposes module/topic titles and ordering metadata.
7. Test detail questions now expose topic titles for the UI.
8. Tests page now shows:
   - subject;
   - module;
   - lesson topic;
   - question count;
   - test count;
   - a direct bank link when a topic has a published test.
9. Question bank now has a topic filter, so the bank can be studied by lesson rather than as one flat list.

### Current production data check

For active group `МБХ-201`, the current histology topic map contains lesson topics from week 1 through week 18. Existing question coverage is currently populated through the early part of the plan; later topics are present in the plan but have zero tagged questions/tests.

Current published question totals:
- 660 published/non-archived questions overall;
- 273 already have `topic_id`;
- 387 do not have a topic.

For the current histology subject:
- 479 published/non-archived questions;
- 273 are already topic-linked;
- 206 remain without a topic.

The system deliberately does **not** auto-assign those 206 questions by text similarity or test membership. That would create false curriculum mappings.

### Important limitation

`curriculum_items` currently contains subject-level plan rows for the active 2nd-year/3rd-semester plan, but not a complete row for every lesson/topic. The detailed lesson structure currently comes from `modules/topics` where it has been imported (histology already has a detailed week/topic hierarchy).

Therefore this pass implements the correct technical path and UI, but does not invent missing lesson-plan data for subjects whose detailed plan has not yet been imported.

### Next

Import/normalize the detailed lesson plan for each current-semester subject, then tag the remaining questions against canonical topic UUIDs. Only high-confidence mappings should be automated; ambiguous questions should go to the admin review queue.

### Verification

Supabase SQL verification confirms the topic hierarchy and question/test counts for `МБХ-201`.

Target-environment PHP/Next/browser verification remains required; no claim of production runtime green is made in this pass.
