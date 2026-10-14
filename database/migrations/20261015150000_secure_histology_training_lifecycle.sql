BEGIN;

CREATE OR REPLACE FUNCTION public.list_histology_trainings(p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE v_user uuid := auth.uid(); v_items jsonb;
BEGIN
 IF v_user IS NULL THEN RETURN jsonb_build_object('ok',false,'status',401,'code','UNAUTHORIZED','message','Требуется войти в систему'); END IF;
 IF p_status IS NOT NULL AND p_status NOT IN ('in_progress','completed','cancelled') THEN
  RETURN jsonb_build_object('ok',false,'status',422,'code','VALIDATION_ERROR','message','Недопустимый статус тренировки');
 END IF;
 SELECT coalesce(jsonb_agg(row_data ORDER BY updated_at DESC),'[]'::jsonb) INTO v_items FROM (
  SELECT jsonb_build_object('id',t.id,'topics',t.topics,'content_type',t.content_type,'question_count',t.question_count,
   'label_mode',t.label_mode,'layout_mode',t.layout_mode,'status',t.status,'current_index',t.current_index,
   'score',t.score,'total_questions',t.total_questions,'created_at',t.created_at,'updated_at',t.updated_at,
   'completed_at',t.completed_at,'answered_count',(SELECT count(*)::integer FROM public.training_answers a
    WHERE a.training_id=t.id AND (a.user_answer IS NOT NULL OR a.is_skipped))) row_data,t.updated_at
  FROM public.trainings t WHERE t.user_id=v_user AND (p_status IS NULL OR t.status=p_status)
  ORDER BY t.updated_at DESC LIMIT 50
 ) q;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('items',v_items));
END $fn$;

