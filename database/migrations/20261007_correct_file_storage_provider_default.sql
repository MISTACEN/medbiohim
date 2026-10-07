-- Correct the storage metadata default: old rows without a provider marker
-- must stay unknown rather than being guessed as B2.

ALTER TABLE public.files
  ALTER COLUMN storage_provider SET DEFAULT 'unknown';

UPDATE public.files
SET storage_provider = CASE
  WHEN NULLIF(b2_file_id,'') IS NOT NULL THEN 'b2'
  ELSE 'unknown'
END
WHERE storage_provider = 'b2' AND NULLIF(b2_file_id,'') IS NULL;
