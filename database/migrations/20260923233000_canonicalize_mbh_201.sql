-- Canonicalize the medical biochemistry cohort.
-- The historical "Медико-биологический 201" row was the accidental group
-- used by the real schedule; "Медицинская Биохимия" was an empty duplicate.
DO $$
DECLARE
  canonical uuid := 'a1000000-0000-4000-8000-000000000002';
  legacy uuid := 'ba5819a6-9395-4b2e-8f02-562a0fdf00a7';
  refs bigint := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.groups WHERE id = legacy) THEN
    SELECT
      (SELECT count(*) FROM public.group_memberships WHERE group_id = legacy) +
      (SELECT count(*) FROM public.schedules WHERE group_id = legacy) +
      (SELECT count(*) FROM public.homeworks WHERE group_id = legacy)
    INTO refs;
    IF refs > 0 THEN
      RAISE EXCEPTION 'Cannot remove legacy medical biochemistry group: % references remain', refs;
    END IF;
    DELETE FROM public.groups WHERE id = legacy;
  END IF;

  UPDATE public.groups
     SET name = 'МБХ 201',
         code = 'МБХ-201',
         course_number = 2
   WHERE id = canonical;
END $$;
