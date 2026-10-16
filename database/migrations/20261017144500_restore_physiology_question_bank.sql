-- Restore the original open physiology prompts to the normal question bank as well as the exam-ticket catalog.
-- No answers are fabricated: the archived source had empty answers for all eight prompts.
BEGIN;
WITH subject AS (
  SELECT id FROM public.subjects
  WHERE slug='physiology' AND course_number=2 AND semester=3 AND is_active=true
  ORDER BY id LIMIT 1
),
seed(sort_order,legacy_id,prompt) AS (
  VALUES
    (1,'tkt-physiology-1','Предмет и задачи физиологии. Методы физиологических исследований.'),
    (2,'tkt-physiology-2','Гомеостаз. Нервная и гуморальная регуляция функций организма.'),
    (3,'tkt-physiology-3','Строение и свойства биологических мембран. Транспорт веществ через мембраны.'),
    (4,'tkt-physiology-4','Возбудимые ткани. Потенциал покоя и потенциал действия.'),
    (5,'tkt-physiology-5','Системы крови. Функции и состав крови.'),
    (6,'tkt-physiology-6','Физиология сердца. Сердечный цикл. Проводящая система сердца.'),
    (7,'tkt-physiology-7','Дыхательная система. Механизм вдоха и выдоха. Газообмен.'),
    (8,'tkt-physiology-8','Пищеварение. Функции ЖКТ. Регуляция пищеварения.')
)
INSERT INTO public.questions(subject_id,type,text,answer,options,is_published,source_key)
SELECT s.id,'theory'::public.question_type,seed.prompt,'','[]'::jsonb,true,
  'spaceweb:physiology:'||seed.legacy_id
FROM subject s CROSS JOIN seed
ON CONFLICT (subject_id,source_key) WHERE source_key IS NOT NULL
DO UPDATE SET text=EXCLUDED.text,answer=EXCLUDED.answer,options=EXCLUDED.options,is_published=true,archived_at=NULL;
COMMIT;
