-- 2026-10-02: indexes required by legacy test-key resolution and preparation flows.
create index if not exists tests_source_key_idx on public.tests(source_key);
create index if not exists test_preparation_sessions_test_id_idx on public.test_preparation_sessions(test_id);
create index if not exists test_preparation_results_test_id_idx on public.test_preparation_results(test_id);
