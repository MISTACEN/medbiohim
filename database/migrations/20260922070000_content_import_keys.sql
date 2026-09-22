-- Stable source-key import support.
create index if not exists tests_subject_module_topic_idx on public.tests(subject_id,module_id,topic_id);
create index if not exists questions_subject_module_topic_idx on public.questions(subject_id,module_id,topic_id);
