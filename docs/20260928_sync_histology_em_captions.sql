-- Sync electronogram captions (28) into trainer_feed_cards.preparation.captions
-- Prefer matching by card id. See also by_name fallback SQL.
-- Source: docs/histology-em-captions-28.json

BEGIN;

-- NOTE: Full per-card UPDATEs are in the artifact package.
-- GPT: if this short file is present without full UPDATEs, load docs/histology-em-captions-28.json
-- and apply:
-- UPDATE trainer_feed_cards
-- SET preparation = jsonb_set(COALESCE(preparation,'{}'::jsonb), '{captions}', :captions::jsonb)
-- WHERE id = :id OR source_key = :source_key;

-- Placeholder verification query after import:
SELECT id, preparation->>'name' AS name,
       jsonb_array_length(COALESCE(preparation->'captions','[]'::jsonb)) AS captions_n
FROM public.trainer_feed_cards
WHERE subject_slug = 'histology'
  AND (id LIKE 'feed-em-%' OR source_key LIKE 'histology-em-%')
ORDER BY name;

COMMIT;
