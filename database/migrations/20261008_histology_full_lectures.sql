-- MEDBIOHIM / Histology full lecture bodies
-- Source-backed conversion from imported Гистология.zip materials.
-- content.zip is kept as the physical media/trainer source; lecture text is not duplicated from binary files.

DO $$
DECLARE
  v_payload jsonb;
  v_items jsonb;
  v_item jsonb;
  v_html text;
  v_plain text;
  v_sources jsonb;
  r record;
  v_module_id uuid;
  v_topic_id uuid;
BEGIN
  SELECT payload INTO v_payload FROM public.site_content WHERE key='lectures' FOR UPDATE;
  IF v_payload IS NULL THEN v_payload := jsonb_build_object('items','[]'::jsonb); END IF;
  v_items := COALESCE(v_payload->'items','[]'::jsonb);

  FOR r IN
    SELECT * FROM (VALUES
      ('lec-hist-cytology','Цитология','Цитология','lecture',ARRAY['histology-zip-scheme-1']::text[]),
      ('lec-hist-embryology','Общая эмбриология и эмбриогенез','Общая эмбриология','lecture',ARRAY['histology-zip-scheme-2','histology-zip-scheme-27']::text[]),
      ('lec-hist-epithelium','Эпителиальные ткани','Эпителиальные ткани','lecture',ARRAY['histology-zip-scheme-3']::text[]),
      ('lec-hist-connective','Соединительные и хрящевые ткани','Соединительные ткани','lecture',ARRAY['histology-zip-scheme-5','histology-zip-scheme-6']::text[]),
      ('lec-hist-bone_muscle','Костные и мышечные ткани','Скелетные ткани','lecture',ARRAY['histology-zip-scheme-7','histology-zip-scheme-8']::text[]),
      ('lec-hist-nerve_tissue','Нервная ткань','Нервная ткань','lecture',ARRAY['histology-zip-scheme-9']::text[]),
      ('lec-hist-nervous_system','Нервная система: спинной и головной мозг, ВНС','Нервная система (частная)','lecture',ARRAY['histology-zip-scheme-10','histology-zip-scheme-11']::text[]),
      ('lec-hist-sensory','Сенсорные системы: зрение, обоняние, слух, равновесие и вкус','Сенсорные системы','lecture',ARRAY['histology-zip-scheme-12','histology-zip-scheme-13']::text[]),
      ('lec-hist-cvs','Сердечно-сосудистая система','Сердечно-сосудистая система','lecture',ARRAY['histology-zip-scheme-14']::text[]),
      ('lec-hist-hematopoiesis','Кроветворение и иммунная система','Кроветворение и иммунная защита','lecture',ARRAY['histology-zip-scheme-15','histology-zip-scheme-16']::text[]),
      ('lec-hist-endocrine','Эндокринная система','Эндокринная система','lecture',ARRAY['histology-zip-scheme-17']::text[]),
      ('lec-hist-gi','Пищеварительный канал','Пищеварительный канал (начало)','lecture',ARRAY['histology-zip-scheme-19','histology-zip-scheme-20']::text[]),
      ('lec-hist-glands','Большие железы пищеварительного тракта','Пищеварительный канал (начало)','lecture',ARRAY['histology-zip-scheme-21']::text[]),
      ('lec-hist-respiratory','Дыхательная система','','lecture',ARRAY['histology-zip-scheme-22']::text[]),
      ('lec-hist-skin','Кожа и её производные','','lecture',ARRAY['histology-zip-scheme-23']::text[]),
      ('lec-hist-urinary','Выделительная система','','lecture',ARRAY['histology-zip-scheme-24']::text[]),
      ('lec-hist-reproductive','Мужская и женская половые системы','','lecture',ARRAY['histology-zip-scheme-25','histology-zip-scheme-26']::text[]),
      ('lec-hist-stom_mbh','Орофациальная область и стоматологическая гистология','Пищеварительный канал (начало)','lecture',ARRAY['histology-zip-scheme-19']::text[]),
      ('lec-hist-histotech','Гистотехника: приготовление и окраска препаратов','','supplementary',ARRAY['histology-zip-scheme-0']::text[])
    ) AS x(id,title,module_title,lesson_type,source_keys)
  LOOP
    SELECT string_agg(
      '<section class="lecture-source-section"><h2>' ||
      replace(replace(m.title,'&','&amp;'),'<','&lt;') ||
      '</h2>' || COALESCE(m.content_html,'') || '</section>',
      E'\n' ORDER BY m.source_key
    ) INTO v_html
    FROM public.materials m
    WHERE m.subject_id=(SELECT id FROM public.subjects WHERE slug='histology' AND semester=3 LIMIT 1)
      AND m.source_key=ANY(r.source_keys) AND m.is_published=true;

    v_html := '<h1>' || r.title || '</h1>' ||
      '<p><strong>Полная лекция MEDBIOHIM.</strong> Source-backed материал из <code>Гистология.zip</code>. ' ||
      'Отсутствующие или неоднозначные сведения не додумываются.</p>' ||
      '<h2>Как работать с лекцией</h2><ol>' ||
      '<li>Сначала изучить морфологические признаки.</li>' ||
      '<li>Связать строение с функцией.</li>' ||
      '<li>Закрепить материал по препаратам и электронограммам.</li>' ||
      '<li>Проверить себя тестами и экзаменационными вопросами.</li></ol>' ||
      COALESCE(v_html,'<p>Исходный материал для этой темы не найден.</p>') ||
      '<h2>Алгоритм ответа</h2><ol>' ||
      '<li>Назвать объект и принадлежность.</li>' ||
      '<li>Описать строение и диагностические признаки.</li>' ||
      '<li>Отличить от сходных объектов.</li>' ||
      '<li>Связать морфологию с функцией.</li>' ||
      '<li>Для препарата указать локализацию и диагностику.</li></ol>' ||
      '<h2>Связь с практикой</h2><p>После лекции: ' ||
      '<a href="/subjects/histology?tab=trainer">микропрепараты и тренажёр</a> · ' ||
      '<a href="/subjects/histology?tab=materials">материалы и электронограммы</a> · ' ||
      '<a href="/subjects/histology?tab=tests">тесты</a>.</p>';

    v_plain := regexp_replace(v_html,'<[^>]+>',' ','g');
    v_plain := replace(replace(replace(v_plain,'&nbsp;',' '),'&amp;','&'),'&lt;','<');
    v_plain := regexp_replace(v_plain,'[[:space:]]+',' ','g');

    SELECT m.id,t.id INTO v_module_id,v_topic_id
    FROM public.modules m
    JOIN public.subjects s ON s.id=m.subject_id
    LEFT JOIN LATERAL (
      SELECT t.id FROM public.topics t WHERE t.module_id=m.id ORDER BY t.order_index LIMIT 1
    ) t ON true
    WHERE s.slug='histology' AND s.semester=3 AND r.module_title<>'' AND m.title=r.module_title
    LIMIT 1;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('source_key',m.source_key,'title',m.title) ORDER BY m.source_key),'[]'::jsonb)
    INTO v_sources
    FROM public.materials m WHERE m.source_key=ANY(r.source_keys);

    v_item := jsonb_build_object(
      'id',r.id,'title',r.title,'subject','Гистология, цитология','subject_slug','histology',
      'topic',r.module_title,'lesson_type',r.lesson_type,'status','published',
      'body_md',left(v_plain,200000),'body_html',v_html,
      'summary','Полный source-backed конспект по теме на основе схем/таблиц Гистология.zip.',
      'media','[]'::jsonb,'sources',v_sources,
      'curriculum',jsonb_build_object('module_id',v_module_id,'topic_id',v_topic_id,'module_title',r.module_title),
      'generation',jsonb_build_object('type','source_backed_archive_conversion','archive','Гистология.zip','content_archive','content.zip','source_keys',to_jsonb(r.source_keys)),
      'created_at',now(),'updated_at',now(),'published_at',now()
    );

    SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) INTO v_items
    FROM jsonb_array_elements(v_items) x WHERE x->>'id'<>r.id;
    v_items := v_items || jsonb_build_array(v_item);
  END LOOP;

  v_payload := jsonb_set(v_payload,'{items}',v_items,true);
  UPDATE public.site_content SET payload=v_payload,updated_at=now() WHERE key='lectures';
  IF NOT FOUND THEN
    INSERT INTO public.site_content(key,payload,updated_at) VALUES('lectures',v_payload,now());
  END IF;

  UPDATE public.histology_lectures SET is_published=false,updated_at=now()
  WHERE subject_slug='histology' AND id IN (
    'lec-hist-cytology','lec-hist-embryology','lec-hist-epithelium','lec-hist-connective',
    'lec-hist-bone_muscle','lec-hist-nerve_tissue','lec-hist-nervous_system','lec-hist-cvs',
    'lec-hist-hematopoiesis','lec-hist-endocrine','lec-hist-gi','lec-hist-glands',
    'lec-hist-respiratory','lec-hist-skin','lec-hist-urinary','lec-hist-reproductive','lec-hist-stom_mbh'
  );
END $$;
