-- Repair published test links after histology question deduplication.
-- Only unambiguous canonical mappings are relinked. Malformed/unresolved records remain
-- linked for manual content review instead of being silently rewritten.

with map as (
  select distinct on (tq.test_id, tq.question_id)
    tq.test_id, tq.question_id as old_id, a.id as new_id
  from public.test_questions tq
  join public.questions b on b.id=tq.question_id
  join public.questions a
    on a.is_published=true and a.archived_at is null
   and lower(trim(a.text))=lower(trim(b.text))
   and a.options::text=b.options::text
   and a.answer ~ '^[0-9]+$'
   and lower(trim((a.options ->> (a.answer::int))))=lower(trim(b.answer))
  where tq.test_id='46a83064-868f-5962-8e23-ea936318baaf'
    and (b.is_published=false or b.archived_at is not null)
)
update public.test_questions tq set question_id=map.new_id
from map where tq.test_id=map.test_id and tq.question_id=map.old_id;

with map as (
  select distinct on (tq.test_id, tq.question_id)
    tq.test_id, tq.question_id as old_id, a.id as new_id
  from public.test_questions tq
  join public.questions b on b.id=tq.question_id
  join public.questions a
    on a.is_published=true and a.archived_at is null
   and lower(trim(a.text))=lower(trim(b.text))
   and a.options::text=b.options::text
   and a.answer ~ '^[0-9]+$'
   and lower(trim((a.options ->> (a.answer::int))))=lower(trim(b.answer))
  where tq.test_id='ac224d19-9392-59d2-b442-d915a6ceedd3'
    and (b.is_published=false or b.archived_at is not null)
)
update public.test_questions tq set question_id=map.new_id
from map where tq.test_id=map.test_id and tq.question_id=map.old_id;

with map as (
  select distinct on (tq.test_id, tq.question_id)
    tq.test_id, tq.question_id as old_id, a.id as new_id
  from public.test_questions tq
  join public.questions b on b.id=tq.question_id
  join public.questions a
    on a.is_published=true and a.archived_at is null
   and lower(trim(a.text))=lower(trim(b.text))
   and lower(trim(coalesce(a.answer,'')))=lower(trim(coalesce(b.answer,'')))
  where tq.test_id='5d35202b-719a-523a-b280-ef4672a13506'
    and (b.is_published=false or b.archived_at is not null)
    and not exists (
      select 1 from public.test_questions existing
      where existing.test_id=tq.test_id and existing.question_id=a.id
    )
)
update public.test_questions tq set question_id=map.new_id
from map where tq.test_id=map.test_id and tq.question_id=map.old_id;
