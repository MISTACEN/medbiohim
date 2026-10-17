-- Link each electronogram asset to its matching source DOCX in Upstash Blob.
-- The archive's docx-to-image map confirms one DOCX per canonical electronogram.
update public.histology_assets a
set source_docx = 'histology/electronograms/docx/' || a.title || '.docx',
    updated_at = now()
where a.subject_slug = 'histology'
  and 'mbh' = any(a.specialty_scope)
  and a.kind = 'electronogram'
  and exists (
    select 1
    from public.trainer_feed_cards c
    where c.subject_slug = 'histology'
      and c.specialty_slug = 'mbh'
      and c.mode_set = 'electronogram'
      and c.is_published = true
      and c.id = replace(a.id, 'asset-', '')
  );
