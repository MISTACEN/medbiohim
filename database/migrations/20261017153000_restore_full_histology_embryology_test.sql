-- Restore the full 67-question embryology test using source-backed questions already imported
-- from histology-cyto-embryo-2007. Hidden duplicate rows are mapped to their exact published
-- text+options counterpart; no answer or question text is invented.
BEGIN;
WITH target_test AS (
  SELECT t.id
  FROM public.tests t
  JOIN public.subjects s ON s.id=t.subject_id
  WHERE t.source_key='histology-mbh:embryology'
    AND s.slug='histology' AND s.course_number=2 AND s.semester=3
  ORDER BY t.created_at NULLS LAST
  LIMIT 1
),
source_questions AS (
  SELECT q.*, substring(q.source_key from 'q([0-9]+)$')::int AS source_order
  FROM public.questions q
  JOIN public.subjects s ON s.id=q.subject_id
  WHERE s.slug='histology'
    AND q.source_key LIKE 'local:histology-cyto-embryo-mixed-2007-q%'
    AND substring(q.source_key from 'q([0-9]+)$')::int BETWEEN 96 AND 162
),
resolved AS (
  SELECT q.source_order,
    CASE WHEN q.is_published THEN q.id
      ELSE (
        SELECT p.id
        FROM public.questions p
        WHERE p.subject_id=q.subject_id
          AND p.is_published
          AND lower(trim(p.text))=lower(trim(q.text))
          AND p.options=q.options
        ORDER BY (p.source_key LIKE 'histology-mbh:embryology:%') DESC, p.id
        LIMIT 1
      )
    END AS question_id
  FROM source_questions q
),
deleted AS (
  DELETE FROM public.test_questions tq
  USING target_test tt
  WHERE tq.test_id=tt.id
  RETURNING tq.test_id
)
INSERT INTO public.test_questions(test_id,question_id,order_index)
SELECT tt.id,r.question_id,r.source_order-95
FROM target_test tt
CROSS JOIN resolved r
WHERE r.question_id IS NOT NULL
ON CONFLICT (test_id,question_id) DO UPDATE SET order_index=EXCLUDED.order_index;

COMMIT;
