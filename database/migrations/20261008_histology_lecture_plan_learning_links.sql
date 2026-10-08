-- Histology current-plan lecture/material/preparation synchronization
-- Date: 2026-10-08
-- Scope: public Histology only. Rerunnable by stable lecture IDs/source keys.
BEGIN;

WITH clone_cfg(new_id,clone_from,title) AS (
  VALUES
    ('lec-hist-plan-01-20261008','lec-hist-cytology','Неделя 1 · Лекция 1 · Введение. Клетка и клеточная теория'),
    ('lec-hist-plan-08-20261008','lec-hist-bone_muscle','Неделя 8–9 · Лекция 8/практика · Мышечные ткани'),
    ('lec-hist-plan-11-20261008','lec-hist-nervous_system','Неделя 11/15 · Лекция 11/практика · Кора, мозжечок и ВНС')
),
new_items AS (
  SELECT c.new_id, src.item || jsonb_build_object(
    'id',c.new_id,'title',c.title,'status','published','lesson_type','lecture',
    'created_at',now(),'updated_at',now()
  ) AS item
  FROM clone_cfg c
  JOIN LATERAL (
    SELECT item
    FROM jsonb_array_elements((SELECT payload->'items' FROM public.site_content WHERE key='lectures' LIMIT 1)) item
    WHERE item->>'id'=c.clone_from LIMIT 1
  ) src ON true
)
UPDATE public.site_content sc
SET payload=jsonb_set(sc.payload,'{items}',
  sc.payload->'items' ||
  COALESCE((
    SELECT jsonb_agg(n.item ORDER BY n.new_id)
    FROM new_items n
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(sc.payload->'items') e(item)
      WHERE e.item->>'id'=n.new_id
    )
  ),'[]'::jsonb),true),
    updated_at=now()
WHERE sc.key='lectures';

