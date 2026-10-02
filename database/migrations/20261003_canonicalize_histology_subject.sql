-- 2026-10-03: keep the populated semester-3 histology subject as the canonical record.
-- The duplicate semester-4 row is empty and was causing ambiguous slug resolution.
update public.subjects
set is_active = false
where id = '6833cf01-249f-40ea-934f-c9848565bf22'
  and slug = 'histology'
  and not exists (
    select 1 from public.materials where subject_id = '6833cf01-249f-40ea-934f-c9848565bf22'
  )
  and not exists (
    select 1 from public.trainer_feed_cards where subject_id = '6833cf01-249f-40ea-934f-c9848565bf22'
  )
  and not exists (
    select 1 from public.questions where subject_id = '6833cf01-249f-40ea-934f-c9848565bf22'
  )
  and not exists (
    select 1 from public.tests where subject_id = '6833cf01-249f-40ea-934f-c9848565bf22'
  );
