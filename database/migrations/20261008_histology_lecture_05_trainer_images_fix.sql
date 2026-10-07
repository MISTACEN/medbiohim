-- 2026-10-08: make Lecture 05 trainer photos load through the authenticated trainer-media pipeline.
-- The physical histology media lives on SpaceWeb, not in Vercel /public.
-- Do not rewrite trainer cards; reuse their canonical IDs and existing media route.

update public.site_content
set payload = jsonb_set(
  payload,
  '{items,0,body_md}',
  to_jsonb(
    replace(
      replace(
        replace(
          replace(
            replace(
              payload->'items'->0->>'body_md',
              '{"url":"/content/histology/5_Фотографии препаратов/цитология, эмбриология и общая гистология/5.Соед.тк. Кровь. Нейтр. и эозиноф..jpg","caption"',
              '{"trainerId":"feed-prep-9f7dc534b5","caption"'
            ),
            '{"url":"/content/histology/5_Фотографии препаратов/цитология, эмбриология и общая гистология/5.Соед.тк. Кровь. Эозинофил и нейтр..jpg","caption"',
            '{"trainerId":"feed-prep-a47e9dc83a","caption"'
          ),
          '{"url":"/content/histology/5_Фотографии препаратов/цитология, эмбриология и общая гистология/5.Соед.тк. Кровь.Лимфоцит и моноцит..jpg","caption"',
          '{"trainerId":"feed-prep-a2feb3ec86","caption"'
        ),
        '{"url":"/content/histology/5_Фотографии препаратов/цитология, эмбриология и общая гистология/5.Соед.тк. Кровь.Моноцит..jpg","caption"',
        '{"trainerId":"feed-prep-bca30caf3b","caption"'
      ),
      '{"url":"/content/histology/5_Фотографии препаратов/цитология, эмбриология и общая гистология/5.Соед.тк. Кровь.Тромбоциты..jpg","caption"',
      '{"trainerId":"feed-prep-60e72c3e7e","caption"'
    )
  )
)
where key='lectures'
  and payload->'items'->0->>'id'='lec-histology-blood-20261008'
  and payload->'items'->0->>'body_md' not like '%"trainerId":"feed-prep-9f7dc534b5"%';

-- Verification:
-- Lecture 05 must contain trainerId fields and no old /content/histology photo URLs.