CREATE OR REPLACE FUNCTION public.create_histology_training(
 p_topics jsonb DEFAULT '[]'::jsonb,
 p_content_type text DEFAULT 'all',
 p_question_count integer DEFAULT 20,
 p_all_questions boolean DEFAULT false,
 p_label_mode text DEFAULT 'without',
 p_layout_mode text DEFAULT 'top',
 p_card_ids text[] DEFAULT NULL,
 p_force boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE
 v_user uuid := auth.uid(); v_topics text[] := ARRAY[]::text[]; v_ids text[] := ARRAY[]::text[];
 v_training public.trainings%ROWTYPE; v_existing public.trainings%ROWTYPE; v_limit integer;
 v_candidates integer; v_card_count integer; v_id text; v_card public.trainer_feed_cards%ROWTYPE;
 v_safe_options jsonb; v_safe_question jsonb; v_snapshot jsonb;
BEGIN
 IF v_user IS NULL THEN RETURN jsonb_build_object('ok',false,'status',401,'code','UNAUTHORIZED','message','Требуется войти в систему'); END IF;
 IF p_content_type NOT IN ('all','preparation','electronogram') OR p_label_mode NOT IN ('with','without','manual')
  OR p_layout_mode NOT IN ('sidebar','list','top') THEN
  RETURN jsonb_build_object('ok',false,'status',422,'code','VALIDATION_ERROR','message','Недопустимые параметры тренировки');
 END IF;
 IF p_topics IS NULL OR jsonb_typeof(p_topics)<>'array' OR jsonb_array_length(p_topics)>100
  OR (p_card_ids IS NOT NULL AND cardinality(p_card_ids)>500) THEN
  RETURN jsonb_build_object('ok',false,'status',422,'code','VALIDATION_ERROR','message','Некорректные фильтры тренировки');
 END IF;
 SELECT coalesce(array_agg(btrim(value)),ARRAY[]::text[]) INTO v_topics
 FROM jsonb_array_elements_text(p_topics) AS x(value) WHERE btrim(value)<>'' AND length(value)<=200;
 IF NOT EXISTS (SELECT 1 FROM public.group_memberships gm JOIN public.groups g ON g.id=gm.group_id
  WHERE gm.user_id=v_user AND gm.is_active=true AND g.is_active=true AND g.specialty_slug='mbh') THEN
  RETURN jsonb_build_object('ok',false,'status',403,'code','FORBIDDEN','message','Тренажёр по гистологии доступен только студентам специальности МБХ');
 END IF;

 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_user::text));
 SELECT * INTO v_existing FROM public.trainings WHERE user_id=v_user AND status='in_progress'
  ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;
 IF FOUND AND coalesce(p_force,false)=false THEN
  RETURN jsonb_build_object('ok',false,'status',409,'code','TRAINING_IN_PROGRESS',
   'message','У вас уже есть незавершённая тренировка','existing_training_id',v_existing.id);
 END IF;
 IF FOUND AND coalesce(p_force,false)=true THEN
  UPDATE public.trainings SET status='cancelled',completed_at=now(),updated_at=now()
   WHERE user_id=v_user AND status='in_progress';
 END IF;

 SELECT count(*)::integer INTO v_candidates FROM public.trainer_feed_cards c
 LEFT JOIN public.modules m ON m.id=c.plan_module_id LEFT JOIN public.topics tp ON tp.id=c.plan_topic_id
 WHERE c.is_published=true AND c.subject_slug='histology' AND coalesce(c.specialty_slug,'mbh')='mbh'
  AND (p_content_type='all' OR c.mode_set=p_content_type)
  AND (cardinality(coalesce(p_card_ids,ARRAY[]::text[]))=0 OR c.id=ANY(p_card_ids))
  AND (cardinality(v_topics)=0 OR coalesce(nullif(tp.title,''),nullif(m.title,''),c.tags->>0)=ANY(v_topics));
 IF v_candidates=0 THEN RETURN jsonb_build_object('ok',false,'status',422,'code','NO_QUESTIONS','message','По выбранным фильтрам нет опубликованных карточек'); END IF;

 v_limit := CASE WHEN cardinality(coalesce(p_card_ids,ARRAY[]::text[]))>0 THEN least(v_candidates,cardinality(p_card_ids))
  WHEN coalesce(p_all_questions,false) THEN least(v_candidates,500)
  ELSE least(v_candidates,greatest(1,least(coalesce(p_question_count,20),500))) END;
 SELECT array_agg(id ORDER BY rn) INTO v_ids FROM (
  SELECT c.id,row_number() OVER(ORDER BY
   CASE WHEN cardinality(coalesce(p_card_ids,ARRAY[]::text[]))>0 THEN array_position(p_card_ids,c.id) END NULLS LAST,
   CASE WHEN cardinality(coalesce(p_card_ids,ARRAY[]::text[]))=0 THEN random() END NULLS LAST,c.id) rn
  FROM public.trainer_feed_cards c LEFT JOIN public.modules m ON m.id=c.plan_module_id
  LEFT JOIN public.topics tp ON tp.id=c.plan_topic_id
  WHERE c.is_published=true AND c.subject_slug='histology' AND coalesce(c.specialty_slug,'mbh')='mbh'
   AND (p_content_type='all' OR c.mode_set=p_content_type)
   AND (cardinality(coalesce(p_card_ids,ARRAY[]::text[]))=0 OR c.id=ANY(p_card_ids))
   AND (cardinality(v_topics)=0 OR coalesce(nullif(tp.title,''),nullif(m.title,''),c.tags->>0)=ANY(v_topics))
  ORDER BY rn LIMIT v_limit
 ) picked;
 IF coalesce(cardinality(v_ids),0)=0 THEN RETURN jsonb_build_object('ok',false,'status',422,'code','NO_QUESTIONS','message','Не удалось подобрать карточки для тренировки'); END IF;

 INSERT INTO public.trainings(user_id,subject_slug,specialty_slug,topics,content_type,question_count,label_mode,layout_mode,status,question_ids,current_index,total_questions)
 VALUES(v_user,'histology','mbh',to_jsonb(v_topics),p_content_type,greatest(1,least(coalesce(p_question_count,20),500)),
  p_label_mode,p_layout_mode,'in_progress',v_ids,0,cardinality(v_ids)) RETURNING * INTO v_training;

 FOREACH v_id IN ARRAY v_ids LOOP
  SELECT c.* INTO v_card FROM public.trainer_feed_cards c WHERE c.id=v_id AND c.is_published=true;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT coalesce(jsonb_agg(o.value-ARRAY['correct','isCorrect','is_correct']::text[] ORDER BY o.ordinality),'[]'::jsonb)
   INTO v_safe_options FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_card.question->'options')='array' THEN v_card.question->'options' ELSE '[]'::jsonb END)
   WITH ORDINALITY o(value,ordinality);
  v_safe_question := (v_card.question-ARRAY['explanation','answer','correct','isCorrect','is_correct','correctAnswer','correct_answer',
    'correctOption','correct_option','correctOptionId','correct_option_id']::text[]) || jsonb_build_object('options',v_safe_options);
  v_snapshot := jsonb_build_object('id',v_card.id,'mode_set',v_card.mode_set,
   'preparation',v_card.preparation-ARRAY['name','organ','captions']::text[],
   'hotspots',v_card.hotspots,'question',v_safe_question,'tags',v_card.tags,'difficulty',v_card.difficulty);
  INSERT INTO public.training_answers(training_id,question_id,"order",user_answer,is_correct,is_skipped,options,question_snapshot,review_snapshot)
  VALUES(v_training.id,v_card.id,array_position(v_ids,v_card.id)-1,NULL,NULL,false,v_safe_options,v_snapshot,'{}'::jsonb);
 END LOOP;
 SELECT count(*)::integer INTO v_card_count FROM public.training_answers WHERE training_id=v_training.id;
 UPDATE public.trainings SET total_questions=v_card_count,
   question_ids=ARRAY(SELECT question_id FROM public.training_answers WHERE training_id=v_training.id ORDER BY "order")
  WHERE id=v_training.id RETURNING * INTO v_training;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object(
  'training',jsonb_build_object('id',v_training.id,'topics',v_training.topics,'content_type',v_training.content_type,
   'question_count',v_training.question_count,'label_mode',v_training.label_mode,'layout_mode',v_training.layout_mode,
   'status',v_training.status,'current_index',v_training.current_index,'score',v_training.score,
   'total_questions',v_training.total_questions,'created_at',v_training.created_at,'updated_at',v_training.updated_at),
  'questions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.question_id,'mode_set',a.question_snapshot->>'mode_set',
   'preparation',a.question_snapshot->'preparation','question',a.question_snapshot->'question','options',a.options,
   'hotspots',a.question_snapshot->'hotspots','tags',a.question_snapshot->'tags','difficulty',a.question_snapshot->'difficulty')
   ORDER BY a."order") FROM public.training_answers a WHERE a.training_id=v_training.id),'[]'::jsonb)));