WITH cfg AS (
  SELECT * FROM jsonb_to_recordset('[{"id":"lec-hist-plan-01-20261008","title":"Неделя 1 · Лекция 1 · Введение. Клетка и клеточная теория","module_id":"a1000001-0000-4000-8000-000000000001","module_title":"Цитология","topic_id":"b1000001-0000-4000-8000-000000000001","order_index":1,"lesson_number":"1","methodics":[{"material_id":"908f6d8b-92c0-4a41-8839-241715c75cda","source_key":"histology-zip-method-cyto-2024","title":"Цитол и эмбр. для самоподготовки 2024 г.","original_name":"Цитол и эмбр. для самоподготовки 2024 г..docx","original_format":"docx","page_start":7,"page_end":12,"page_label":"стр. 7–12","exact_section":"ТЕМА 1. Клетка и её производные. Основы гистологической техники"}],"files":[{"material_id":"f9eb8b68-f754-4702-bbc7-f9f2d6828764","source_key":"histology-zip-scheme-0","title":"0. Гистотехника","kind":"scheme"}],"prep_topics":["b1000001-0000-4000-8000-000000000001","b1000001-0000-4000-8000-000000000003"]},{"id":"lec-hist-cytology","title":"Неделя 2 · Лекция 2 · Цитоплазма, органеллы, включения, ядро, клеточный цикл","module_id":"a1000001-0000-4000-8000-000000000002","module_title":"Общая эмбриология","topic_id":"b1000001-0000-4000-8000-000000000002","order_index":2,"lesson_number":"2","methodics":[{"material_id":"908f6d8b-92c0-4a41-8839-241715c75cda","source_key":"histology-zip-method-cyto-2024","title":"Цитол и эмбр. для самоподготовки 2024 г.","original_name":"Цитол и эмбр. для самоподготовки 2024 г..docx","original_format":"docx","page_start":13,"page_end":29,"page_label":"стр. 13–29","exact_section":"ТЕМА 2. Цитоплазма. Органеллы и включения"},{"material_id":"908f6d8b-92c0-4a41-8839-241715c75cda","source_key":"histology-zip-method-cyto-2024","title":"Цитол и эмбр. для самоподготовки 2024 г.","original_name":"Цитол и эмбр. для самоподготовки 2024 г..docx","original_format":"docx","page_start":30,"page_end":39,"page_label":"стр. 30–39","exact_section":"ТЕМА 3. Ядро. Жизненный цикл клетки"}],"files":[{"material_id":"a74dc116-9a37-4319-9e60-50a5a507cba3","source_key":"histology-zip-scheme-1","title":"1.Цитология","kind":"scheme"}],"prep_topics":["b1000001-0000-4000-8000-000000000002"]},{"id":"lec-hist-embryology","title":"Неделя 3–4 · Лекция 3 · Общая эмбриология и половые клетки","module_id":"a1000001-0000-4000-8000-000000000003","module_title":"Эпителиальные ткани","topic_id":"b1000001-0000-4000-8000-000000000004","order_index":3,"lesson_number":"3","methodics":[{"material_id":"908f6d8b-92c0-4a41-8839-241715c75cda","source_key":"histology-zip-method-cyto-2024","title":"Цитол и эмбр. для самоподготовки 2024 г.","original_name":"Цитол и эмбр. для самоподготовки 2024 г..docx","original_format":"docx","page_start":40,"page_end":51,"page_label":"стр. 40–51","exact_section":"ТЕМА 4. Эмбриология"}],"files":[{"material_id":"28d1e3de-45d2-4dd3-a232-a472440d8d7d","source_key":"histology-zip-scheme-2","title":"2.Основы общей эмбриологии","kind":"scheme"},{"material_id":"fcdb053b-9d06-42f9-94ae-1d7605fc3667","source_key":"histology-zip-scheme-27","title":"27. Эмбриогенез человека","kind":"scheme"}],"prep_topics":["b1000001-0000-4000-8000-000000000004","b1000001-0000-4000-8000-000000000005"]},{"id":"lec-hist-epithelium","title":"Неделя 5 · Лекция 4/практика · Эпителиальные ткани","module_id":"a1000001-0000-4000-8000-000000000004","module_title":"Кровь и лимфа","topic_id":"b1000001-0000-4000-8000-000000000006","order_index":4,"lesson_number":"4","methodics":[{"material_id":"145f7014-9560-453d-81f7-465d77fa532c","source_key":"histology-zip-method-general","title":"Общая гистология","original_name":"Общая гистология.docx","original_format":"docx","page_start":5,"page_end":12,"page_label":"стр. 5–12","exact_section":"Тема занятия № 10-11 · ОБЩАЯ ГИСТОЛОГИЯ. ЭПИТЕЛИАЛЬНЫЕ ТКАНИ"}],"files":[{"material_id":"7bcae14c-7bb2-4e69-becb-4630f3db4f64","source_key":"histology-zip-scheme-3","title":"3.Эпителиальные ткани","kind":"scheme"}],"prep_topics":["b1000001-0000-4000-8000-000000000006"]},{"id":"lec-histology-blood-20261008","title":"Неделя 5–6 · Лекция 5/практика · Кровь и лимфа","module_id":"a1000001-0000-4000-8000-000000000005","module_title":"Соединительные ткани","topic_id":"b1000001-0000-4000-8000-000000000007","order_index":5,"lesson_number":"5","methodics":[{"material_id":"145f7014-9560-453d-81f7-465d77fa532c","source_key":"histology-zip-method-general","title":"Общая гистология","original_name":"Общая гистология.docx","original_format":"docx","page_start":13,"page_end":24,"page_label":"стр. 13–24","exact_section":"Тема занятия № 12-13 · ТКАНИ ВНУТРЕННЕЙ СРЕДЫ. КРОВЬ"}],"files":[{"material_id":"4e6e88b1-946a-49cc-bba3-51c4e069e2df","source_key":"histology-zip-scheme-4","title":"4.Кровь","kind":"scheme"}],"prep_topics":["b1000001-0000-4000-8000-000000000007"]},{"id":"lec-hist-connective","title":"Неделя 6–7 · Лекция 6/практика · Соединительные ткани","module_id":"a1000001-0000-4000-8000-000000000006","module_title":"Скелетные ткани","topic_id":"b1000001-0000-4000-8000-000000000008","order_index":6,"lesson_number":"6","methodics":[{"material_id":"145f7014-9560-453d-81f7-465d77fa532c","source_key":"histology-zip-method-general","title":"Общая гистология","original_name":"Общая гистология.docx","original_format":"docx","page_start":25,"page_end":36,"page_label":"стр. 25–36","exact_section":"Тема занятия № 14-15 · РЫХЛАЯ И ПЛОТНАЯ ВОЛОКНИСТАЯ СОЕДИНИТЕЛЬНАЯ ТКАНЬ"}],"files":[{"material_id":"2643368c-1039-4f38-a501-285630f7e8a1","source_key":"histology-zip-scheme-5","title":"5.Соединительные ткани","kind":"scheme"}],"prep_topics":["b1000001-0000-4000-8000-000000000008"]},{"id":"lec-hist-bone_muscle","title":"Неделя 7–8 · Лекция 7/практика · Хрящ, кость и развитие кости","module_id":"a1000001-0000-4000-8000-000000000007","module_title":"Мышечные ткани","topic_id":"b1000001-0000-4000-8000-000000000009","order_index":7,"lesson_number":"7","methodics":[{"material_id":"145f7014-9560-453d-81f7-465d77fa532c","source_key":"histology-zip-method-general","title":"Общая гистология","original_name":"Общая гистология.docx","original_format":"docx","page_start":37,"page_end":42,"page_label":"стр. 37–42","exact_section":"Тема занятия № 16 · ХРЯЩЕВЫЕ ТКАНИ"},{"material_id":"145f7014-9560-453d-81f7-465d77fa532c","source_key":"histology-zip-method-general","title":"Общая гистология","original_name":"Общая гистология.docx","original_format":"docx","page_start":43,"page_end":50,"page_label":"стр. 43–50","exact_section":"Тема занятия № 17-18 · КОСТНЫЕ ТКАНИ"}],"files":[{"material_id":"cc5b1e0b-01cf-4d6d-a5c4-65747e2ff386","source_key":"histology-zip-scheme-6","title":"6.Хрящевые ткани","kind":"scheme"},{"material_id":"8a92be75-afcf-40c6-ac20-803a0ae72854","source_key":"histology-zip-scheme-7","title":"7.Костные ткани","kind":"scheme"}],"prep_topics":["b1000001-0000-4000-8000-000000000009"]},{"id":"lec-hist-plan-08-20261008","title":"Неделя 8–9 · Лекция 8/практика · Мышечные ткани","module_id":"a1000001-0000-4000-8000-000000000008","module_title":"Нервная ткань","topic_id":"b1000001-0000-4000-8000-000000000010","order_index":8,"lesson_number":"8","methodics":[{"material_id":"145f7014-9560-453d-81f7-465d77fa532c","source_key":"histology-zip-method-general","title":"Общая гистология","original_name":"Общая гистология.docx","original_format":"docx","page_start":51,"page_end":58,"page_label":"стр. 51–58","exact_section":"Тема занятия № 19-20 · МЫШЕЧНЫЕ ТКАНИ"}],"files":[{"material_id":"a0cf4f41-f526-4abe-8546-f08609357255","source_key":"histology-zip-scheme-8","title":"8.Мышечные ткани","kind":"scheme"},{"material_id":"62d8f049-b955-4792-b962-d0f3cd9ea53a","source_key":"histology-zip-gif-8","title":"8.Мышечные ткани саркомер.gif","kind":"animation"}],"prep_topics":["b1000001-0000-4000-8000-000000000010"]},{"id":"lec-hist-nerve_tissue","title":"Неделя 9–10 · Лекция 9/практика · Нервная ткань","module_id":"a1000001-0000-4000-8000-000000000009","module_title":"Нервная система (частная)","topic_id":"b1000001-0000-4000-8000-000000000011","order_index":9,"lesson_number":"9","methodics":[{"material_id":"145f7014-9560-453d-81f7-465d77fa532c","source_key":"histology-zip-method-general","title":"Общая гистология","original_name":"Общая гистология.docx","original_format":"docx","page_start":59,"page_end":65,"page_label":"стр. 59–65","exact_section":"Тема занятия № 21 · НЕРВНАЯ ТКАНЬ. НЕЙРОЦИТЫ, НЕЙРОГЛИЯ И НЕРВНЫЕ ВОЛОКНА"}],"files":[{"material_id":"6dc89e8e-af89-42c0-ad1b-485b5eecfccd","source_key":"histology-zip-scheme-9","title":"9.Нервная ткань","kind":"scheme"},{"material_id":"08f60569-6e0f-49ba-a08f-c509dbdd0bb4","source_key":"histology-zip-gif-9","title":"9.Нервная ткань. Образование миелиновой оболочки.gif","kind":"animation"}],"prep_topics":["b1000001-0000-4000-8000-000000000011"]},{"id":"lec-hist-nervous_system","title":"Неделя 10/14 · Лекция 10/практика · Спинной мозг, ганглий, периферический нерв","module_id":"a1000001-0000-4000-8000-000000000009","module_title":"Нервная система (частная)","topic_id":"b1000001-0000-4000-8000-000000000014","order_index":10,"lesson_number":"10","methodics":[{"material_id":"2184ff0e-34f5-4aee-96bb-0c32e921c1c8","source_key":"histology-zip-method-neuro","title":"метод.по нервн кровен, кроветв.леч","original_name":"метод.по нервн кроветв.леч.doc","original_format":"doc","exact_section":"Тема занятия № 1: Система спинного мозга.","page_note":"Точная пагинация исходного .doc не извлечена надёжно; привязан точный раздел источника."}],"files":[{"material_id":"6d91d5b8-9058-438f-b3cf-5488f3cfc42c","source_key":"histology-zip-scheme-10","title":"10. Спинной мозг","kind":"scheme"},{"material_id":"a39b92f5-38c8-4e92-98c4-5d597b59bb2d","source_key":"histology-zip-spinal-schemes","title":"схемы спинного мозга - копия","kind":"scheme"}],"prep_topics":["b1000001-0000-4000-8000-000000000014"]},{"id":"lec-hist-plan-11-20261008","title":"Неделя 11/15 · Лекция 11/практика · Кора, мозжечок и ВНС","module_id":"a1000001-0000-4000-8000-000000000009","module_title":"Нервная система (частная)","topic_id":"b1000001-0000-4000-8000-000000000015","order_index":11,"lesson_number":"11","methodics":[{"material_id":"2184ff0e-34f5-4aee-96bb-0c32e921c1c8","source_key":"histology-zip-method-neuro","title":"метод.по нервн кроветв.леч","original_name":"метод.по нервн кроветв.леч.doc","original_format":"doc","exact_section":"Тема занятия № 2: Головной мозг. Кора больших полушарий и мозжечок. Вегетативная нервная система.","page_note":"Точная пагинация исходного .doc не извлечена надёжно; привязан точный раздел источника."}],"files":[{"material_id":"2171ca84-6236-4352-82fa-ab1a4901dbdc","source_key":"histology-zip-scheme-11","title":"11. Головной мозг. ВНС","kind":"scheme"}],"prep_topics":["b1000001-0000-4000-8000-000000000015"]},{"id":"lec-hist-sensory","title":"Неделя 12–13 · Лекции 12–13 · Зрение, обоняние, слух, равновесие, вкус","module_id":"a1000001-0000-4000-8000-000000000010","module_title":"Сенсорные системы","topic_id":"b1000001-0000-4000-8000-000000000013","order_index":12,"lesson_number":"12","methodics":[{"material_id":"2184ff0e-34f5-4aee-96bb-0c32e921c1c8","source_key":"histology-zip-method-neuro","title":"метод.по нервн кроветв.леч","original_name":"метод.по нервн кроветв.леч.doc","original_format":"doc","exact_section":"Тема занятия № 3: Органы чувств. Органы зрения и обоняния.","page_note":"Точная пагинация исходного .doc не извлечена надёжно; привязан точный раздел источника."},{"material_id":"2184ff0e-34f5-4aee-96bb-0c32e921c1c8","source_key":"histology-zip-method-neuro","title":"метод.по нервн кроветв.леч","original_name":"метод.по нервн кроветв.леч.doc","original_format":"doc","exact_section":"Тема занятия № 4: Органы вкуса, слуха и равновесия","page_note":"Точная пагинация исходного .doc не извлечена надёжно; привязан точный раздел источника."}],"files":[{"material_id":"11330e2b-04fa-46a3-964e-a6e2f8442557","source_key":"histology-zip-scheme-12","title":"12. Зрительный и обонятельный анализаторы","kind":"scheme"},{"material_id":"323f251f-7063-45e3-9f3a-06dab8fc3a73","source_key":"histology-zip-scheme-13","title":"13. Слуховой вестибулярный и вкусовой анализаторы","kind":"scheme"}],"prep_topics":["b1000001-0000-4000-8000-000000000013"]},{"id":"lec-hist-cvs","title":"Неделя 14 · Лекция 14 · Сердечно-сосудистая система","module_id":"a1000001-0000-4000-8000-000000000011","module_title":"Сердечно-сосудистая система","topic_id":"b1000001-0000-4000-8000-000000000016","order_index":14,"lesson_number":"14","methodics":[{"material_id":"2184ff0e-34f5-4aee-96bb-0c32e921c1c8","source_key":"histology-zip-method-neuro","title":"метод.по нервн кроветв.леч","original_name":"метод.по нервн кроветв.леч.doc","original_format":"doc","exact_section":"Тема занятия № 5: Сердечно-сосудистая система","page_note":"Точная пагинация исходного .doc не извлечена надёжно; привязан точный раздел источника."}],"files":[{"material_id":"4e7e08bb-b937-4533-a77d-ef5f4fd7d86c","source_key":"histology-zip-scheme-14","title":"14. Сердечно-сосудистая система","kind":"scheme"}],"prep_topics":["b1000001-0000-4000-8000-000000000016"]},{"id":"lec-hist-endocrine","title":"Неделя 15 · Лекция 15 · Эндокринная система","module_id":"a1000001-0000-4000-8000-000000000012","module_title":"Эндокринная система","topic_id":"b1000001-0000-4000-8000-000000000017","order_index":15,"lesson_number":"15","methodics":[{"material_id":"2184ff0e-34f5-4aee-96bb-0c32e921c1c8","source_key":"histology-zip-method-neuro","title":"метод.по нервн кроветв.леч","original_name":"метод.по нервн кроветв.леч.doc","original_format":"doc","exact_section":"Тема занятия № 8: Эндокринная система","page_note":"Точная пагинация исходного .doc не извлечена надёжно; привязан точный раздел источника."}],"files":[{"material_id":"fdf7ecb9-4a1d-4825-9044-a3dac1b3add3","source_key":"histology-zip-scheme-17","title":"17-18. Эндокринная система","kind":"scheme"}],"prep_topics":["b1000001-0000-4000-8000-000000000017"]},{"id":"lec-hist-hematopoiesis","title":"Неделя 16–17 · Лекции 16–17 · Кроветворение и иммунная защита","module_id":"a1000001-0000-4000-8000-000000000013","module_title":"Кроветворение и иммунная защита","topic_id":"b1000001-0000-4000-8000-000000000018","order_index":16,"lesson_number":"16","methodics":[{"material_id":"2184ff0e-34f5-4aee-96bb-0c32e921c1c8","source_key":"histology-zip-method-neuro","title":"метод.по нервн кроветв.леч","original_name":"метод.по нервн кроветв.леч.doc","original_format":"doc","exact_section":"Тема занятия № 7: Органы кроветворения и иммунной защиты","page_note":"Точная пагинация исходного .doc не извлечена надёжно; привязан точный раздел источника."}],"files":[{"material_id":"b4a6a145-c809-490c-b96b-9610f3f57e28","source_key":"histology-zip-scheme-15","title":"15. Кроветворение","kind":"scheme"},{"material_id":"2bfb8a29-94e5-494f-abff-46d7f92dd63e","source_key":"histology-zip-scheme-16","title":"16. Иммунная система","kind":"scheme"}],"prep_topics":["b1000001-0000-4000-8000-000000000018"]},{"id":"lec-hist-stom_mbh","title":"Неделя 18 · Лекция 18 · Пищеварительный канал: ротовая полость","module_id":"a1000001-0000-4000-8000-000000000014","module_title":"Пищеварительный канал (начало)","topic_id":"b1000001-0000-4000-8000-000000000019","order_index":18,"lesson_number":"18","methodics":[{"material_id":"d0b7816f-929e-40b8-b422-8abc35703fed","source_key":"histology-zip-method-mouth","title":"гистология. пол. рта","original_name":"гистология.   пол. рта.doc","original_format":"doc","page_start":5,"page_end":12,"page_label":"стр. 5–12","exact_section":"Занятие 1. Характеристика и строение твердых тканей зуба"},{"material_id":"d0b7816f-929e-40b8-b422-8abc35703fed","source_key":"histology-zip-method-mouth","title":"гистология. пол. рта","original_name":"гистология.   пол. рта.doc","original_format":"doc","page_start":13,"page_end":19,"page_label":"стр. 13–19","exact_section":"Занятие 2. Пульпа зуба"},{"material_id":"d0b7816f-929e-40b8-b422-8abc35703fed","source_key":"histology-zip-method-mouth","title":"гистология. пол. рта","original_name":"гистология.   пол. рта.doc","original_format":"doc","page_start":20,"page_end":30,"page_label":"стр. 20–30","exact_section":"Занятие 3. Поддерживающий аппарат зуба – пародонт"},{"material_id":"d0b7816f-929e-40b8-b422-8abc35703fed","source_key":"histology-zip-method-mouth","title":"гистология. пол. рта","original_name":"гистология.   пол. рта.doc","original_format":"doc","page_start":31,"page_end":39,"page_label":"стр. 31–39","exact_section":"Занятие 4. Эмбриология органов полости рта"},{"material_id":"d0b7816f-929e-40b8-b422-8abc35703fed","source_key":"histology-zip-method-mouth","title":"гистология. пол. рта","original_name":"гистология.   пол. рта.doc","original_format":"doc","page_start":40,"page_end":47,"page_label":"стр. 40–47","exact_section":"Занятие 5. Слизистая оболочка полости рта и её производные"},{"material_id":"d0b7816f-929e-40b8-b422-8abc35703fed","source_key":"histology-zip-method-mouth","title":"гистология. пол. рта","original_name":"гистология.   пол. рта.doc","original_format":"doc","page_start":48,"page_end":55,"page_label":"стр. 48–55","exact_section":"Занятие 6. Слюнные железы и лимфоидные образования переднего отдела пищеварительной системы"}],"files":[{"material_id":"f755dfa2-47a3-4fd8-b5a6-9a6e94daa10a","source_key":"histology-zip-scheme-19","title":"19. Передний отдел ЖКТ","kind":"scheme"},{"material_id":"4dc6e21e-3743-4648-90ae-961d01b87a7d","source_key":"histology-zip-scheme-20","title":"20. Средний отдел ЖКТ","kind":"scheme"},{"material_id":"4d5cacd2-ee62-454a-802c-308c98bee4d1","source_key":"histology-zip-scheme-21","title":"21. Большие железы ЖКТ","kind":"scheme"}],"prep_topics":["b1000001-0000-4000-8000-000000000019"]}]'::jsonb) AS x(
    id text,title text,module_id uuid,module_title text,topic_id uuid,order_index int,
    lesson_number text,methodics jsonb,files jsonb,prep_topics jsonb
  )
),
items AS (
  SELECT e.ord,e.value item,c.*
  FROM public.site_content sc
  CROSS JOIN LATERAL jsonb_array_elements(sc.payload->'items') WITH ORDINALITY e(value,ord)
  LEFT JOIN cfg c ON c.id=e.value->>'id'
  WHERE sc.key='lectures'
),
rebuilt AS (
  SELECT ord,
    CASE WHEN cfg.id IS NULL THEN item
    ELSE item || jsonb_build_object(
      'title',cfg.title,'topic',cfg.title,'status','published','lesson_type','lecture',
      'curriculum',jsonb_build_object(
        'scope','current','course_number',2,'semester',3,'module_id',cfg.module_id,
        'module_title',cfg.module_title,'topic_id',cfg.topic_id,'topic_title',cfg.title,
        'order_index',cfg.order_index,'lesson_number',cfg.lesson_number,
        'plan_key','histology-s3-'||cfg.lesson_number
      ),
      'related_learning',
      coalesce(item->'related_learning','{}'::jsonb) || jsonb_build_object(
        'curriculum',jsonb_build_object(
          'course_number',2,'semester',3,'module_id',cfg.module_id,'module_title',cfg.module_title,
          'topic_id',cfg.topic_id,'topic_title',cfg.title,'order_index',cfg.order_index,'lesson_number',cfg.lesson_number
        ),
        'methodics',cfg.methodics,'files',cfg.files,
        'preparations',coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'trainer_id',c.id,'name',coalesce(c.preparation->>'name',''),
            'source_key',c.source_key,'label',coalesce(c.preparation->>'name','')
          ) ORDER BY coalesce(c.preparation->>'name',''),c.id)
          FROM public.trainer_feed_cards c
          WHERE c.subject_slug='histology' AND c.is_published=true AND c.mode_set='preparation'
            AND c.plan_topic_id=ANY(ARRAY(
              SELECT value::uuid FROM jsonb_array_elements_text(cfg.prep_topics) value
            ))
        ),'[]'::jsonb),
        'electronograms',coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'trainer_id',c.id,'name',coalesce(c.preparation->>'name',''),
            'source_key',c.source_key,'label',coalesce(c.preparation->>'name','')
          ) ORDER BY coalesce(c.preparation->>'name',''),c.id)
          FROM public.trainer_feed_cards c
          WHERE c.subject_slug='histology' AND c.is_published=true AND c.mode_set='electronogram'
            AND c.plan_topic_id=cfg.topic_id
        ),'[]'::jsonb)
      )
    ) END AS item
  FROM items
),
packed AS (
  SELECT jsonb_agg(item ORDER BY ord) payload_items FROM rebuilt
)
UPDATE public.site_content sc
SET payload=jsonb_set(sc.payload,'{items}',packed.payload_items,true),updated_at=now()
FROM packed
WHERE sc.key='lectures';

