-- MEDBIOHIM full content synchronization — 2026-10-06
-- Reconciles published questions, tests, exam-question banks, ticket banks,
-- histology trainer questions and legacy subject links without deleting content.

BEGIN;

UPDATE public.tests
SET subject_id = '977d78ca-7a58-4b0a-9e93-29d8e03f6946'
WHERE id = 'b6d1e6b5-2a77-4a6c-8a9e-2a5f6e9c0d11'
  AND subject_id IS NULL;

UPDATE public.questions
SET subject_id = '977d78ca-7a58-4b0a-9e93-29d8e03f6946'
WHERE subject_id IS NULL
  AND is_published = true
  AND archived_at IS NULL
  AND source_key LIKE 'histology-mbh-card-feed-%';

WITH ranked_subjects AS (
  SELECT s.id, s.slug,
    row_number() OVER (
      PARTITION BY s.slug
      ORDER BY
        (SELECT count(*) FROM public.schedule_entries se WHERE se.subject_id=s.id) DESC,
        (SELECT count(*) FROM public.questions q WHERE q.subject_id=s.id) DESC,
        (SELECT count(*) FROM public.tests t WHERE t.subject_id=s.id) DESC,
        (SELECT count(*) FROM public.modules m WHERE m.subject_id=s.id) DESC,
        (SELECT count(*) FROM public.subject_gradebook_entries g WHERE g.subject_id=s.id) DESC,
        s.created_at ASC, s.id ASC
    ) AS rn
  FROM public.subjects s
),
exam_mapping AS (
  SELECT eq.id AS exam_id, rs.id AS subject_id
  FROM public.exam_questions eq
  JOIN ranked_subjects rs
    ON rs.slug = CASE
      WHEN eq.subject_slug = 'organic_chemistry' THEN 'chemistry_organic_physical'
      ELSE eq.subject_slug
    END
   AND rs.rn = 1
  WHERE eq.subject_id IS NULL
    AND eq.subject_slug IS NOT NULL
)
UPDATE public.exam_questions eq
SET subject_id = em.subject_id
FROM exam_mapping em
WHERE eq.id = em.exam_id;

WITH ranked_subjects AS (
  SELECT s.id, s.slug,
    row_number() OVER (
      PARTITION BY s.slug
      ORDER BY
        (SELECT count(*) FROM public.schedule_entries se WHERE se.subject_id=s.id) DESC,
        (SELECT count(*) FROM public.questions q WHERE q.subject_id=s.id) DESC,
        (SELECT count(*) FROM public.tests t WHERE t.subject_id=s.id) DESC,
        (SELECT count(*) FROM public.modules m WHERE m.subject_id=s.id) DESC,
        (SELECT count(*) FROM public.subject_gradebook_entries g WHERE g.subject_id=s.id) DESC,
        s.created_at ASC, s.id ASC
    ) AS rn
  FROM public.subjects s
)
UPDATE public.ticket_banks b
SET subject_id = rs.id
FROM ranked_subjects rs
WHERE b.subject_id IS NULL
  AND rs.rn = 1
  AND rs.slug = CASE
    WHEN b.subject_slug = 'organic_chemistry' THEN 'chemistry_organic_physical'
    ELSE b.subject_slug
  END;

UPDATE public.questions
SET is_published = false,
    archived_at = COALESCE(archived_at, now())
WHERE id = 'aec9853a-57ce-5d3b-ab32-1694a394a5ca';

UPDATE public.questions
SET answer = CASE id
  WHEN '658741cc-1f8a-514a-93cf-242d0d18c4a2' THEN '4'
  WHEN '78488c66-268e-5a7b-9f72-5a22ff176dd4' THEN '2'
  WHEN '803e864c-042e-569c-a176-182ed60d2b37' THEN '4'
  WHEN 'b449e854-5ad3-50a7-986e-17ebdce30fa9' THEN '4'
  WHEN 'b3fc6964-9a6b-5604-946d-a5e8f66e9fcc' THEN '3,1,2'
END
WHERE id IN (
  '658741cc-1f8a-514a-93cf-242d0d18c4a2',
  '78488c66-268e-5a7b-9f72-5a22ff176dd4',
  '803e864c-042e-569c-a176-182ed60d2b37',
  'b449e854-5ad3-50a7-986e-17ebdce30fa9',
  'b3fc6964-9a6b-5604-946d-a5e8f66e9fcc'
);

WITH replacement AS (
  SELECT old_link.test_id,
         old_link.question_id AS old_question_id,
         active_q.id AS new_question_id
  FROM public.test_questions old_link
  JOIN public.tests t ON t.id = old_link.test_id
  JOIN public.questions old_q ON old_q.id = old_link.question_id
  JOIN LATERAL (
    SELECT q2.id
    FROM public.questions q2
    WHERE q2.subject_id = old_q.subject_id
      AND q2.is_published = true
      AND q2.archived_at IS NULL
      AND lower(trim(q2.text)) = lower(trim(old_q.text))
    ORDER BY q2.created_at ASC, q2.id ASC
    LIMIT 1
  ) active_q ON true
  WHERE t.source_key = 'histology-test-derived-cytology'
    AND old_q.archived_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.test_questions already
      WHERE already.test_id = old_link.test_id
        AND already.question_id = active_q.id
    )
)
UPDATE public.test_questions tq
SET question_id = r.new_question_id
FROM replacement r
WHERE tq.test_id = r.test_id
  AND tq.question_id = r.old_question_id;

COMMIT;
