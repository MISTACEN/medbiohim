-- Launch integrity cleanup: remove one duplicate schedule index and
-- avoid per-row auth.uid() evaluation in the optional media-variant policy.

DROP INDEX IF EXISTS public.schedule_entries_session_id_idx;

DO $$
BEGIN
    IF to_regclass('public.file_variants') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS file_variants_read_allowed ON public.file_variants';
        EXECUTE $policy$
            CREATE POLICY file_variants_read_allowed
            ON public.file_variants
            FOR SELECT
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1
                    FROM public.files f
                    WHERE f.id = file_variants.parent_file_id
                      AND f.status = 'active'
                      AND (
                          f.uploaded_by = (SELECT auth.uid())
                          OR f.visibility = 'public'
                          OR (
                              f.group_id IS NOT NULL
                              AND EXISTS (
                                  SELECT 1
                                  FROM public.group_memberships gm
                                  WHERE gm.group_id = f.group_id
                                    AND gm.user_id = (SELECT auth.uid())
                                    AND gm.is_active = true
                              )
                          )
                      )
                )
            )
        $policy$;
    END IF;
END
$$;