-- Correct old trainer-plan crossings used by the lectures above.
UPDATE public.trainer_feed_cards
SET plan_topic_id='b1000001-0000-4000-8000-000000000007',updated_at=now()
WHERE subject_slug='histology' AND is_published=true AND mode_set='preparation'
  AND plan_topic_id='b1000001-0000-4000-8000-000000000008'
  AND preparation->>'name'='Кровь мазок';

UPDATE public.trainer_feed_cards
SET plan_topic_id='b1000001-0000-4000-8000-000000000015',updated_at=now()
WHERE subject_slug='histology' AND is_published=true AND mode_set='preparation'
  AND plan_topic_id='b1000001-0000-4000-8000-000000000014'
  AND preparation->>'name'='Кора мозжечка';

UPDATE public.trainer_feed_cards
SET plan_topic_id=NULL,updated_at=now()
WHERE subject_slug='histology' AND is_published=true AND mode_set='preparation'
  AND plan_topic_id='b1000001-0000-4000-8000-000000000019'
  AND preparation->>'name' IN ('Аппендикс','Дно желудка','Пищевод','Толстая кишка','Тонкая кишка');

UPDATE public.trainer_feed_cards
SET plan_topic_id=NULL,updated_at=now()
WHERE subject_slug='histology' AND is_published=true AND mode_set='electronogram'
  AND plan_topic_id='b1000001-0000-4000-8000-000000000019'
  AND preparation->>'name' IN (
    'Микроворсинки эпителиоцитов кишечника',
    'Париетальный экзокриноцит собственных желез желудка'
  );

