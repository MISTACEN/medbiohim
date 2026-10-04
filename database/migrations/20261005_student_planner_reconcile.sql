ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS created_by_role text NOT NULL DEFAULT 'staff';
UPDATE public.homeworks SET due_date=(due_at AT TIME ZONE 'Asia/Vladivostok')::date WHERE due_date IS NULL AND due_at IS NOT NULL;
UPDATE public.homeworks h SET created_by_role=CASE WHEN h.created_by IS NULL THEN 'staff' WHEN EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=h.created_by AND r.code IN ('admin','moderator','teacher')) THEN 'staff' ELSE 'student' END;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS color_hex text;
CREATE TABLE IF NOT EXISTS public.attendance_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 schedule_entry_id uuid NOT NULL REFERENCES public.schedule_entries(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN ('present','excused','sick','unexcused')),
 note text,
 marked_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(schedule_entry_id,user_id)
);
CREATE INDEX IF NOT EXISTS attendance_records_user_idx ON public.attendance_records(user_id);
CREATE INDEX IF NOT EXISTS attendance_records_entry_idx ON public.attendance_records(schedule_entry_id);
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attendance_records_select_own ON public.attendance_records;
DROP POLICY IF EXISTS attendance_records_insert_own ON public.attendance_records;
DROP POLICY IF EXISTS attendance_records_update_own ON public.attendance_records;
DROP POLICY IF EXISTS attendance_records_delete_own ON public.attendance_records;
CREATE POLICY attendance_records_select_own ON public.attendance_records FOR SELECT TO authenticated USING ((select auth.uid())=user_id);
CREATE POLICY attendance_records_insert_own ON public.attendance_records FOR INSERT TO authenticated WITH CHECK ((select auth.uid())=user_id);
CREATE POLICY attendance_records_update_own ON public.attendance_records FOR UPDATE TO authenticated USING ((select auth.uid())=user_id) WITH CHECK ((select auth.uid())=user_id);
CREATE POLICY attendance_records_delete_own ON public.attendance_records FOR DELETE TO authenticated USING ((select auth.uid())=user_id);
DROP TRIGGER IF EXISTS trg_attendance_records_updated_at ON public.attendance_records;
CREATE TRIGGER trg_attendance_records_updated_at BEFORE UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();