END $fn$;

CREATE OR REPLACE FUNCTION public.get_histology_training(p_training_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE v_user uuid := auth.uid(); v_training public.trainings%ROWTYPE; v_answers jsonb;
BEGIN
 IF v_user IS NULL THEN RETURN jsonb_build_object('ok',false,'status',401,'code','UNAUTHORIZED','message','Требуется войти в систему'); END IF;
 SELECT * INTO v_training FROM public.trainings WHERE id=p_training_id AND user_id=v_user;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',404,'code','NOT_FOUND','message','Тренировка не найдена'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'question_id',a.question_id,'order',a."order",
  'user_answer',a.user_answer,'is_correct',a.is_correct,'is_skipped',a.is_skipped,
  'options',CASE WHEN a.user_answer IS NOT NULL OR a.is_skipped THEN a.options ELSE
   coalesce((SELECT jsonb_agg(o.value-ARRAY['correct','isCorrect','is_correct']::text[] ORDER BY o.ordinality)
    FROM jsonb_array_elements(a.options) WITH ORDINALITY o(value,ordinality)),'[]'::jsonb) END,
  'question_snapshot',a.question_snapshot,
  'review_snapshot',CASE WHEN a.user_answer IS NOT NULL OR a.is_skipped THEN a.review_snapshot ELSE '{}'::jsonb END)
  ORDER BY a."order"),'[]'::jsonb) INTO v_answers
 FROM public.training_answers a WHERE a.training_id=v_training.id;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object(
  'training',jsonb_build_object('id',v_training.id,'topics',v_training.topics,'content_type',v_training.content_type,
   'question_count',v_training.question_count,'label_mode',v_training.label_mode,'layout_mode',v_training.layout_mode,
   'status',v_training.status,'current_index',v_training.current_index,'score',v_training.score,
   'total_questions',v_training.total_questions,'created_at',v_training.created_at,'updated_at',v_training.updated_at,'completed_at',v_training.completed_at),
  'answers',v_answers));
