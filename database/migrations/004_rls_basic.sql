-- Basic RLS

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_read_own ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY users_update_own ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY subjects_read_all ON public.subjects FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY groups_read_all ON public.groups FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY tests_read_published ON public.tests FOR SELECT TO authenticated USING (is_published = true);
CREATE POLICY attempts_own ON public.test_attempts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY submissions_own ON public.homework_submissions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY files_own_read ON public.files FOR SELECT TO authenticated USING (uploaded_by = auth.uid() OR visibility = 'public');
