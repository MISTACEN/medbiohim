-- Restore the eight original open physiology exam-ticket prompts from the SpaceWeb archive.
-- Answers were blank in the source, so this migration deliberately leaves them blank.
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
INSERT INTO public.exam_questions
  (id,subject_id,subject_name,subject_slug,topic,text,answer,kind,type,for_exam,for_ticket,source,is_published,sort_order)
SELECT
  md5('spaceweb:physiology:'||seed.legacy_id)::uuid,
  subject.id,'Физиология','physiology',NULL,seed.prompt,'','ticket','open',true,true,
  'spaceweb:legacy/questions/main/physiology.json',true,seed.sort_order
FROM subject CROSS JOIN seed
WHERE NOT EXISTS (
  SELECT 1 FROM public.exam_questions eq
  WHERE eq.subject_slug='physiology'
    AND eq.source='spaceweb:legacy/questions/main/physiology.json'
    AND eq.text=seed.prompt
);
COMMIT;
