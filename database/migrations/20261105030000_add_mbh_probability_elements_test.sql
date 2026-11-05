-- Add the source-backed probability theory test for the MBH specialty.
-- Source: "тест1 Элементы теории вероятностей.docx" (27 MCQ).
-- Idempotent: stable source keys preserve existing attempts and question links.
-- The source marks option 1 (@1) as correct for all 27 questions; that key is preserved.

BEGIN;

DO $$
DECLARE
  v_subject_id uuid;
  v_module_id uuid;
  v_topic_id uuid;
  v_test_id uuid;
BEGIN
  SELECT id INTO v_subject_id
  FROM public.subjects
  WHERE slug = 'probability'
    AND course_number = 2
    AND semester = 3
    AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF v_subject_id IS NULL THEN
    RAISE EXCEPTION 'Active probability subject for course 2 / semester 3 was not found';
  END IF;

  UPDATE public.subjects
  SET specialty_slug = 'mbh'
  WHERE id = v_subject_id
    AND specialty_slug IS DISTINCT FROM 'mbh';

  SELECT id INTO v_module_id
  FROM public.modules
  WHERE subject_id = v_subject_id
    AND title = 'Элементы теории вероятностей'
  ORDER BY order_index, id
  LIMIT 1;

  IF v_module_id IS NULL THEN
    INSERT INTO public.modules (subject_id, title, order_index, is_published)
    VALUES (v_subject_id, 'Элементы теории вероятностей', 1, true)
    RETURNING id INTO v_module_id;
  ELSE
    UPDATE public.modules
    SET is_published = true
    WHERE id = v_module_id;
  END IF;

  SELECT id INTO v_topic_id
  FROM public.topics
  WHERE module_id = v_module_id
    AND title = 'Элементы теории вероятностей'
  ORDER BY order_index, id
  LIMIT 1;

  IF v_topic_id IS NULL THEN
    INSERT INTO public.topics (module_id, title, order_index, is_published)
    VALUES (v_module_id, 'Элементы теории вероятностей', 1, true)
    RETURNING id INTO v_topic_id;
  ELSE
    UPDATE public.topics
    SET is_published = true, archived_at = NULL
    WHERE id = v_topic_id;
  END IF;

  INSERT INTO public.tests
    (subject_id, module_id, topic_id, title, time_limit_sec, max_attempts, is_published, source_key, order_index)
  VALUES
    (v_subject_id, v_module_id, v_topic_id, 'Элементы теории вероятностей', NULL, NULL, true,
     'mbh-probability-elements-theory-20261105', 1)
  ON CONFLICT (subject_id, source_key) WHERE source_key IS NOT NULL
  DO UPDATE SET
    module_id = EXCLUDED.module_id,
    topic_id = EXCLUDED.topic_id,
    title = EXCLUDED.title,
    is_published = true,
    archived_at = NULL,
    order_index = EXCLUDED.order_index
  RETURNING id INTO v_test_id;

  WITH question_seed(question_no, prompt, options) AS (
    VALUES
      (1, 'Любой факт, который может произойти или не произойти в результате опыта со случайным исходом в теории вероятностей называют:', '["элементарным событием","общим решением","частным решением","частотой","вероятностью"]'::jsonb),
      (2, 'Случайное выпадение числа при бросании игральной кости в теории вероятностей называют:', '["событием","элементом","решением","частотой","вероятностью"]'::jsonb),
      (3, 'При бросании игральной кости (кубика) пространство элементарных событий включает число событий, равное:', '["6","1","2","3","0"]'::jsonb),
      (4, 'Событие, которое обязательно должно произойти в результате данного опыта, относится к:', '["достоверным","невероятным","случайным","возможным","вероятностным"]'::jsonb),
      (5, 'При бросании игральной кости (кубика) достоверным событием является:', '["ее падение на любую грань","выпадение четной грани","выпадение нечетной грани","появление числа 1","появление числа 6"]'::jsonb),
      (6, 'При бросании игральной кости (кубика) невозможным событием является:', '["появление числа 8","выпадение четной грани","выпадение нечетной грани","появление числа 4","ее падение на любую грань"]'::jsonb),
      (7, 'Если событие не может произойти в результате данного опыта, то в теории вероятностей его называют:', '["невозможным","случайным","совместным","независимым","достоверным"]'::jsonb),
      (8, 'Если событие А происходит тогда и только тогда, когда происходит событие В, то их называют:', '["совместными","случайными","несовместными","независимыми","достоверными"]'::jsonb),
      (9, 'Если событие С происходит тогда и только тогда, когда происходит либо событие А, либо событие В, то С является:', '["суммой событий А и В","разностью событий А и В","произведением событий А и В","вероятностью события А","вероятностью события В"]'::jsonb),
      (10, 'Если событие С происходит тогда и только тогда, когда происходит и событие А, и событие В, то С является:', '["произведением событий А и В","разностью событий А и В","суммой событий А и В","вероятностью события А","вероятностью события В"]'::jsonb),
      (11, 'Если событие С происходит тогда и только тогда, когда происходит событие А, и не происходит событие В, то С является:', '["разностью событий А и В","произведением событий А и В","суммой событий А и В","вероятностью события А","вероятностью события В"]'::jsonb),
      (12, 'Если не произошло событие А, но осуществилось событие В, то событие В является:', '["противоположным","случайным","независимым","совпадающим","возможным"]'::jsonb),
      (13, 'События А и В называются несовместными, если их одновременное появление:', '["невозможно","возможно с любой ненулевой вероятностью","происходит достаточно часто","происходит достаточно редко","сопутствует появлению еще одного события С"]'::jsonb),
      (14, 'Если одновременное появление событий А и В невозможно, то такие события называют:', '["несовместными","случайными","достоверными","совпадающими","редкими"]'::jsonb),
      (15, 'При бросании монеты один раз вероятность выпадения «решки» равна:', '["0.5","1","2","0","100%"]'::jsonb),
      (16, 'При бросании монеты один раз вероятность выпадения «орла» равна:', '["0.5","1","2","0","100%"]'::jsonb),
      (17, 'При появлении первого ребенка в семье вероятность рождения мальчика равна:', '["0.5","1","2","0","100%"]'::jsonb),
      (18, 'При появлении первого ребенка в семье вероятность рождения девочки равна:', '["0.5","1","2","0","100%"]'::jsonb),
      (19, 'При появлении второго ребенка в семье вероятность рождения мальчика равна:', '["0.5","1","2","0","200%"]'::jsonb),
      (20, 'При появлении второго ребенка в семье вероятность рождения девочки равна:', '["0.5","1","2","0","200%"]'::jsonb),
      (21, 'Относительная частота появления события в пространстве (множестве) всех событий называется:', '["вероятностью","погрешностью","элементом","исходом","модой"]'::jsonb),
      (22, 'Вероятность достоверного события равна:', '["1","0.5","2","0","-1"]'::jsonb),
      (23, 'Вероятность невозможного события равна:', '["0","0.5","-0.5","1","-1"]'::jsonb),
      (24, 'Если событие А имеет вероятность появления 0.4, то вероятность противоположного ему события В равна:', '["0.6","0.4","-0.4","1","-0.6"]'::jsonb),
      (25, 'Вероятность появления события А при условии, что событие В произошло, называется:', '["условной вероятностью события А","условной вероятностью события В","общей вероятностью","интегральной вероятностью","выборочной характеристикой события А"]'::jsonb),
      (26, 'Если в результате опыта переменная величина может принимать действительные значения с определёнными вероятностями, в теории вероятностей величина может называться:', '["случайной","математической","вероятностной","механической","выпадающей"]'::jsonb),
      (27, 'Все случайные величины делятся на два класса:', '["дискретные и непрерывные","математические и физические","вероятностные и постоянные","дискретные и квантованные","постоянные и переменные"]'::jsonb)
  ),
  normalized AS (
    SELECT
      question_no,
      prompt,
      options ->> 0 AS answer,
      (
        SELECT jsonb_agg(
          jsonb_build_object('label', option.value, 'correct', option.ordinality = 1)
          ORDER BY option.ordinality
        )
        FROM jsonb_array_elements_text(options) WITH ORDINALITY AS option(value, ordinality)
      ) AS structured_options
    FROM question_seed
  ),
  saved_questions AS (
    INSERT INTO public.questions
      (subject_id, module_id, topic_id, type, text, answer, options, difficulty, is_published, source, source_key)
    SELECT
      v_subject_id,
      v_module_id,
      v_topic_id,
      'mcq'::public.question_type,
      prompt,
      answer,
      structured_options,
      1,
      true,
      'import',
      'mbh-probability-elements-theory-20261105:' || question_no::text
    FROM normalized
    ON CONFLICT (subject_id, source_key) WHERE source_key IS NOT NULL
    DO UPDATE SET
      module_id = EXCLUDED.module_id,
      topic_id = EXCLUDED.topic_id,
      type = EXCLUDED.type,
      text = EXCLUDED.text,
      answer = EXCLUDED.answer,
      options = EXCLUDED.options,
      is_published = true,
      archived_at = NULL,
      source = 'import'
    RETURNING id, source_key
  )
  INSERT INTO public.test_questions (test_id, question_id, order_index)
  SELECT v_test_id, id, substring(source_key from ':(\d+)$')::integer
  FROM saved_questions
  ON CONFLICT (test_id, question_id)
  DO UPDATE SET order_index = EXCLUDED.order_index;
END $$;

COMMIT;
