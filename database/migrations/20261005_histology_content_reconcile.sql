-- Reconcile histology content to the active 3rd-semester subject row.
-- The 4th-semester row remains inactive; future source-backed content is retained
-- but stays controlled by plan_status rather than being deleted.
UPDATE public.trainer_feed_cards
SET subject_id = '977d78ca-7a58-4b0a-9e93-29d8e03f6946'
WHERE subject_slug = 'histology'
  AND subject_id IS DISTINCT FROM '977d78ca-7a58-4b0a-9e93-29d8e03f6946';

UPDATE public.materials
SET source_key = 'histology-em-capillary-20261005'
WHERE id = '77c86e35-ba1f-4740-8c71-83173d03e023';

-- Source inventory for Гистология.zip is already represented in content_sources.
-- Do not delete future-semester rows: the study plan will be extended next semester.