UPDATE public.materials
SET module_id='a1000001-0000-4000-8000-000000000014',
    topic_id='b1000001-0000-4000-8000-000000000019',
    updated_at=now()
WHERE source_key IN ('histology-zip-scheme-19','histology-zip-scheme-20','histology-zip-scheme-21');

WITH future_ids(id) AS (
  VALUES ('lec-hist-gi'),('lec-hist-glands'),('lec-hist-respiratory'),
         ('lec-hist-skin'),('lec-hist-urinary'),('lec-hist-reproductive'),('lec-hist-histotech')
),
patched AS (
  SELECT e.ord,
    CASE WHEN f.id IS NULL THEN e.value
         ELSE e.value || jsonb_build_object(
           'curriculum',coalesce(e.value->'curriculum','{}'::jsonb)||jsonb_build_object('scope','future')
         )
    END item
  FROM public.site_content sc
  CROSS JOIN LATERAL jsonb_array_elements(sc.payload->'items') WITH ORDINALITY e(value,ord)
  LEFT JOIN future_ids f ON f.id=e.value->>'id'
  WHERE sc.key='lectures'
)
UPDATE public.site_content sc
SET payload=jsonb_set(sc.payload,'{items}',(SELECT jsonb_agg(item ORDER BY ord) FROM patched),true),
    updated_at=now()
WHERE sc.key='lectures';

COMMIT;
