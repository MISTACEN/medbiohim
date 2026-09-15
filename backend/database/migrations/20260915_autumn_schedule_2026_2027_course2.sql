-- Autumn semester 2026/2027 schedule for Medical Biochemistry, course 2.
-- Source: official timetable approved 10 July 2026.
-- The schedule is attached to every active group with course_number = 2.
-- Re-running this migration does not create duplicate entries for the same group/version.

DO $$
DECLARE
  g RECORD;
  sid uuid;
BEGIN
  FOR g IN
    SELECT id
    FROM public.groups
    WHERE is_active = true
      AND course_number = 2
  LOOP
    SELECT s.id INTO sid
    FROM public.schedules s
    WHERE s.group_id = g.id
      AND s.semester = 3
      AND s.version = 1
    LIMIT 1;

    IF sid IS NULL THEN
      INSERT INTO public.schedules (group_id, academic_year_id, semester, version)
      VALUES (g.id, NULL, 3, 1)
      RETURNING id INTO sid;
    END IF;

    -- Monday
    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Физиология') AND semester=3 LIMIT 1), v.d::date, '08:30','10:10','other',NULL,NULL,'Физиология (4*18)'
    FROM (VALUES ('2026-09-07'),('2026-09-14'),('2026-09-21'),('2026-09-28'),('2026-10-05'),('2026-10-12'),('2026-10-19'),('2026-10-26'),('2026-11-02'),('2026-11-09'),('2026-11-16'),('2026-11-23'),('2026-11-30'),('2026-12-07'),('2026-12-14'),('2026-12-21'),('2026-12-28')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='08:30');

    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Физиология') AND semester=3 LIMIT 1), v.d::date, '10:40','12:20','other',NULL,NULL,'Физиология (4*18)'
    FROM (VALUES ('2026-09-07'),('2026-09-14'),('2026-09-21'),('2026-09-28'),('2026-10-05'),('2026-10-12'),('2026-10-19'),('2026-10-26'),('2026-11-02'),('2026-11-09'),('2026-11-16'),('2026-11-23'),('2026-11-30'),('2026-12-07'),('2026-12-14'),('2026-12-21'),('2026-12-28')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='10:40');

    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Физиология') AND semester=3 LIMIT 1), v.d::date, '12:50','14:30','other',NULL,NULL,'Физиология (17)'
    FROM (VALUES ('2026-09-07'),('2026-09-14'),('2026-09-21'),('2026-09-28'),('2026-10-05'),('2026-10-12'),('2026-10-19'),('2026-10-26'),('2026-11-02'),('2026-11-09'),('2026-11-16'),('2026-11-23'),('2026-11-30'),('2026-12-07'),('2026-12-14'),('2026-12-21'),('2026-12-28')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='12:50');

    -- Tuesday: Optics / Informatics alternating dates
    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Оптика, атомная физика') AND semester=3 LIMIT 1), v.d::date, '10:40','12:20','other',NULL,NULL,'Оптика (9)'
    FROM (VALUES ('2026-09-01'),('2026-09-15'),('2026-09-29'),('2026-10-13'),('2026-10-27'),('2026-11-10'),('2026-11-24'),('2026-12-08'),('2026-12-22')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='10:40');

    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Информатика, медицинская информатика') AND semester=3 LIMIT 1), v.d::date, '10:40','12:20','other',NULL,NULL,'Информатика (9)'
    FROM (VALUES ('2026-09-08'),('2026-09-22'),('2026-10-06'),('2026-10-20'),('2026-11-03'),('2026-11-17'),('2026-12-01'),('2026-12-15'),('2026-12-29')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='10:40');

    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Оптика, атомная физика') AND semester=3 LIMIT 1), v.d::date, '12:50','14:30','other',NULL,NULL,'Оптика (3*19)'
    FROM (VALUES ('2026-09-01'),('2026-09-08'),('2026-09-15'),('2026-09-22'),('2026-09-29'),('2026-10-06'),('2026-10-13'),('2026-10-20'),('2026-10-27'),('2026-11-03'),('2026-11-10'),('2026-11-17'),('2026-11-24'),('2026-12-01'),('2026-12-08'),('2026-12-15'),('2026-12-22'),('2026-12-29')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='12:50');

    -- Wednesday
    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('История медицины') AND semester=3 LIMIT 1), v.d::date, '08:30','10:10','other',NULL,NULL,'История медицины (3*18), начало занятия с 08:00'
    FROM (VALUES ('2026-09-02'),('2026-09-09'),('2026-09-16'),('2026-09-23'),('2026-09-30'),('2026-10-07'),('2026-10-14'),('2026-10-21'),('2026-10-28'),('2026-11-04'),('2026-11-11'),('2026-11-18'),('2026-11-25'),('2026-12-02'),('2026-12-09'),('2026-12-16'),('2026-12-23'),('2026-12-30')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='08:30');

    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Органическая и физическая химия') AND semester=3 LIMIT 1), v.d::date, '10:40','12:20','other',303,'учебный корпус № 2','Органическая и физическая химия (10)'
    FROM (VALUES ('2026-09-02'),('2026-09-09'),('2026-09-16'),('2026-09-23'),('2026-09-30'),('2026-10-07'),('2026-10-14'),('2026-10-21'),('2026-10-28'),('2026-11-11')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='10:40');

    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Органическая и физическая химия') AND semester=3 LIMIT 1), v.d::date, '12:50','14:30','other',NULL,NULL,'Органическая и физическая химия (3*18)'
    FROM (VALUES ('2026-09-02'),('2026-09-09'),('2026-09-16'),('2026-09-23'),('2026-09-30'),('2026-10-07'),('2026-10-14'),('2026-10-21'),('2026-10-28'),('2026-11-04'),('2026-11-11'),('2026-11-18'),('2026-11-25'),('2026-12-02'),('2026-12-09'),('2026-12-16'),('2026-12-23'),('2026-12-30')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='12:50');

    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Органическая и физическая химия') AND semester=3 LIMIT 1), v.d::date, '14:45','16:25','other',NULL,NULL,'Органическая и физическая химия (3*18) — продолжение; перерыв 15 мин'
    FROM (VALUES ('2026-09-02'),('2026-09-09'),('2026-09-16'),('2026-09-23'),('2026-09-30'),('2026-10-07'),('2026-10-14'),('2026-10-21'),('2026-10-28'),('2026-11-04'),('2026-11-11'),('2026-11-18'),('2026-11-25'),('2026-12-02'),('2026-12-09'),('2026-12-16'),('2026-12-23'),('2026-12-30')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='14:45');

    -- Thursday
    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Информационные технологии в здравоохранении') AND semester=3 LIMIT 1), v.d::date, '08:30','10:10','other',NULL,NULL,'Информационные технологии (2*18) / Информационные технологии (1)'
    FROM (VALUES ('2026-09-03'),('2026-09-10'),('2026-09-17'),('2026-09-24'),('2026-10-01'),('2026-10-08'),('2026-10-15'),('2026-10-22'),('2026-10-29'),('2026-11-05'),('2026-11-12'),('2026-11-19'),('2026-11-26'),('2026-12-03'),('2026-12-10'),('2026-12-17'),('2026-12-24'),('2026-12-31'),('2027-01-07'),('2027-01-14'),('2027-01-21')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='08:30');

    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Теория вероятности и математическая статистика') AND semester=3 LIMIT 1), v.d::date, '10:40','12:20','other',NULL,NULL,'Теория вероятности (14)'
    FROM (VALUES ('2026-09-03'),('2026-09-17'),('2026-10-01'),('2026-10-15'),('2026-10-29'),('2026-11-05'),('2026-11-12'),('2026-11-19'),('2026-11-26'),('2026-12-03'),('2026-12-10'),('2026-12-17'),('2026-12-24'),('2027-01-14')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='10:40');

    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Информационные технологии в здравоохранении') AND semester=3 LIMIT 1), v.d::date, '10:40','12:20','other',NULL,NULL,'Информационные технологии (5)'
    FROM (VALUES ('2026-09-10'),('2026-09-24'),('2026-10-08'),('2026-10-22'),('2027-01-21')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='10:40');

    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Теория вероятности и математическая статистика') AND semester=3 LIMIT 1), v.d::date, '12:50','14:30','other',NULL,NULL,'Теория вероятности (4*17)'
    FROM (VALUES ('2026-09-03'),('2026-09-10'),('2026-09-17'),('2026-09-24'),('2026-10-01'),('2026-10-08'),('2026-10-15'),('2026-10-22'),('2026-10-29'),('2026-11-05'),('2026-11-12'),('2026-11-19'),('2026-11-26'),('2026-12-03'),('2026-12-10'),('2026-12-17'),('2026-12-24'),('2026-12-31'),('2027-01-07'),('2027-01-14'),('2027-01-21')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='12:50');

    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Теория вероятности и математическая статистика') AND semester=3 LIMIT 1), v.d::date, '14:45','16:25','other',NULL,NULL,'Теория вероятности (4*17) — продолжение; перерыв 15 мин'
    FROM (VALUES ('2026-09-03'),('2026-09-10'),('2026-09-17'),('2026-09-24'),('2026-10-01'),('2026-10-08'),('2026-10-15'),('2026-10-22'),('2026-10-29'),('2026-11-05'),('2026-11-12'),('2026-11-19'),('2026-11-26'),('2026-12-03'),('2026-12-10'),('2026-12-17'),('2026-12-24'),('2026-12-31'),('2027-01-07'),('2027-01-14'),('2027-01-21')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='14:45');

    -- Friday
    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Гистология, цитология') AND semester=3 LIMIT 1), v.d::date, '08:30','10:10','other',NULL,NULL,'Гистология (3*19), начало занятия с 08:00'
    FROM (VALUES ('2026-09-04'),('2026-09-11'),('2026-09-18'),('2026-09-25'),('2026-10-02'),('2026-10-09'),('2026-10-16'),('2026-10-23'),('2026-10-30'),('2026-11-06'),('2026-11-13'),('2026-11-20'),('2026-11-27'),('2026-12-04'),('2026-12-11'),('2026-12-18'),('2026-12-25'),('2027-01-01'),('2027-01-08'),('2027-01-15'),('2027-01-18')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='08:30');

    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Гистология, цитология') AND semester=3 LIMIT 1), v.d::date, '10:40','12:20','other',NULL,NULL,'Гистология (18)'
    FROM (VALUES ('2026-09-04'),('2026-09-11'),('2026-09-18'),('2026-09-25'),('2026-10-02'),('2026-10-09'),('2026-10-16'),('2026-10-23'),('2026-10-30'),('2026-11-06'),('2026-11-13'),('2026-11-20'),('2026-11-27'),('2026-12-04'),('2026-12-11'),('2026-12-18'),('2026-12-25'),('2027-01-18')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='10:40');

    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Первая медицинская помощь') AND semester=3 LIMIT 1), v.d::date, '12:50','14:30','other',NULL,NULL,'Первая медицинская помощь (2*18)'
    FROM (VALUES ('2026-09-04'),('2026-09-11'),('2026-09-18'),('2026-09-25'),('2026-10-02'),('2026-10-09'),('2026-10-16'),('2026-10-23'),('2026-10-30'),('2026-11-06'),('2026-11-13'),('2026-11-20'),('2026-11-27'),('2026-12-04'),('2026-12-11'),('2026-12-18'),('2026-12-25')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='12:50');

    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Философия') AND semester=3 LIMIT 1), v.d::date, '14:45','16:25','other',NULL,NULL,'Философия (7)'
    FROM (VALUES ('2026-09-04'),('2026-09-11'),('2026-09-18'),('2026-09-25'),('2026-10-02'),('2026-10-09'),('2026-10-16')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='14:45');

    -- Saturday
    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Информатика, медицинская информатика') AND semester=3 LIMIT 1), v.d::date, '08:30','10:10','other',NULL,NULL,'Информатика (3*17), начало занятия с 08:00'
    FROM (VALUES ('2026-09-05'),('2026-09-12'),('2026-09-19'),('2026-09-26'),('2026-10-03'),('2026-10-10'),('2026-10-17'),('2026-10-24'),('2026-10-31'),('2026-11-07'),('2026-11-14'),('2026-11-21'),('2026-11-28'),('2026-12-05'),('2026-12-12'),('2026-12-19'),('2026-12-26')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='08:30');

    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Первая медицинская помощь') AND semester=3 LIMIT 1), v.d::date, '10:40','12:20','other',NULL,NULL,'Первая медицинская помощь (9)'
    FROM (VALUES ('2026-09-05'),('2026-09-19'),('2026-10-03'),('2026-10-17'),('2026-10-31'),('2026-11-14'),('2026-11-28'),('2026-12-12'),('2026-12-26')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='10:40');

    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('История медицины') AND semester=3 LIMIT 1), v.d::date, '10:40','12:20','other',NULL,NULL,'История медицины (10)'
    FROM (VALUES ('2026-09-12'),('2026-09-26'),('2026-10-10'),('2026-10-24'),('2026-11-07'),('2026-11-21'),('2026-12-05'),('2026-12-19'),('2027-01-09'),('2027-01-16')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='10:40');

    INSERT INTO public.schedule_entries (schedule_id, subject_id, date, start_time, end_time, type, room, building, notes)
    SELECT sid, (SELECT id FROM public.subjects WHERE lower(name)=lower('Философия') AND semester=3 LIMIT 1), v.d::date, '12:50','14:30','other',NULL,NULL,'Философия (2*19)'
    FROM (VALUES ('2026-09-05'),('2026-09-12'),('2026-09-19'),('2026-09-26'),('2026-10-03'),('2026-10-10'),('2026-10-17'),('2026-10-24'),('2026-10-31'),('2026-11-07'),('2026-11-14'),('2026-11-21'),('2026-11-28'),('2026-12-05'),('2026-12-12'),('2026-12-19'),('2026-12-26'),('2027-01-09'),('2027-01-16')) v(d)
    WHERE NOT EXISTS (SELECT 1 FROM public.schedule_entries e WHERE e.schedule_id=sid AND e.date=v.d::date AND e.start_time='12:50');

  END LOOP;
END $$;

-- Academic calendar reference:
-- theoretical study: 01.09.2026–21.01.2027
-- examination session: 22.01.2027–30.01.2027
-- holidays: 01.02.2027–06.02.2027
-- spring semester: from 08.02.2027
-- Exams: Теория вероятности и математическая статистика; Информатика, медицинская информатика.
-- Credits: Первая медицинская помощь; История медицины; Эл. курсы ФК и С; Философия;
--          Оптика, атомная физика; Органическая и физическая химия; Гистология, цитология; Физиология.
