-- Complete the official course-2 autumn 2026/2027 timetable.
-- The source timetable explicitly contains 18.01 in the Friday histology row;
-- preserve that source date as-is rather than silently correcting it.

DO $$
DECLARE
  s RECORD;
  subj uuid;
BEGIN
  SELECT id INTO subj
  FROM public.subjects
  WHERE lower(name)=lower('Гистология, цитология')
    AND semester=3
  ORDER BY id
  LIMIT 1;

  IF subj IS NULL THEN
    RAISE EXCEPTION 'Subject Гистология, цитология for semester 3 not found';
  END IF;

  FOR s IN
    SELECT sc.id
    FROM public.schedules sc
    JOIN public.groups g ON g.id=sc.group_id
    WHERE g.is_active=true
      AND g.course_number=2
      AND sc.semester=3
  LOOP
    INSERT INTO public.schedule_entries
      (schedule_id, subject_id, date, start_time, end_time, type, subject_name, notes, sort_order, is_cancelled)
    SELECT
      s.id,
      subj,
      DATE '2027-01-18',
      TIME '08:00',
      TIME '10:10',
      'laboratory'::public.schedule_type,
      'Гистология, цитология',
      'Источник указал 18.01 в строке пятницы: 08.30–10.10 (с 8:00). Дата сохранена без исправления источника.',
      180100,
      false
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.schedule_entries e
      WHERE e.schedule_id=s.id
        AND e.subject_id=subj
        AND e.date=DATE '2027-01-18'
        AND e.start_time=TIME '08:00'
    );
  END LOOP;
END $$;
