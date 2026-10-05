-- Reconstruct malformed histology bird-blastula question from the supplied source archive.
-- Source: "Сборник тестовых заданий по цитологии и эмбриологии.doc/.docx".
-- The source answer key records option 2 ("Целобластула"); preserve that source-derived
-- answer instead of silently replacing it with external/model knowledge.
UPDATE public.questions
SET text = 'В результате дробления зиготы у птиц образуется',
    options = '["Амфибластула","Целобластула","Перибластула","Бластоциста","Дискобластула"]'::jsonb,
    answer = 'Целобластула',
    type = 'mcq',
    difficulty = COALESCE(difficulty, 1),
    is_published = true,
    archived_at = NULL
WHERE id = '8bfef7ab-caf8-5d37-91a2-bc2d32d028d5';

UPDATE public.test_questions
SET question_id = '8bfef7ab-caf8-5d37-91a2-bc2d32d028d5'
WHERE test_id = 'ac224d19-9392-59d2-b442-d915a6ceedd3'
  AND question_id = '0f16a2e0-11dc-5659-abb0-e8b6e8f26abd';

UPDATE public.questions
SET is_published = false,
    archived_at = COALESCE(archived_at, now())
WHERE id = '0f16a2e0-11dc-5659-abb0-e8b6e8f26abd';
