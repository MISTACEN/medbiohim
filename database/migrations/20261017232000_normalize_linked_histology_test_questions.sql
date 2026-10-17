-- Normalize all question records used by the source-backed histology closed tests.
-- Older derived records store options as plain strings and only the numeric answer
-- index; the grading RPC requires options[].correct=true for exactly one option.
with linked as (
  select distinct q.id, q.answer::integer as answer_index
  from public.tests t
  join public.test_questions tq on tq.test_id = t.id
  join public.questions q on q.id = tq.question_id
  where t.source_key in (
    'histology-test-derived-cytology',
    'histology-test-derived-embryology',
    'histology-test-derived-mixed-2007'
  )
    and q.answer ~ '^[0-4]$'
    and jsonb_typeof(q.options) = 'array'
    and jsonb_array_length(q.options) = 5
),
normalized as (
  select l.id, l.answer_index,
    (select jsonb_agg(
      jsonb_build_object(
        'label', case
          when jsonb_typeof(o.value) = 'object'
            then coalesce(o.value->>'label', o.value->>'text', o.value::text)
          else o.value #>> '{}'
        end,
        'correct', (o.ordinality - 1) = l.answer_index
      ) order by o.ordinality
    ) from jsonb_array_elements(q.options) with ordinality o(value, ordinality)) as options
  from linked l
  join public.questions q on q.id = l.id
)
update public.questions q
set options = n.options,
    is_published = true
from normalized n
where q.id = n.id;

-- Publish each of the three source-backed collections only when every linked
-- question is published and carries exactly one correct option.
update public.tests t
set is_published = true
where t.source_key in (
  'histology-test-derived-cytology',
  'histology-test-derived-embryology',
  'histology-test-derived-mixed-2007'
)
and exists (
  select 1 from public.test_questions tq where tq.test_id = t.id
)
and not exists (
  select 1
  from public.test_questions tq
  left join public.questions q on q.id = tq.question_id
  where tq.test_id = t.id
    and (
      q.id is null
      or q.is_published is not true
      or jsonb_typeof(q.options) <> 'array'
      or jsonb_array_length(q.options) <> 5
      or (select count(*) from jsonb_array_elements(q.options) o(value)
          where coalesce((o.value->>'correct')::boolean, false)) <> 1
    )
);
