-- RLS performance hardening: replace per-row auth.uid() evaluation with (select auth.uid()).
-- Applied to Supabase project gnobvyjywtqbdfeejxmf.

ALTER POLICY comments_delete ON public.comments USING (author_id = (SELECT auth.uid()));
ALTER POLICY comments_insert_self ON public.comments WITH CHECK ((author_id = (SELECT auth.uid())) AND (EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = comments.post_id AND (p.group_id IS NULL OR is_group_member(p.group_id)))));
ALTER POLICY comments_read_allowed ON public.comments USING (EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = comments.post_id AND (p.group_id IS NULL OR EXISTS (SELECT 1 FROM public.group_memberships gm WHERE gm.group_id = p.group_id AND gm.user_id = (SELECT auth.uid())))));
ALTER POLICY comments_update ON public.comments USING (author_id = (SELECT auth.uid())) WITH CHECK (author_id = (SELECT auth.uid()));
ALTER POLICY community_delete ON public.community_posts USING (author_id = (SELECT auth.uid()));
ALTER POLICY community_update ON public.community_posts USING (author_id = (SELECT auth.uid())) WITH CHECK (author_id = (SELECT auth.uid()));
ALTER POLICY posts_insert_self ON public.community_posts WITH CHECK ((author_id = (SELECT auth.uid())) AND ((group_id IS NULL) OR is_group_member(group_id)));
ALTER POLICY posts_read_allowed ON public.community_posts USING ((group_id IS NULL) OR EXISTS (SELECT 1 FROM public.group_memberships gm WHERE gm.group_id = community_posts.group_id AND gm.user_id = (SELECT auth.uid())));
ALTER POLICY favorites_own ON public.favorites USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
ALTER POLICY files_delete ON public.files USING (uploaded_by = (SELECT auth.uid()));
ALTER POLICY files_insert ON public.files WITH CHECK (uploaded_by = (SELECT auth.uid()));
ALTER POLICY files_read_allowed ON public.files USING ((uploaded_by = (SELECT auth.uid())) OR (group_id IS NULL) OR EXISTS (SELECT 1 FROM public.group_memberships gm WHERE gm.group_id = files.group_id AND gm.user_id = (SELECT auth.uid())));
ALTER POLICY files_update_own ON public.files USING (uploaded_by = (SELECT auth.uid())) WITH CHECK (uploaded_by = (SELECT auth.uid()));
ALTER POLICY homework_progress_own ON public.homework_progress USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
ALTER POLICY homework_read_group ON public.homeworks USING (EXISTS (SELECT 1 FROM public.group_memberships gm WHERE gm.group_id = homeworks.group_id AND gm.user_id = (SELECT auth.uid())));
ALTER POLICY notes_own ON public.notes USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
ALTER POLICY test_answers_own ON public.test_answers USING (EXISTS (SELECT 1 FROM public.test_attempts a WHERE a.id = test_answers.attempt_id AND a.user_id = (SELECT auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.test_attempts a WHERE a.id = test_answers.attempt_id AND a.user_id = (SELECT auth.uid())));
ALTER POLICY attempts_owner ON public.test_attempts USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
ALTER POLICY question_states_own ON public.user_question_states USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
ALTER POLICY subject_progress_own ON public.user_subject_progress USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
ALTER POLICY topic_progress_own ON public.user_topic_progress USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
ALTER POLICY users_select_self ON public.users USING (id = (SELECT auth.uid()));
ALTER POLICY users_update_self ON public.users USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
