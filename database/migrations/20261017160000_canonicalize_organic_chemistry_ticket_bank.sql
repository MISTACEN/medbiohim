-- The archived 260-question organic chemistry ticket bank was already in Supabase,
-- but carried the legacy alias slug "organic_chemistry". Its subject_id is the canonical
-- 2nd-year/semester-3 chemistry subject and the 260 texts do not duplicate the canonical 20.
-- Align only the slug so the subject page and ticket API can find all 280 items.
BEGIN;
UPDATE public.exam_questions
SET subject_slug='chemistry_organic_physical',
    subject_name='Органическая и физическая химия'
WHERE subject_slug='organic_chemistry'
  AND subject_id='67f64120-ceac-45bf-a0cf-55d07b5379cc'::uuid
  AND source='dvgmu-orgchem-tasks-2004+tests-2016';
COMMIT;