END $fn$;

CREATE OR REPLACE FUNCTION public.save_histology_training_answer(
 p_training_id uuid,p_order integer,p_user_answer text DEFAULT NULL,p_is_skipped boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE
 v_user uuid:=auth.uid(); v_training public.trainings%ROWTYPE; v_answer public.training_answers%ROWTYPE;
 v_card public.trainer_feed_cards%ROWTYPE; v_options jsonb; v_correct boolean:=NULL; v_is_option boolean:=false;
 v_norm_input text; v_norm_expected text; v_label text; v_caption_count integer:=0; v_caption_matches integer:=0;
 v_answered_options jsonb; v_review jsonb;
BEGIN
 IF v_user IS NULL THEN RETURN jsonb_build_object('ok',false,'status',401,'code','UNAUTHORIZED','message','Требуется войти в систему'); END IF;
 SELECT * INTO v_training FROM public.trainings WHERE id=p_training_id AND user_id=v_user FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',404,'code','NOT_FOUND','message','Тренировка не найдена'); END IF;
 IF v_training.status<>'in_progress' THEN RETURN jsonb_build_object('ok',false,'status',409,'code','TRAINING_NOT_ACTIVE','message','Тренировка уже завершена или отменена'); END IF;
 SELECT * INTO v_answer FROM public.training_answers WHERE training_id=v_training.id AND "order"=p_order FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',404,'code','QUESTION_NOT_FOUND','message','Вопрос не найден в этой тренировке'); END IF;
 IF v_answer.user_answer IS NOT NULL OR v_answer.is_skipped THEN
  RETURN jsonb_build_object('ok',false,'status',409,'code','ALREADY_ANSWERED','message','На этот вопрос уже дан ответ');
 END IF;
 IF coalesce(p_is_skipped,false)=false AND (p_user_answer IS NULL OR btrim(p_user_answer)='') THEN
  RETURN jsonb_build_object('ok',false,'status',422,'code','VALIDATION_ERROR','message','Введите ответ или нажмите «Пропустить»');
 END IF;
 SELECT * INTO v_card FROM public.trainer_feed_cards WHERE id=v_answer.question_id AND is_published=true;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',409,'code','QUESTION_UNAVAILABLE','message','Карточка больше недоступна'); END IF;
 v_options:=CASE WHEN jsonb_typeof(v_card.question->'options')='array' THEN v_card.question->'options' ELSE '[]'::jsonb END;
 SELECT coalesce(jsonb_agg(o.value ORDER BY o.ordinality),'[]'::jsonb) INTO v_answered_options
 FROM jsonb_array_elements(v_options) WITH ORDINALITY o(value,ordinality);

 IF coalesce(p_is_skipped,false) THEN
  v_correct:=NULL;
 ELSIF v_training.label_mode<>'manual' AND jsonb_array_length(v_options)>0 THEN
  SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(v_options) o(value) WHERE o.value->>'id'=p_user_answer) INTO v_is_option;
  IF NOT v_is_option THEN RETURN jsonb_build_object('ok',false,'status',422,'code','INVALID_OPTION','message','Выбранный вариант отсутствует в вопросе'); END IF;
  SELECT coalesce(bool_or(coalesce((o.value->>'correct')::boolean,false)),false) INTO v_correct
   FROM jsonb_array_elements(v_options) o(value) WHERE o.value->>'id'=p_user_answer;
 ELSE
  v_norm_input:=lower(regexp_replace(replace(coalesce(p_user_answer,''),'ё','е'),'[^[:alnum:]]+',' ','g'));
  IF v_training.content_type='electronogram' AND jsonb_typeof(v_card.preparation->'captions')='array'
    AND jsonb_array_length(v_card.preparation->'captions')>0 THEN
   FOR v_label IN SELECT jsonb_array_elements_text(v_card.preparation->'captions') LOOP
    v_caption_count:=v_caption_count+1;
    v_norm_expected:=lower(regexp_replace(replace(regexp_replace(v_label,'^\s*([[:digit:]]+|[[:alpha:]]+)\s*[.)—:-]\s*','','i'),'ё','е'),'[^[:alnum:]]+',' ','g'));
    IF btrim(v_norm_expected)<>'' AND position(btrim(v_norm_expected) in btrim(v_norm_input))>0 THEN v_caption_matches:=v_caption_matches+1; END IF;
   END LOOP;
   v_correct:=v_caption_count>0 AND v_caption_matches=v_caption_count;
  ELSE
   v_correct:=false;
   FOR v_label IN
    SELECT o.value->>'label' FROM jsonb_array_elements(v_options) o(value) WHERE coalesce((o.value->>'correct')::boolean,false)
    UNION SELECT u.label FROM unnest(ARRAY[v_card.preparation->>'name',v_card.preparation->>'organ']) AS u(label)
      WHERE u.label IS NOT NULL AND btrim(u.label)<>''
   LOOP
    v_norm_expected:=lower(regexp_replace(replace(v_label,'ё','е'),'[^[:alnum:]]+',' ','g'));
    IF btrim(v_norm_expected)<>'' AND btrim(v_norm_input)=btrim(v_norm_expected) THEN v_correct:=true; EXIT; END IF;
   END LOOP;
  END IF;
 END IF;
 v_review:=jsonb_build_object('preparation',jsonb_build_object(
  'name',v_card.preparation->'name','organ',v_card.preparation->'organ',
  'captions',coalesce(v_card.preparation->'captions','[]'::jsonb),
  'caption_slots',coalesce(v_card.preparation->'caption_slots','[]'::jsonb)),
  'question',jsonb_build_object('explanation',v_card.question->'explanation','answer',v_card.question->'answer'));
 UPDATE public.training_answers SET user_answer=CASE WHEN coalesce(p_is_skipped,false) THEN NULL ELSE btrim(p_user_answer) END,
  is_correct=v_correct,is_skipped=coalesce(p_is_skipped,false),options=v_answered_options,review_snapshot=v_review,answered_at=now()
 WHERE id=v_answer.id RETURNING * INTO v_answer;
 UPDATE public.trainings SET current_index=greatest(current_index,p_order),updated_at=now()
  WHERE id=v_training.id;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object(
  'answer',jsonb_build_object('id',v_answer.id,'question_id',v_answer.question_id,'order',v_answer."order",
   'user_answer',v_answer.user_answer,'is_correct',v_answer.is_correct,'is_skipped',v_answer.is_skipped),
  'correct',v_correct,'explanation',CASE WHEN coalesce(p_is_skipped,false) THEN NULL ELSE v_card.question->'explanation' END));
