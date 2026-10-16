-- Allow explicit metadata for files whose binary is stored in private Upstash Blob.
BEGIN;
ALTER TABLE public.files DROP CONSTRAINT IF EXISTS files_storage_provider_check;
ALTER TABLE public.files
  ADD CONSTRAINT files_storage_provider_check
  CHECK (storage_provider = ANY (ARRAY['b2','spaceweb','external','unknown','upstash_blob']::text[]));
COMMIT;
