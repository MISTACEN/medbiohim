-- Publish the source-backed standalone embryology collection now that its 67
-- linked questions are published and each has five options with one correct marker.
update public.tests t
set is_published = true
where t.source_key = 'histology-test-derived-embryology'
  and exists (
    select 1 from public.test_questions tq
    where tq.test_id = t.id
    having count(*) = 67
       and count(*) filter (
         where exists (
           select 1 from public.questions q
           where q.id = tq.question_id
             and q.is_published = true
             and jsonb_typeof(q.options) = 'array'
             and jsonb_array_length(q.options) = 5
             and (select count(*) from jsonb_array_elements(q.options) o(value)
                  where coalesce((o.value->>'correct')::boolean, false)) = 1
         )
       ) = 67
  );
