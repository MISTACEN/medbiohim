-- Keep legacy rows for audit, but do not expose questions that cannot be
-- traced to the canonical Гистология.zip source or to a canonical keyed copy.
WITH orphaned AS (
  SELECT n.id
  FROM public.questions n
  WHERE n.subject_id='977d78ca-7a58-4b0a-9e93-29d8e03f6946'
    AND n.source_key IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.questions k
      WHERE k.subject_id=n.subject_id
        AND k.source_key IS NOT NULL
        AND k.text=n.text
        AND k.options @> jsonb_build_array(n.answer)
    )
)
UPDATE public.questions q
SET is_published=false,
    archived_at=COALESCE(q.archived_at,now())
FROM orphaned o
WHERE q.id=o.id;
