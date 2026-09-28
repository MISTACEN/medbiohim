-- Find and remove duplicate electronogram trainer_feed_cards
-- Keep the row with the richest captions / earliest id

-- 1) Diagnostic: duplicates by name
SELECT preparation->>'name' AS name,
       COUNT(*) AS n,
       array_agg(id ORDER BY id) AS ids,
       array_agg(source_key ORDER BY id) AS sources
FROM public.trainer_feed_cards
WHERE subject_slug = 'histology'
  AND (mode_set = 'electronogram' OR tags @> ARRAY['electronogram']::text[])
GROUP BY preparation->>'name'
HAVING COUNT(*) > 1
ORDER BY n DESC, name;

-- 2) Diagnostic: duplicates by source_key
SELECT source_key,
       COUNT(*) AS n,
       array_agg(id ORDER BY id) AS ids,
       array_agg(preparation->>'name' ORDER BY id) AS names
FROM public.trainer_feed_cards
WHERE subject_slug = 'histology'
  AND (mode_set = 'electronogram' OR tags @> ARRAY['electronogram']::text[])
  AND source_key IS NOT NULL AND trim(source_key) <> ''
GROUP BY source_key
HAVING COUNT(*) > 1
ORDER BY n DESC;

BEGIN;

WITH ranked AS (
  SELECT id,
         preparation->>'name' AS name,
         COALESCE(jsonb_array_length(preparation->'captions'), 0) AS cap_n,
         ROW_NUMBER() OVER (
           PARTITION BY lower(trim(preparation->>'name'))
           ORDER BY COALESCE(jsonb_array_length(preparation->'captions'), 0) DESC,
                    (is_published IS TRUE) DESC,
                    id ASC
         ) AS rn
  FROM public.trainer_feed_cards
  WHERE subject_slug = 'histology'
    AND (mode_set = 'electronogram' OR tags @> ARRAY['electronogram']::text[])
    AND preparation->>'name' IS NOT NULL
)
DELETE FROM public.trainer_feed_cards t
USING ranked r
WHERE t.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         source_key,
         COALESCE(jsonb_array_length(preparation->'captions'), 0) AS cap_n,
         ROW_NUMBER() OVER (
           PARTITION BY source_key
           ORDER BY COALESCE(jsonb_array_length(preparation->'captions'), 0) DESC,
                    id ASC
         ) AS rn
  FROM public.trainer_feed_cards
  WHERE subject_slug = 'histology'
    AND (mode_set = 'electronogram' OR tags @> ARRAY['electronogram']::text[])
    AND source_key IS NOT NULL AND trim(source_key) <> ''
)
DELETE FROM public.trainer_feed_cards t
USING ranked r
WHERE t.id = r.id
  AND r.rn > 1;

SELECT COUNT(*) AS em_rows,
       COUNT(DISTINCT preparation->>'name') AS unique_names
FROM public.trainer_feed_cards
WHERE subject_slug = 'histology'
  AND (mode_set = 'electronogram' OR tags @> ARRAY['electronogram']::text[]);

COMMIT;
