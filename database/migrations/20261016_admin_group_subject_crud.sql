-- Admin-only CRUD for groups and subjects. Uses the caller's JWT and database role membership.
-- Deletes are soft deletes so existing schedules, homework and academic records retain their foreign keys.
CREATE OR REPLACE FUNCTION public.medbiohim_admin_mutate_group(
  p_action text, p_id uuid DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_group public.groups%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_user_id AND lower(r.code) = 'admin'
  ) THEN
    RAISE EXCEPTION 'administrator role required' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('create','update','delete') OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid operation' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'create' THEN
    IF length(trim(coalesce(p_payload->>'name',''))) NOT BETWEEN 1 AND 180 THEN
      RAISE EXCEPTION 'invalid group name' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.groups(code,name,course_number,admission_year,academic_program_name,is_active,specialty_slug)
    VALUES (
      nullif(trim(p_payload->>'code'),''), trim(p_payload->>'name'),
      nullif(p_payload->>'course_number','')::smallint,
      nullif(p_payload->>'admission_year','')::integer,
      nullif(trim(p_payload->>'academic_program_name'),''),
      coalesce((p_payload->>'is_active')::boolean,true),
      nullif(trim(p_payload->>'specialty_slug'),'')
    ) RETURNING * INTO v_group;
  ELSIF p_action = 'update' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'group id required' USING ERRCODE='22023'; END IF;
    UPDATE public.groups SET
      code = CASE WHEN p_payload ? 'code' THEN nullif(trim(p_payload->>'code'),'') ELSE code END,
      name = CASE WHEN p_payload ? 'name' THEN trim(p_payload->>'name') ELSE name END,
      course_number = CASE WHEN p_payload ? 'course_number' THEN nullif(p_payload->>'course_number','')::smallint ELSE course_number END,
      admission_year = CASE WHEN p_payload ? 'admission_year' THEN nullif(p_payload->>'admission_year','')::integer ELSE admission_year END,
      academic_program_name = CASE WHEN p_payload ? 'academic_program_name' THEN nullif(trim(p_payload->>'academic_program_name'),'') ELSE academic_program_name END,
      is_active = CASE WHEN p_payload ? 'is_active' THEN (p_payload->>'is_active')::boolean ELSE is_active END,
      specialty_slug = CASE WHEN p_payload ? 'specialty_slug' THEN nullif(trim(p_payload->>'specialty_slug'),'') ELSE specialty_slug END
    WHERE id = p_id RETURNING * INTO v_group;
    IF NOT FOUND THEN RAISE EXCEPTION 'group not found' USING ERRCODE='P0002'; END IF;
  ELSE
    IF p_id IS NULL THEN RAISE EXCEPTION 'group id required' USING ERRCODE='22023'; END IF;
    UPDATE public.groups SET is_active = false WHERE id = p_id RETURNING * INTO v_group;
    IF NOT FOUND THEN RAISE EXCEPTION 'group not found' USING ERRCODE='P0002'; END IF;
  END IF;
  RETURN jsonb_build_object('item',jsonb_build_object('id',v_group.id,'code',v_group.code,'name',v_group.name,'course_number',v_group.course_number,'admission_year',v_group.admission_year,'academic_program_name',v_group.academic_program_name,'is_active',v_group.is_active,'specialty_slug',v_group.specialty_slug),'action',p_action);
END;
$function$;