END $fn$;

CREATE OR REPLACE FUNCTION public.complete_histology_training(p_training_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE v_user uuid:=auth.uid(); v_training public.trainings%ROWTYPE;
 v_total integer; v_correct integer; v_wrong integer; v_skipped integer; v_percent numeric; v_grade integer;
BEGIN
 IF v_user IS NULL THEN RETURN jsonb_build_object('ok',false,'status',401,'code','UNAUTHORIZED','message','Требуется войти в систему'); END IF;
 SELECT * INTO v_training FROM public.trainings WHERE id=p_training_id AND user_id=v_user FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',404,'code','NOT_FOUND','message','Тренировка не найдена'); END IF;
 IF v_training.status='cancelled' THEN RETURN jsonb_build_object('ok',false,'status',409,'code','TRAINING_CANCELLED','message','Отменённую тренировку нельзя завершить'); END IF;
 IF v_training.status='in_progress' THEN
  UPDATE public.training_answers SET is_skipped=true,answered_at=coalesce(answered_at,now())
   WHERE training_id=v_training.id AND user_answer IS NULL AND is_skipped=false;
 END IF;
 SELECT count(*)::integer,count(*) FILTER(WHERE is_correct=true)::integer,count(*) FILTER(WHERE is_correct=false)::integer,
  count(*) FILTER(WHERE is_skipped)::integer INTO v_total,v_correct,v_wrong,v_skipped
 FROM public.training_answers WHERE training_id=v_training.id;
 v_percent:=CASE WHEN v_total=0 THEN 0 ELSE round(v_correct::numeric*100/v_total,1) END;
 v_grade:=CASE WHEN v_percent>=90 THEN 5 WHEN v_percent>=75 THEN 4 WHEN v_percent>=60 THEN 3 ELSE 2 END;
 IF v_training.status='in_progress' THEN
  UPDATE public.trainings SET status='completed',completed_at=now(),updated_at=now(),score=v_percent,
   total_questions=v_total,current_index=greatest(current_index,v_total-1)
   WHERE id=v_training.id RETURNING * INTO v_training;
 END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object(
  'training',jsonb_build_object('id',v_training.id,'topics',v_training.topics,'content_type',v_training.content_type,
   'question_count',v_training.question_count,'label_mode',v_training.label_mode,'layout_mode',v_training.layout_mode,
   'status',v_training.status,'current_index',v_training.current_index,'score',v_training.score,
   'total_questions',v_training.total_questions,'created_at',v_training.created_at,'updated_at',v_training.updated_at,'completed_at',v_training.completed_at),
  'stats',jsonb_build_object('total',v_total,'correct',v_correct,'wrong',v_wrong,'skipped',v_skipped,'percent',v_percent,'grade',v_grade)));
