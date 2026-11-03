# MEDBIOHIM content synchronization — 2026-10-06

## Final live-state checks

The Supabase content graph was reconciled across questions, tests, exam-question banks, ticket banks, trainer cards, materials, and test attempts.

### Published content

- 660 published active questions
- 32 published tests
- 854 test_questions links
- 776 published exam_questions
- 13 ticket_banks, all with subject_id
- 206 histology trainer-card questions now belong to the canonical histology subject
- 28 published histology electronograms
- 178 published histology preparations
- 80 published histology materials

### Integrity checks

- 0 published questions without subject_id
- 0 published tests without subject_id
- 0 published exam questions without subject_id
- 0 broken test_questions foreign keys
- 0 cross-subject test/question links
- 0 tests without questions
- 0 orphan test attempts
- 0 orphan test answers
- 0 orphan trainer answers
- 0 published materials with missing/broken source
- 0 published MCQ questions without an answer
- 0 published placeholder question

### Histology

Canonical subject: 977d78ca-7a58-4b0a-9e93-29d8e03f6946.

The published histology exam layer is 366 questions: 350 canonical + 16 unique ZIP additions. 100 exact-text ZIP duplicates remain archived rather than deleted.

The published cytology test keeps 96 question links, with archived duplicate links replaced by active canonical question rows.

### Organic chemistry

The canonical application subject is chemistry_organic_physical. The 260-row organic_chemistry exam import is now linked to that subject through subject_id. One unused placeholder question (x) was archived. Five published organic-chemistry MCQs with missing answer keys were repaired using the source bank's option numbering.

The SQL for these repairs is stored in database/migrations/20261006_full_content_sync.sql.
