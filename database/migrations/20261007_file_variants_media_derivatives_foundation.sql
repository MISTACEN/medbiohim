-- MEDBIOHIM: non-destructive media derivative metadata foundation.
-- Physical derivative generation is intentionally a later worker pass.
CREATE TABLE IF NOT EXISTS public.file_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_file_id uuid NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  variant_key text NOT NULL,
  mime_type text,
  size_bytes bigint,
  object_key text NOT NULL,
  b2_file_id text,
  sha256 text,
  width integer,
  height integer,
  duration_ms integer,
  processing_status text NOT NULL DEFAULT 'ready',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT file_variants_variant_key_check CHECK (variant_key ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  CONSTRAINT file_variants_processing_status_check CHECK (processing_status IN ('ready','queued','processing','failed','skipped')),
  CONSTRAINT file_variants_parent_variant_unique UNIQUE (parent_file_id, variant_key)
);

CREATE INDEX IF NOT EXISTS file_variants_parent_idx ON public.file_variants(parent_file_id);
CREATE INDEX IF NOT EXISTS file_variants_sha256_idx ON public.file_variants(sha256);
CREATE INDEX IF NOT EXISTS file_variants_processing_status_idx ON public.file_variants(processing_status);

ALTER TABLE public.file_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS file_variants_read_allowed ON public.file_variants;
CREATE POLICY file_variants_read_allowed
ON public.file_variants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.files f
    WHERE f.id = file_variants.parent_file_id
      AND f.status = 'active'
      AND (
        f.uploaded_by = auth.uid()
        OR f.visibility = 'public'
        OR (
          f.group_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.group_memberships gm
            WHERE gm.group_id = f.group_id
              AND gm.user_id = auth.uid()
              AND gm.is_active = true
          )
        )
      )
  )
);