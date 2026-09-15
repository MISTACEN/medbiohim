-- Correction for the official 2026/2027 course-2 timetable seed.
-- The source document lists the Friday 08:30/10:40 histology classes on 04.09–25.12 and additionally 18.01.
-- It does NOT list 01.01, 08.01 or 15.01 in those Friday rows. Remove those accidental seed dates if the base seed was applied.

DO $$
DECLARE
  g RECORD;
BEGIN
  FOR g IN
    SELECT id FROM public.groups WHERE is_active = true AND course_number = 2
  LOOP
    DELETE FROM public.schedule_entries e
    USING public.schedules s
    WHERE e.schedule_id = s.id
      AND s.group_id = g.id
      AND s.semester = 3
      AND s.version = 1
      AND e.subject_id = (SELECT id FROM public.subjects WHERE lower(name)=lower('Гистология, цитология') AND semester=3 LIMIT 1)
      AND e.date IN ('2027-01-01','2027-01-08','2027-01-15')
      AND e.start_time IN ('08:30','10:40');
  END LOOP;
END $$;