END $fn$;

CREATE OR REPLACE FUNCTION public.cancel_histology_training(p_training_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE v_user uuid:=auth.uid(); v_training public.trainings%ROWTYPE;
BEGIN
 IF v_user IS NULL THEN RETURN jsonb_build_object('ok',false,'status',401,'code','UNAUTHORIZED','message','Требуется войти в систему'); END IF;
 SELECT * INTO v_training FROM public.trainings WHERE id=p_training_id AND user_id=v_user FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status',404,'code','NOT_FOUND','message','Тренировка не найдена'); END IF;
 IF v_training.status='completed' THEN RETURN jsonb_build_object('ok',false,'status',409,'code','TRAINING_COMPLETED','message','Завершённую тренировку нельзя отменить'); END IF;
 IF v_training.status='in_progress' THEN
  UPDATE public.trainings SET status='cancelled',completed_at=now(),updated_at=now()
   WHERE id=v_training.id RETURNING * INTO v_training;
 END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object(
  'training',jsonb_build_object('id',v_training.id,'topics',v_training.topics,'content_type',v_training.content_type,
   'question_count',v_training.question_count,'label_mode',v_training.label_mode,'layout_mode',v_training.layout_mode,
   'status',v_training.status,'current_index',v_training.current_index,'score',v_training.score,
   'total_questions',v_training.total_questions,'created_at',v_training.created_at,'updated_at',v_training.updated_at,'completed_at',v_training.completed_at)));
END $fn$;

REVOKE ALL ON FUNCTION public.list_histology_trainings(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_histology_training(jsonb,text,integer,boolean,text,text,text[],boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_histology_training(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_histology_training_answer(uuid,integer,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_histology_training(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_histology_training(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_histology_trainings(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_histology_training(jsonb,text,integer,boolean,text,text,text[],boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_histology_training(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_histology_training_answer(uuid,integer,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_histology_training(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_histology_training(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;