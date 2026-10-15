-- MEDBIOHIM: allow secure user-owned homework attachment links through the Cloudflare Worker.
-- The RPC is SECURITY INVOKER: caller privileges and every table's RLS remain in force.
-- Homework row + all attachments are committed atomically (or not at all).

DROP POLICY IF EXISTS homework_attachments_read_group ON public.homework_attachments;
CREATE POLICY homework_attachments_read_group ON public.homework_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.homeworks h
      WHERE h.id = homework_attachments.homework_id
        AND (
          (h.group_id IS NULL AND h.created_by = (SELECT auth.uid()))
          OR (
            h.group_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.group_memberships gm
              WHERE gm.group_id = h.group_id
                AND gm.user_id = (SELECT auth.uid())
                AND gm.is_active IS TRUE
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS homework_attachments_insert_member ON public.homework_attachments;
CREATE POLICY homework_attachments_insert_member ON public.homework_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.homeworks h
      WHERE h.id = homework_attachments.homework_id
        AND (
          (h.group_id IS NULL AND h.created_by = (SELECT auth.uid()))
          OR (
            h.group_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.group_memberships gm
              WHERE gm.group_id = h.group_id
                AND gm.user_id = (SELECT auth.uid())
                AND gm.is_active IS TRUE
            )
          )
        )
    )
    AND EXISTS (
      SELECT 1
      FROM public.files f
      WHERE f.id = homework_attachments.file_id
        AND f.status = 'active'
        AND f.uploaded_by = (SELECT auth.uid())
        AND (
          f.group_id IS NULL
          OR f.group_id = (
            SELECT h.group_id
            FROM public.homeworks h
            WHERE h.id = homework_attachments.homework_id
          )
        )
    )
  );

GRANT SELECT, INSERT ON public.homework_attachments TO authenticated;

CREATE OR REPLACE FUNCTION public.create_homework_with_attachments(
  p_homework jsonb,
  p_attachment_file_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_title text;
  v_group_id uuid;
  v_subject_id uuid;
  v_schedule_entry_id uuid;
  v_due_date date;
  v_due_at timestamptz;
  v_created_by_role text;
  v_homework public.homeworks;
  v_file record;
  v_requested_count integer := COALESCE(cardinality(p_attachment_file_ids), 0);
  v_found_count integer := 0;
  v_sort_order integer := 0;
  v_attachments jsonb := '[]'::jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  IF p_homework IS NULL OR jsonb_typeof(p_homework) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Homework object is required';
  END IF;

  v_title := btrim(COALESCE(p_homework ->> 'title', ''));
  IF v_title = '' OR length(v_title) > 240 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid homework title';
  END IF;
  IF length(COALESCE(p_homework ->> 'description', '')) > 20000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Homework description is too long';
  END IF;
  IF v_requested_count > 12 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'At most 12 attachments are allowed';
  END IF;
  IF v_requested_count > 0 AND (
    SELECT count(*) <> count(DISTINCT file_id)
    FROM unnest(p_attachment_file_ids) AS requested(file_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Duplicate attachment ids are not allowed';
  END IF;

  v_group_id := NULLIF(btrim(COALESCE(p_homework ->> 'group_id', '')), '')::uuid;
  v_subject_id := NULLIF(btrim(COALESCE(p_homework ->> 'subject_id', '')), '')::uuid;
  v_schedule_entry_id := NULLIF(btrim(COALESCE(p_homework ->> 'schedule_entry_id', '')), '')::uuid;
  v_due_date := NULLIF(btrim(COALESCE(p_homework ->> 'due_date', '')), '')::date;
  v_due_at := NULLIF(btrim(COALESCE(p_homework ->> 'due_at', '')), '')::timestamptz;

  IF v_group_id IS NULL AND v_schedule_entry_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Personal homework cannot reference a shared lesson';
  END IF;

  IF v_schedule_entry_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.schedule_entries se
    JOIN public.schedules s ON s.id = se.schedule_id
    WHERE se.id = v_schedule_entry_id
      AND s.group_id = v_group_id
      AND s.is_active IS TRUE
      AND (v_subject_id IS NULL OR se.subject_id IS NULL OR se.subject_id = v_subject_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid lesson context';
  END IF;

  IF v_requested_count > 0 THEN
    SELECT count(*) INTO v_found_count
    FROM public.files f
    WHERE f.id = ANY(p_attachment_file_ids)
      AND f.status = 'active'
      AND f.uploaded_by = (SELECT auth.uid())
      AND (f.group_id IS NULL OR f.group_id = v_group_id);

    IF v_found_count <> v_requested_count THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'One or more files are unavailable for this homework';
    END IF;
  END IF;

  v_created_by_role := CASE
    WHEN v_group_id IS NULL THEN 'student'
    WHEN EXISTS (
      SELECT 1
      FROM public.group_memberships gm
      WHERE gm.group_id = v_group_id
        AND gm.user_id = (SELECT auth.uid())
        AND gm.is_active IS TRUE
        AND lower(COALESCE(gm.role_in_group, '')) = 'starosta'
    ) THEN 'starosta'
    ELSE 'student'
  END;

  INSERT INTO public.homeworks (
    title, description, subject_id, group_id, schedule_entry_id,
    due_date, due_at, created_by, created_by_role
  )
  VALUES (
    v_title,
    NULLIF(p_homework ->> 'description', ''),
    v_subject_id,
    v_group_id,
    v_schedule_entry_id,
    v_due_date,
    v_due_at,
    (SELECT auth.uid()),
    v_created_by_role
  )
  RETURNING * INTO v_homework;

  FOR v_file IN
    SELECT f.id, f.mime_type
    FROM public.files f
    WHERE f.id = ANY(COALESCE(p_attachment_file_ids, ARRAY[]::uuid[]))
    ORDER BY array_position(p_attachment_file_ids, f.id)
  LOOP
    INSERT INTO public.homework_attachments (
      homework_id, file_id, attachment_type, sort_order, inline_view
    )
    VALUES (
      v_homework.id,
      v_file.id,
      CASE WHEN lower(COALESCE(v_file.mime_type, '')) LIKE 'image/%' THEN 'image' ELSE 'file' END,
      v_sort_order,
      true
    );
    v_sort_order := v_sort_order + 1;
  END LOOP;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'file_id', ha.file_id,
        'attachment_type', ha.attachment_type,
        'caption', ha.caption,
        'sort_order', ha.sort_order,
        'inline_view', ha.inline_view
      ) ORDER BY ha.sort_order, ha.created_at
    ),
    '[]'::jsonb
  )
  INTO v_attachments
  FROM public.homework_attachments ha
  WHERE ha.homework_id = v_homework.id;

  RETURN jsonb_build_object('homework', to_jsonb(v_homework), 'attachments', v_attachments);
END;
$$;

REVOKE ALL ON FUNCTION public.create_homework_with_attachments(jsonb, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_homework_with_attachments(jsonb, uuid[]) TO authenticated;
