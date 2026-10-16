BEGIN;

CREATE OR REPLACE FUNCTION public.medbiohim_get_student_subject_plan(
  p_subject_slug text,
  p_course_number integer DEFAULT NULL,
  p_semester integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_requested_slug text := lower(trim(coalesce(p_subject_slug, '')));
  v_subject_slug text;
  v_plan_key text;
  v_subject public.subjects%ROWTYPE;
  v_plan jsonb;
  v_has_mbh_membership boolean := false;
  v_is_admin boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_course_number IS NOT NULL AND p_course_number NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'invalid course number' USING ERRCODE = '22023';
  END IF;
  IF p_semester IS NOT NULL AND p_semester NOT BETWEEN 1 AND 16 THEN
    RAISE EXCEPTION 'invalid semester' USING ERRCODE = '22023';
  END IF;

  CASE v_requested_slug
    WHEN 'histology' THEN
      v_subject_slug := 'histology';
      v_plan_key := 'subject_plan:histology';
    WHEN 'physiology' THEN
      v_subject_slug := 'physiology';
      v_plan_key := 'subject_plan:physiology';
    WHEN 'organic_chemistry' THEN
      v_subject_slug := 'chemistry_organic_physical';
      v_plan_key := 'subject_plan:organic_chemistry';
    WHEN 'chemistry_organic_physical' THEN
      v_subject_slug := 'chemistry_organic_physical';
      v_plan_key := 'subject_plan:organic_chemistry';
    ELSE
      RAISE EXCEPTION 'unsupported subject plan' USING ERRCODE = '22023';
  END CASE;

  SELECT EXISTS (
    SELECT 1
    FROM public.group_memberships AS gm
    JOIN public.groups AS g ON g.id = gm.group_id
    WHERE gm.user_id = v_user_id
      AND gm.is_active IS TRUE
      AND g.is_active IS TRUE
      AND lower(coalesce(g.specialty_slug, '')) = 'mbh'
  ) INTO v_has_mbh_membership;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    JOIN public.roles AS r ON r.id = ur.role_id
    WHERE ur.user_id = v_user_id
      AND lower(coalesce(r.code, '')) = 'admin'
  ) INTO v_is_admin;

  IF NOT v_has_mbh_membership AND NOT v_is_admin THEN
    RAISE EXCEPTION 'active MBH membership required' USING ERRCODE = '42501';
  END IF;

  SELECT s.*
    INTO v_subject
  FROM public.subjects AS s
  WHERE s.slug = v_subject_slug
    AND s.is_active IS TRUE
    AND (p_course_number IS NULL OR s.course_number = p_course_number)
    AND (p_semester IS NULL OR s.semester = p_semester)
  ORDER BY s.course_number ASC NULLS LAST, s.semester ASC NULLS LAST, s.name ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('plan', NULL, 'subject', NULL, 'source', 'none');
  END IF;

  SELECT sc.payload
    INTO v_plan
  FROM public.site_content AS sc
  WHERE sc.key = v_plan_key
  LIMIT 1;

  RETURN jsonb_build_object(
    'plan', v_plan,
    'subject', jsonb_build_object(
      'id', v_subject.id,
      'slug', v_subject.slug,
      'name', v_subject.name,
      'description', v_subject.description,
      'specialty_slug', v_subject.specialty_slug,
      'course_number', v_subject.course_number,
      'semester', v_subject.semester,
      'control_type', v_subject.control_type,
      'lecture_hours', v_subject.lecture_hours,
      'practice_hours', v_subject.practice_hours,
      'self_study_hours', v_subject.self_study_hours,
      'total_hours', v_subject.total_hours,
      'credits', v_subject.credits
    ),
    'source', CASE WHEN v_plan IS NULL THEN 'none' ELSE 'site_content' END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.medbiohim_get_student_subject_plan(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.medbiohim_get_student_subject_plan(text, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.medbiohim_get_student_subject_plan(text, integer, integer)
IS 'Returns only the allow-listed MBH subject plan for an authenticated active MBH member or administrator. Keeps site_content RLS intact and exposes no arbitrary CMS keys.';

COMMIT;