-- MEDBIOHIM: storage/media audit metadata foundation.
-- No binary moves/deletes. Existing rows remain valid.

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS sha256 text,
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'b2',
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'ready';

CREATE INDEX IF NOT EXISTS files_sha256_idx ON public.files (sha256);
CREATE INDEX IF NOT EXISTS files_storage_provider_idx ON public.files (storage_provider);
CREATE INDEX IF NOT EXISTS files_processing_status_idx ON public.files (processing_status);

ALTER TABLE public.files
  DROP CONSTRAINT IF EXISTS files_storage_provider_check;
ALTER TABLE public.files
  ADD CONSTRAINT files_storage_provider_check
  CHECK (storage_provider IN ('b2','spaceweb','external','unknown'));

ALTER TABLE public.files
  DROP CONSTRAINT IF EXISTS files_processing_status_check;
ALTER TABLE public.files
  ADD CONSTRAINT files_processing_status_check
  CHECK (processing_status IN ('ready','queued','processing','failed','skipped'));
