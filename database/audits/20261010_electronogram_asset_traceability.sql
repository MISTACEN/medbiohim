-- MEDBIOHIM: read-only electronogram asset traceability audit
-- Date: 2026-10-10
-- Scope is intentionally restricted to Histology electronogram cards.
-- This file performs SELECTs only; it does not modify production data.

SELECT
  count(*) AS total_cards,
  count(*) FILTER (WHERE source_key LIKE 'electronograms/images/%') AS canonical_source_keys,
  count(*) FILTER (WHERE source_file_id IS NULL) AS missing_file_links,
  count(*) FILTER (WHERE preparation->>'imageUrl' IS NOT NULL) AS cards_with_image_url,
  count(*) FILTER (
    WHERE preparation->>'imageUrl' IS NOT NULL
      AND split_part(preparation->>'imageUrl', '/', array_length(string_to_array(preparation->>'imageUrl', '/'), 1))
          <> split_part(source_key, '/', array_length(string_to_array(source_key, '/'), 1))
  ) AS basename_mismatches,
  count(*) FILTER (WHERE preparation ? 'captions') AS cards_with_captions
FROM public.trainer_feed_cards
WHERE subject_slug = 'histology'
  AND mode_set = 'electronogram';

SELECT
  id,
  source_key,
  preparation->>'imageUrl' AS image_url,
  preparation->>'imagePath' AS image_path,
  source_file_id,
  preparation->'captions' AS captions
FROM public.trainer_feed_cards
WHERE subject_slug = 'histology'
  AND mode_set = 'electronogram'
  AND (
    source_key NOT LIKE 'electronograms/images/%'
    OR preparation->>'imageUrl' IS NULL
    OR split_part(preparation->>'imageUrl', '/', array_length(string_to_array(preparation->>'imageUrl', '/'), 1))
       <> split_part(source_key, '/', array_length(string_to_array(source_key, '/'), 1))
  )
ORDER BY id;
