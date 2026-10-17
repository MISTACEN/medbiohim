-- Publish the source-backed closed-type histology/cytology/embryology test bank.
-- The source package contains 163 questions and an answer key. Most answers are
-- stored as zero-based option indexes; one answer was stored as matching text.
-- Normalize that one text answer to its option index, then publish only records
-- with a non-empty prompt, exactly five options, and a valid answer.
with validated as (
  select q.id,
         case
           when q.answer ~ '^[0-4]$' then q.answer
           else (
             select (o.ordinality - 1)::text
             from jsonb_array_elements_text(q.options) with ordinality as o(option_text, ordinality)
             where lower(btrim(o.option_text)) = lower(btrim(q.answer))
             limit 1
           )
         end as normalized_answer
  from public.questions q
  where q.subject_id = '977d78ca-7a58-4b0a-9e93-29d8e03f6946'::uuid
    and q.source_key like 'local:histology-cyto-embryo-mixed-2007-q%'
    and nullif(btrim(q.text), '') is not null
    and jsonb_typeof(q.options) = 'array'
    and jsonb_array_length(q.options) = 5
)
update public.questions q
set answer = v.normalized_answer,
    is_published = true
from validated v
where q.id = v.id
  and v.normalized_answer ~ '^[0-4]$';
