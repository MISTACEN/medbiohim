-- Restore the source-backed physical chemistry kinetics test from the SpaceWeb archive.
BEGIN;
WITH subject AS (
  SELECT id FROM public.subjects
  WHERE slug='chemistry_organic_physical' AND course_number=2 AND semester=3 AND is_active=true
  ORDER BY id LIMIT 1
),
test_seed AS (
  SELECT id,title FROM (
    INSERT INTO public.tests(subject_id,title,time_limit_sec,max_attempts,is_published,source_key,order_index)
    SELECT s.id,'Химическая кинетика',600,NULL,true,'spaceweb:orgchem-chem-kinetics',22
    FROM subject s
    ON CONFLICT (subject_id,source_key) WHERE source_key IS NOT NULL
    DO UPDATE SET title=EXCLUDED.title,is_published=true,archived_at=NULL,order_index=EXCLUDED.order_index
    RETURNING id,title
  ) inserted
),
question_seed(source_key,prompt,options,answer,order_index) AS (
  VALUES
    ('spaceweb:orgchem-chem-kinetics:ck1','Правило Вант-Гоффа описывает влияние:','["давления","температуры на скорость","концентрации катализатора только","pH"]'::jsonb,'температуры на скорость',1),
    ('spaceweb:orgchem-chem-kinetics:ck2','При S ≫ Km порядок ферментативной реакции:','["первый","нулевой","второй","дробный всегда"]'::jsonb,'нулевой',2),
    ('spaceweb:orgchem-chem-kinetics:ck3','ΔG < 0 означает процесс:','["запрещённый","самопроизвольный","равновесный только","эндоэргонический"]'::jsonb,'самопроизвольный',3),
    ('spaceweb:orgchem-chem-kinetics:ck4','Катализатор:','["смещает равновесие вправо всегда","понижает энергию активации","увеличивает ΔG","расходуется стехиометрически"]'::jsonb,'понижает энергию активации',4),
    ('spaceweb:orgchem-chem-kinetics:ck5','pH = 7 соответствует [H⁺]:','["10⁻⁷ моль/л","7 моль/л","10⁷","0"]'::jsonb,'10⁻⁷ моль/л',5)
),
seeded_questions AS (
  INSERT INTO public.questions(subject_id,type,text,answer,options,is_published,source_key)
  SELECT s.id,'mcq'::public.question_type,q.prompt,q.answer,q.options,true,q.source_key
  FROM subject s CROSS JOIN question_seed q
  ON CONFLICT (subject_id,source_key) WHERE source_key IS NOT NULL
  DO UPDATE SET text=EXCLUDED.text,answer=EXCLUDED.answer,options=EXCLUDED.options,is_published=true,archived_at=NULL
  RETURNING id,source_key
)
INSERT INTO public.test_questions(test_id,question_id,order_index)
SELECT t.id,q.id,seed.order_index
FROM test_seed t
CROSS JOIN question_seed seed
JOIN seeded_questions q ON q.source_key=seed.source_key
ON CONFLICT (test_id,question_id) DO UPDATE SET order_index=EXCLUDED.order_index;
COMMIT;