CREATE OR REPLACE FUNCTION public.medbiohim_admin_mutate_subject(
  p_action text, p_id uuid DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_subject public.subjects%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_user_id AND lower(r.code) = 'admin'
  ) THEN
    RAISE EXCEPTION 'administrator role required' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('create','update','delete') OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid operation' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'create' THEN
    IF length(trim(coalesce(p_payload->>'name',''))) NOT BETWEEN 1 AND 180 THEN
      RAISE EXCEPTION 'invalid subject name' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.subjects(code,name,short_name,description,course_number,semester,control_type,lecture_hours,practice_hours,self_study_hours,total_hours,credits,is_active,slug,specialty_slug,color_hex)
    VALUES (
      nullif(trim(p_payload->>'code'),''), trim(p_payload->>'name'),
      nullif(trim(p_payload->>'short_name'),''), nullif(trim(p_payload->>'description'),''),
      nullif(p_payload->>'course_number','')::smallint, nullif(p_payload->>'semester','')::smallint,
      nullif(trim(p_payload->>'control_type'),''), nullif(p_payload->>'lecture_hours','')::integer,
      nullif(p_payload->>'practice_hours','')::integer, nullif(p_payload->>'self_study_hours','')::integer,
      nullif(p_payload->>'total_hours','')::integer, nullif(p_payload->>'credits','')::numeric,
      coalesce((p_payload->>'is_active')::boolean,true), nullif(trim(p_payload->>'slug'),''),
      nullif(trim(p_payload->>'specialty_slug'),''), nullif(trim(p_payload->>'color_hex'),'')
    ) RETURNING * INTO v_subject;
  ELSIF p_action = 'update' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'subject id required' USING ERRCODE='22023'; END IF;
    UPDATE public.subjects SET
      code = CASE WHEN p_payload ? 'code' THEN nullif(trim(p_payload->>'code'),'') ELSE code END,
      name = CASE WHEN p_payload ? 'name' THEN trim(p_payload->>'name') ELSE name END,
      short_name = CASE WHEN p_payload ? 'short_name' THEN nullif(trim(p_payload->>'short_name'),'') ELSE short_name END,
      description = CASE WHEN p_payload ? 'description' THEN nullif(trim(p_payload->>'description'),'') ELSE description END,
      course_number = CASE WHEN p_payload ? 'course_number' THEN nullif(p_payload->>'course_number','')::smallint ELSE course_number END,
      semester = CASE WHEN p_payload ? 'semester' THEN nullif(p_payload->>'semester','')::smallint ELSE semester END,
      control_type = CASE WHEN p_payload ? 'control_type' THEN nullif(trim(p_payload->>'control_type'),'') ELSE control_type END,
      lecture_hours = CASE WHEN p_payload ? 'lecture_hours' THEN nullif(p_payload->>'lecture_hours','')::integer ELSE lecture_hours END,
      practice_hours = CASE WHEN p_payload ? 'practice_hours' THEN nullif(p_payload->>'practice_hours','')::integer ELSE practice_hours END,
      self_study_hours = CASE WHEN p_payload ? 'self_study_hours' THEN nullif(p_payload->>'self_study_hours','')::integer ELSE self_study_hours END,
      total_hours = CASE WHEN p_payload ? 'total_hours' THEN nullif(p_payload->>'total_hours','')::integer ELSE total_hours END,
      credits = CASE WHEN p_payload ? 'credits' THEN nullif(p_payload->>'credits','')::numeric ELSE credits END,
      is_active = CASE WHEN p_payload ? 'is_active' THEN (p_payload->>'is_active')::boolean ELSE is_active END,
      slug = CASE WHEN p_payload ? 'slug' THEN nullif(trim(p_payload->>'slug'),'') ELSE slug END,
      specialty_slug = CASE WHEN p_payload ? 'specialty_slug' THEN nullif(trim(p_payload->>'specialty_slug'),'') ELSE specialty_slug END,
      color_hex = CASE WHEN p_payload ? 'color_hex' THEN nullif(trim(p_payload->>'color_hex'),'') ELSE color_hex END
    WHERE id = p_id RETURNING * INTO v_subject;
    IF NOT FOUND THEN RAISE EXCEPTION 'subject not found' USING ERRCODE='P0002'; END IF;
  ELSE
    IF p_id IS NULL THEN RAISE EXCEPTION 'subject id required' USING ERRCODE='22023'; END IF;
    UPDATE public.subjects SET is_active = false WHERE id = p_id RETURNING * INTO v_subject;
    IF NOT FOUND THEN RAISE EXCEPTION 'subject not found' USING ERRCODE='P0002'; END IF;
  END IF;
  RETURN jsonb_build_object('item',jsonb_build_object('id',v_subject.id,'code',v_subject.code,'name',v_subject.name,'short_name',v_subject.short_name,'description',v_subject.description,'course_number',v_subject.course_number,'semester',v_subject.semester,'control_type',v_subject.control_type,'lecture_hours',v_subject.lecture_hours,'practice_hours',v_subject.practice_hours,'self_study_hours',v_subject.self_study_hours,'total_hours',v_subject.total_hours,'credits',v_subject.credits,'is_active',v_subject.is_active,'slug',v_subject.slug,'specialty_slug',v_subject.specialty_slug,'color_hex',v_subject.color_hex),'action',p_action);
END;
$function$;

REVOKE ALL ON FUNCTION public.medbiohim_admin_mutate_group(text,uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.medbiohim_admin_mutate_subject(text,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.medbiohim_admin_mutate_group(text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.medbiohim_admin_mutate_subject(text,uuid,jsonb) TO authenticated;
