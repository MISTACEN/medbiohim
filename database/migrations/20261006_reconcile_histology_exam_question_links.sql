-- Reconcile histology exam-question provenance and subject links.
-- Restore the missing subject_id for the canonical 350-row bank.
-- Keep unique ZIP additions, but archive exact-text duplicates of the canonical bank.

UPDATE public.exam_questions
SET subject_id = '977d78ca-7a58-4b0a-9e93-29d8e03f6946'
WHERE subject_id IS NULL
  AND subject_slug = 'histology'
  AND source = 'features/exam-questions';

UPDATE public.exam_questions q
SET is_published = false,
    updated_at = now()
WHERE q.subject_id = '977d78ca-7a58-4b0a-9e93-29d8e03f6946'
  AND q.is_published = true
  AND q.source LIKE 'histology-zip-exam-med-ped%'
  AND EXISTS (
    SELECT 1
    FROM public.exam_questions c
    WHERE c.subject_id = '977d78ca-7a58-4b0a-9e93-29d8e03f6946'
      AND c.source = 'features/exam-questions'
      AND c.is_published = true
      AND lower(trim(c.text)) = lower(trim(q.text))
  );
