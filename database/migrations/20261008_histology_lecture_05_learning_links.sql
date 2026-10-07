-- MEDBIOHIM Histology Lecture 05 learning links
-- Date: 2026-10-08
-- Scope: histology only.
-- Adds source-backed curriculum/practical links to the existing lecture record.
update public.site_content
set payload = jsonb_set(
  payload,
  '{items,0}',
  (payload->'items'->0) || jsonb_build_object(
    'curriculum', jsonb_build_object(
      'module_id','a1000001-0000-4000-8000-000000000004',
      'module_title','Кровь и лимфа',
      'topic_id','b1000001-0000-4000-8000-000000000007',
      'topic_title','Неделя 5–6 · Лекция 5/практика · Кровь и лимфа'
    ),
    'related_learning', jsonb_build_object(
      'trainer_cards', jsonb_build_array(
        jsonb_build_object('id','feed-prep-9f7dc534b5','focus','нейтрофил + эозинофил','image_path','5.Соед.тк. Кровь. Нейтр. и эозиноф..jpg'),
        jsonb_build_object('id','feed-prep-867b72a4b6','focus','нейтрофил','image_path','5.Соед.тк. Кровь. Нейтрофил..jpg'),
        jsonb_build_object('id','feed-prep-a47e9dc83a','focus','эозинофил + нейтрофил','image_path','5.Соед.тк. Кровь. Эозинофил и нейтр..jpg'),
        jsonb_build_object('id','feed-prep-a2feb3ec86','focus','лимфоцит + моноцит','image_path','5.Соед.тк. Кровь.Лимфоцит и моноцит..jpg'),
        jsonb_build_object('id','feed-prep-5a224c48f5','focus','лимфоцит','image_path','5.Соед.тк. Кровь.Лимфоцит..jpg'),
        jsonb_build_object('id','feed-prep-29f73833e0','focus','лимфоциты','image_path','5.Соед.тк. Кровь.Лимфоциты..jpg'),
        jsonb_build_object('id','feed-prep-bca30caf3b','focus','моноцит','image_path','5.Соед.тк. Кровь.Моноцит..jpg'),
        jsonb_build_object('id','feed-prep-60e72c3e7e','focus','тромбоциты','image_path','5.Соед.тк. Кровь.Тромбоциты..jpg')
      ),
      'materials', jsonb_build_array(
        jsonb_build_object('source_key','histology-zip-scheme-4','title','4.Кровь'),
        jsonb_build_object('source_key','histology-zip-method-neuro','title','метод.по нервн кровен, кроветв.леч')
      ),
      'electronograms', jsonb_build_array(
        jsonb_build_object('source_key','histology-em-19b1cd0070eccd','title','Фагоцитоз нейтрофильным лейкоцитом крови','trainer_id','feed-em-d69cfa101f'),
        jsonb_build_object('source_key','histology-em-capillary-20261005','title','Поперечный срез кровеносного капилляра')
      ),
      'test', jsonb_build_object('id','29564479-ebb7-4c81-9d0d-4e5ca640d053','title','Гистология — общая: кровь','question_count',20,'preparation_url','/tests/preparation/29564479-ebb7-4c81-9d0d-4e5ca640d053'),
      'exam_question_ids', jsonb_build_array(
        'caf272f2-6191-57ba-acf3-71f48911d4ae',
        '0a6ef32d-d914-52fd-8ed4-09438ef0ff57',
        '9eae246f-cf70-5716-b62c-5c3ac21776d3',
        '46965ca8-3f17-52b6-b785-cf3030e2fb12',
        '514e7ed0-ec0d-5e54-af05-1976f74c1f1a',
        'd75be7f0-e896-5e54-9d49-ee7eaef00044',
        'b589b5cb-44f0-52bd-ac0c-d684562b59b3',
        '8ff123d9-c94d-5b58-b7ab-7d245ab896e8',
        'fd686227-01ed-5909-ac64-079d2e357dcb'
      ),
      'navigation', jsonb_build_object(
        'subject_trainer','/subjects/histology?tab=trainer',
        'subject_materials','/subjects/histology?tab=materials',
        'subject_tests','/subjects/histology?tab=tests',
        'subject_plan','/subjects/histology?tab=plan'
      )
    )
  )
)
where key='lectures';
