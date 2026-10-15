-- Secure file metadata insertion for the frontend-first Cloudflare upload route.
-- The caller's JWT supplies auth.uid(); no service-role key or broad table policy is used.
CREATE OR REPLACE FUNCTION public.medbiohim_create_file_record(
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_object_key text,
  p_b2_file_id text,
  p_group_id uuid DEFAULT NULL,
  p_visibility text DEFAULT 'group',
  p_specialty_slug text DEFAULT NULL,
  p_sha256 text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_group public.groups%ROWTYPE;
  v_file public.files%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_original_name IS NULL OR length(trim(p_original_name)) = 0 OR length(p_original_name) > 180 THEN
    RAISE EXCEPTION 'invalid file name' USING ERRCODE = '22023';
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes < 1 OR p_size_bytes > 15728640 THEN
    RAISE EXCEPTION 'invalid file size' USING ERRCODE = '22023';
  END IF;
  IF p_object_key IS NULL OR length(p_object_key) > 1024 OR p_object_key !~ ('^uploads/' || v_user_id::text || '/[0-9a-f-]{36}/') THEN
    RAISE EXCEPTION 'invalid object key' USING ERRCODE = '22023';
  END IF;
  IF p_b2_file_id IS NULL OR length(trim(p_b2_file_id)) = 0 THEN
    RAISE EXCEPTION 'missing storage object id' USING ERRCODE = '22023';
  END IF;
  IF p_visibility IS DISTINCT FROM 'group' THEN
    RAISE EXCEPTION 'unsupported file visibility' USING ERRCODE = '22023';
  END IF;
  IF p_sha256 IS NOT NULL AND p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid checksum' USING ERRCODE = '22023';
  END IF;

  IF p_group_id IS NOT NULL THEN
    SELECT g.* INTO v_group
      FROM public.groups g
     WHERE g.id = p_group_id AND g.is_active = true;
    IF NOT FOUND OR NOT EXISTS (
      SELECT 1 FROM public.group_memberships gm
       WHERE gm.group_id = p_group_id AND gm.user_id = v_user_id AND gm.is_active = true
    ) THEN
      RAISE EXCEPTION 'active group membership required' USING ERRCODE = '42501';
    END IF;
    IF p_specialty_slug IS NOT NULL AND trim(p_specialty_slug) <> ''
       AND coalesce(v_group.specialty_slug, '') <> trim(p_specialty_slug) THEN
      RAISE EXCEPTION 'specialty does not match group' USING ERRCODE = '42501';
    END IF;
  ELSIF p_specialty_slug IS NOT NULL AND trim(p_specialty_slug) <> '' THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.group_memberships gm
        JOIN public.groups g ON g.id = gm.group_id
       WHERE gm.user_id = v_user_id AND gm.is_active = true
         AND g.is_active = true AND g.specialty_slug = trim(p_specialty_slug)
    ) THEN
      RAISE EXCEPTION 'active specialty membership required' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.files (
    original_name, mime_type, size_bytes, object_key, b2_file_id,
    uploaded_by, group_id, visibility, status, specialty_slug, sha256,
    storage_provider, processing_status
  ) VALUES (
    trim(p_original_name), coalesce(nullif(trim(p_mime_type), ''), 'application/octet-stream'),
    p_size_bytes, p_object_key, p_b2_file_id, v_user_id, p_group_id,
    'group', 'active', nullif(trim(p_specialty_slug), ''), p_sha256, 'b2', 'ready'
  )
  RETURNING * INTO v_file;

  RETURN jsonb_build_object(
    'id', v_file.id,
    'original_name', v_file.original_name,
    'mime_type', v_file.mime_type,
    'size_bytes', v_file.size_bytes,
    'uploaded_by', v_file.uploaded_by,
    'group_id', v_file.group_id,
    'visibility', v_file.visibility,
    'status', v_file.status,
    'specialty_slug', v_file.specialty_slug,
    'storage_provider', v_file.storage_provider,
    'processing_status', v_file.processing_status,
    'created_at', v_file.created_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.medbiohim_create_file_record(text, text, bigint, text, text, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.medbiohim_create_file_record(text, text, bigint, text, text, uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.medbiohim_create_file_record(text, text, bigint, text, text, uuid, text, text, text) TO authenticated;
