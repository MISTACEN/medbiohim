-- Restore the MBH histology preparation catalog and media asset index from the
-- already-published trainer feed. Idempotent: safe to re-run without duplicates.
-- Binary media remains in Upstash Blob; this migration stores only metadata/keys.

with src as (
  select
    regexp_replace(c.id, '^feed-', '') as id,
    coalesce(nullif(c.preparation->>'name',''), nullif(c.preparation->>'organ',''), 'Препарат') as title,
    coalesce(nullif(c.preparation->>'name',''), nullif(c.preparation->>'organ',''), 'Препарат') as exam_name,
    nullif(c.preparation->>'imageUrl','') as media_url,
    nullif(c.preparation->>'imagePath','') as image_path,
    c.tags
  from public.trainer_feed_cards c
  where c.subject_slug='histology'
    and c.specialty_slug='mbh'
    and c.mode_set='preparation'
    and c.is_published=true
),
mapped as (
  select
    id, title, exam_name, media_url, tags,
    case
      when media_url like '/content/histology/%'
        then substring(media_url from length('/content/histology/')+1)
      else image_path
    end as media_path
  from src
)
insert into public.histology_preparations (
  id, subject_slug, specialty_scope, title, exam_name,
  section_id, section_folder, source_folder, media_path, media_url,
  media_kind, uses, lecture_stub, is_published, created_at, updated_at
)
select
  id, 'histology', array['mbh']::text[], title, exam_name,
  case
    when coalesce(tags->>0,'') in (
      'cytology','embryology','epithelium','connective','bone_muscle',
      'nerve_tissue','nervous_system','cvs','gi','glands','urinary',
      'reproductive','respiratory','skin','endocrine','hematopoiesis','stom_mbh'
    ) then tags->>0
    when media_path ilike '%стом. гистология/%' then 'stom_mbh'
    else null
  end,
  case
    when media_path is not null and position('/' in media_path)>0
      then reverse(split_part(reverse(media_path), '/', 2))
    else null
  end,
  case
    when media_path ilike '%стом. гистология/%' then 'stom_histology'
    when media_path ilike '%частная гистология/%' then 'private_histology'
    else 'general_histology'
  end,
  media_path, media_url, 'image',
  jsonb_build_object('feedIdentify',true,'writtenLecture',true,'diagnostics',true,'exam',true),
  jsonb_build_object(
    'headline',title,
    'descriptionAlgorithm','cell_tissue_organ',
    'outline',jsonb_build_array(
      'Название препарата и окраска',
      'Опознавательные признаки (строение)',
      'Топография / источник развития',
      'Функции'
    )
  ),
  true, now(), now()
from mapped
on conflict (id) do update set
  subject_slug=excluded.subject_slug,
  specialty_scope=excluded.specialty_scope,
  title=excluded.title,
  exam_name=excluded.exam_name,
  section_id=coalesce(public.histology_preparations.section_id,excluded.section_id),
  section_folder=coalesce(public.histology_preparations.section_folder,excluded.section_folder),
  source_folder=coalesce(public.histology_preparations.source_folder,excluded.source_folder),
  media_path=excluded.media_path,
  media_url=excluded.media_url,
  media_kind='image',
  uses=coalesce(public.histology_preparations.uses,excluded.uses),
  lecture_stub=coalesce(public.histology_preparations.lecture_stub,excluded.lecture_stub),
  is_published=true,
  updated_at=now();

-- Index all 178 light-microscopy preparations and 28 electronograms without
-- duplicating their bytes in Postgres.
with src as (
  select
    c.id as card_id,
    regexp_replace(c.id, '^feed-', '') as preparation_id,
    c.mode_set,
    coalesce(nullif(c.preparation->>'name',''),nullif(c.preparation->>'organ',''),'Материал гистологии') as title,
    nullif(c.preparation->>'imageUrl','') as image_url,
    nullif(c.preparation->>'imagePath','') as image_path,
    nullif(c.source_key,'') as source_key,
    nullif(c.preparation->>'sourceDocx','') as source_docx
  from public.trainer_feed_cards c
  where c.subject_slug='histology'
    and c.specialty_slug='mbh'
    and c.is_published=true
    and c.mode_set in ('preparation','electronogram')
),
mapped as (
  select *,
    case
      when mode_set='electronogram' and source_key like 'electronograms/images/%'
        then 'histology/'||source_key
      when mode_set='electronogram' and image_path like 'electronograms/images/%'
        then 'histology/'||image_path
      when mode_set='preparation' and image_url like '/content/histology/%'
        then 'histology/'||substring(image_url from length('/content/histology/')+1)
      else null
    end as storage_key,
    case when mode_set='electronogram' then 'electronogram' else 'preparation' end as asset_kind,
    case
      when lower(coalesce(image_path,image_url,'')) like '%.png' then 'image/png'
      when lower(coalesce(image_path,image_url,'')) like '%.jpeg'
        or lower(coalesce(image_path,image_url,'')) like '%.jpg' then 'image/jpeg'
      when lower(coalesce(image_path,image_url,'')) like '%.gif' then 'image/gif'
      else 'application/octet-stream'
    end as mime
  from src
)
insert into public.histology_assets (
  id, subject_slug, specialty_scope, kind, title, storage_path,
  source_path, source_docx, mime_type, preparation_id, is_published, created_at, updated_at
)
select
  'asset-'||card_id, 'histology', array['mbh']::text[], asset_kind, title, storage_key,
  coalesce(image_url,image_path), source_docx, mime,
  case when mode_set='preparation' then preparation_id else null end,
  true, now(), now()
from mapped
where storage_key is not null
on conflict (id) do update set
  subject_slug=excluded.subject_slug,
  specialty_scope=excluded.specialty_scope,
  kind=excluded.kind,
  title=excluded.title,
  storage_path=excluded.storage_path,
  source_path=excluded.source_path,
  source_docx=excluded.source_docx,
  mime_type=excluded.mime_type,
  preparation_id=excluded.preparation_id,
  is_published=true,
  updated_at=now();
