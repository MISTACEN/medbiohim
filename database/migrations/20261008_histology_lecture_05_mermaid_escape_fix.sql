-- MEDBIOHIM Histology Lecture 05 Mermaid escaping repair
-- Date: 2026-10-08
-- Scope: histology lecture 05 only.
-- Repairs content-import escaping so Mermaid fences are stored as real Markdown fences.

update public.site_content s
set payload = jsonb_set(
  s.payload,
  '{items}',
  (
    select jsonb_agg(
      case
        when x->>'id' = 'lec-histology-blood-20261008' then
          jsonb_set(
            x,
            '{body_md}',
            to_jsonb(
              replace(
                replace(x->>'body_md', chr(92) || chr(96), chr(96)),
                chr(92) || chr(34),
                chr(34)
              )
            )
          )
        else x
      end
    )
    from jsonb_array_elements(s.payload->'items') x
  )
),
updated_at = now()
where s.key = 'lectures'
  and exists (
    select 1
    from jsonb_array_elements(s.payload->'items') x
    where x->>'id' = 'lec-histology-blood-20261008'
  );

-- Verification: escaped Mermaid fence/quote characters should be absent.
select
  x->>'id' as lecture_id,
  (length(x->>'body_md') - length(replace(x->>'body_md', chr(92)||chr(96), ''))) as escaped_backticks,
  (length(x->>'body_md') - length(replace(x->>'body_md', chr(92)||chr(34), ''))) as escaped_quotes
from public.site_content s,
     jsonb_array_elements(s.payload->'items') x
where s.key='lectures'
  and x->>'id'='lec-histology-blood-20261008';
