-- part 18/18
INSERT INTO public.exam_questions (id, subject_name, subject_slug, topic, text, answer, kind, type, for_exam, for_ticket, source, is_published)
VALUES ('tkt-histology-case-accf1bdab4', 'Гистология, цитология', 'histology', 'Эмбриогенез', 'Внутренняя поверхность альвеол выстлана особым слоем, снижающим ее адгезивные свойства. Назовите этот слой. Какие клетки его секретируют и какие клетки его разрушают?', '1) в наружной зоне коркового вещества. 2) юкстамедулярная.', 'ticket', 'case', true, true, 'features/exam-questions', true)
ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text, answer = EXCLUDED.answer, topic = EXCLUDED.topic, is_published = true;
INSERT INTO public.exam_questions (id, subject_name, subject_slug, topic, text, answer, kind, type, for_exam, for_ticket, source, is_published)
VALUES ('tkt-histology-case-a557e89fd9', 'Гистология, цитология', 'histology', 'Эмбриогенез', 'В препарате легкого мертворожденного наблюдается сплошь не расправленные альвеолы, заполненные жидкостью. Какое объяснение имеет этот факт?', '1) 12-14-й день цикла. 2) эстрогены.', 'ticket', 'case', true, true, 'features/exam-questions', true)
ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text, answer = EXCLUDED.answer, topic = EXCLUDED.topic, is_published = true;
INSERT INTO public.exam_questions (id, subject_name, subject_slug, topic, text, answer, kind, type, for_exam, for_ticket, source, is_published)
VALUES ('tkt-histology-case-1170bfbd1e', 'Гистология, цитология', 'histology', 'Эмбриогенез', 'С какой органеллой взаимодейст-вует фагоцитарная частица?', '1) 14-15-й дни. 2) 1-2 суток.', 'ticket', 'case', true, true, 'features/exam-questions', true)
ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text, answer = EXCLUDED.answer, topic = EXCLUDED.topic, is_published = true;
INSERT INTO public.exam_questions (id, subject_name, subject_slug, topic, text, answer, kind, type, for_exam, for_ticket, source, is_published)
VALUES ('tkt-histology-case-53fda7301c', 'Гистология, цитология', 'histology', 'фагоцитарной частицы исхода', 'Что имеется общего в строении центриолей, ресничек и жгутиков?', 'Основная масса микроворсинок находится в проксимальном отделе нефрона. Нарушаются частично процессы реабсорбции.', 'ticket', 'case', true, true, 'features/exam-questions', true)
ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text, answer = EXCLUDED.answer, topic = EXCLUDED.topic, is_published = true;
INSERT INTO public.exam_questions (id, subject_name, subject_slug, topic, text, answer, kind, type, for_exam, for_ticket, source, is_published)
VALUES ('tkt-histology-case-0f4cd4753f', 'Гистология, цитология', 'histology', 'В чем заключается различие их', 'строения?', 'В момент имплантации у зародыша человека имеются: трофобласт с полостью, эпибласт с полостью, гипобласт и внезародышевая мезодерма (мезенхима). Имплантация происходит на 7 сутки после оплодотворения.', 'ticket', 'case', true, true, 'features/exam-questions', true)
ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text, answer = EXCLUDED.answer, topic = EXCLUDED.topic, is_published = true;
INSERT INTO public.exam_questions (id, subject_name, subject_slug, topic, text, answer, kind, type, for_exam, for_ticket, source, is_published)
VALUES ('tkt-histology-case-242b8c6816', 'Гистология, цитология', 'histology', 'В чем заключается различие их', 'Какова плоидность ДНК в клеточном ядре перед митозом и сразу после его завершения?', 'Кроме сперматозоидов гаплоидные ядра имеют сперматиды. Оплодотворить яйцеклетку они не могут.', 'ticket', 'case', true, true, 'features/exam-questions', true)
ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text, answer = EXCLUDED.answer, topic = EXCLUDED.topic, is_published = true;

SELECT COUNT(*) AS histology_exam_questions FROM public.exam_questions WHERE subject_slug='histology';
COMMIT;
