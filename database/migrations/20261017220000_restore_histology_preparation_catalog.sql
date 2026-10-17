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


-- Restore source-backed lecture bodies from the existing study-table materials.
-- Publish only substantive notes; short/incomplete sources remain unpublished for review.
with mapping(lecture_id, source_keys) as (
  values
    ('lec-hist-cytology',array['histology-zip-scheme-1']::text[]),
    ('lec-hist-embryology',array['histology-zip-scheme-2','histology-zip-scheme-27']::text[]),
    ('lec-hist-epithelium',array['histology-zip-scheme-3']::text[]),
    ('lec-hist-connective',array['histology-zip-scheme-5','histology-zip-scheme-6']::text[]),
    ('lec-hist-bone_muscle',array['histology-zip-scheme-7','histology-zip-scheme-8']::text[]),
    ('lec-hist-hematopoiesis',array['histology-zip-scheme-4','histology-zip-scheme-15','histology-zip-scheme-16']::text[]),
    ('lec-hist-nerve_tissue',array['histology-zip-scheme-9']::text[]),
    ('lec-hist-nervous_system',array['histology-zip-scheme-10','histology-zip-scheme-11','histology-zip-scheme-12','histology-zip-scheme-13']::text[]),
    ('lec-hist-cvs',array['histology-zip-scheme-14']::text[]),
    ('lec-hist-gi',array['histology-zip-scheme-19','histology-zip-scheme-20']::text[]),
    ('lec-hist-glands',array['histology-zip-scheme-21']::text[]),
    ('lec-hist-respiratory',array['histology-zip-scheme-22']::text[]),
    ('lec-hist-skin',array['histology-zip-scheme-23']::text[]),
    ('lec-hist-urinary',array['histology-zip-scheme-24']::text[]),
    ('lec-hist-reproductive',array['histology-zip-scheme-25','histology-zip-scheme-26']::text[]),
    ('lec-hist-endocrine',array['histology-zip-scheme-17']::text[])
),
bodies as (
  select
    m.lecture_id,
    string_agg(
      '# '||mat.title||E'\n\n'||regexp_replace(coalesce(mat.content_html,''),'<[^>]*>','','g'),
      E'\n\n---\n\n' order by mat.order_index,mat.title
    ) as body,
    string_agg(mat.title,', ' order by mat.order_index,mat.title) as source_titles
  from mapping m
  join public.materials mat on mat.source_key=any(m.source_keys)
  join public.subjects s on s.id=mat.subject_id and s.slug='histology'
  where mat.is_published=true and coalesce(mat.content_html,'')<>''
  group by m.lecture_id
)
update public.histology_lectures l
set
  body_markdown='## Конспект по материалам учебного архива'||E'\n\n'||b.body||
    E'\n\n---\n\nИсточник: сохранённые материалы MEDBIOHIM — '||b.source_titles||
    '. Текст перенесён из исходных учебных таблиц; задания вида «заполнить таблицу» требуют самостоятельной проработки.',
  kind=case when length(b.body)>=500 then 'written_lecture' else 'written_lecture_stub' end,
  is_published=(length(b.body)>=500),
  updated_at=now()
from bodies b
where l.id=b.lecture_id;
