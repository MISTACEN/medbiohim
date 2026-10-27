-- Приводит исторические закрытые вопросы к единому виду options[].correct.
--
-- В банках одновременно встречаются:
--   * options: ["текст", …], answer: "2"            — 0-based индекс (legacy_ticks,
--     histology-mbh, local-химия, часть legacy_qbs);
--   * options: ["1) …", …], answer: "3"             — номер варианта (1-based);
--   * options: ["…"], answer: "Верный ответ: 2) …"  — читаемый эталон физиологии;
--   * options: ["…"], answer: "ньютон"              — текст варианта;
--   * options: [{label, correct}]                   — уже нормализовано.
--
-- Функция повторяет порядок разрешения из
-- integrations/cloudflare-api/src/question-format.js. Миграция заполняет
-- только те вопросы, где ответ удалось сопоставить однозначно; спорные
-- остаются без флагов и проверяются вручную (runtime не считает их ошибкой).

create or replace function public.medbiohim_norm_option_text(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $function$
  select btrim(
    regexp_replace(
      regexp_replace(
        translate(lower(coalesce(p_value, '')), 'ё—–−', 'е---'),
        '<[^>]*>', ' ', 'g'
      ),
      '[^a-zа-я0-9]+', ' ', 'g'
    )
  );
$function$;

revoke all on function public.medbiohim_norm_option_text(text) from public, anon, authenticated;

create or replace function public.medbiohim_option_raw_label(p_option jsonb)
returns text
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $function$
  select case
    when jsonb_typeof(p_option) = 'object'
      then coalesce(p_option ->> 'label', p_option ->> 'text', p_option ->> 'title', p_option ->> 'value', p_option::text)
    else p_option #>> '{}'
  end;
$function$;

revoke all on function public.medbiohim_option_raw_label(jsonb) from public, anon, authenticated;

create or replace function public.medbiohim_resolve_closed_indexes(p_answer text, p_options jsonb)
returns integer[]
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_len integer := coalesce(jsonb_array_length(p_options), 0);
  v_answer text := btrim(coalesce(p_answer, ''));
  v_clean text;
  v_norm text;
  v_out integer[] := array[]::integer[];
  v_idx integer;
  v_n integer;
  v_total integer;
  v_matched integer;
  v_pair record;
  v_opt record;
begin
  if v_len < 2 or v_answer = '' then
    return array[]::integer[];
  end if;

  -- Уже проставленные флаги важнее любого текстового разбора.
  for i in 0 .. v_len - 1 loop
    if coalesce((p_options -> i ->> 'correct')::boolean, false) then
      v_out := array_append(v_out, i);
    end if;
  end loop;
  if cardinality(v_out) > 0 then
    return v_out;
  end if;

  v_clean := btrim(regexp_replace(
    v_answer,
    '^[[:space:]]*(верный|правильный|эталонный|correct|reference)[[:space:]]*ответ[[:space:]]*[:\-–][[:space:]]*',
    '',
    'i'
  ));
  v_norm := public.medbiohim_norm_option_text(v_clean);

  -- 1. Читаемый эталон: «Верный ответ: 2) текст».
  v_total := 0;
  v_matched := 0;
  v_out := array[]::integer[];
  for v_pair in
    select m.arr[1] as num, m.arr[2] as txt
    from regexp_matches(v_clean, '([0-9]{1,2})\)[[:space:]]*([^;]+)', 'g') as m(arr)
  loop
    v_total := v_total + 1;
    v_idx := null;
    for i in 0 .. v_len - 1 loop
      if public.medbiohim_norm_option_text(public.medbiohim_option_raw_label(p_options -> i))
         = public.medbiohim_norm_option_text(v_pair.txt) then
        v_idx := i;
        exit;
      end if;
    end loop;
    if v_idx is not null then
      v_out := array_append(v_out, v_idx);
      v_matched := v_matched + 1;
    end if;
  end loop;
  if v_total > 0 and v_matched = v_total then
    return (select array_agg(distinct x) from unnest(v_out) as x);
  end if;

  -- 2. Весь эталон совпадает с текстом варианта: «ньютон», «0», «5».
  v_out := array[]::integer[];
  for i in 0 .. v_len - 1 loop
    if public.medbiohim_norm_option_text(public.medbiohim_option_raw_label(p_options -> i)) = v_norm then
      v_out := array_append(v_out, i);
    end if;
  end loop;
  if cardinality(v_out) = 1 then
    return v_out;
  end if;

  -- 3. Буквенный эталон: «В», «Б».
  if v_clean ~* '^[А-ЯЁA-Z]$' then
    v_idx := case upper(v_clean)
      when 'А' then 0 when 'Б' then 1 when 'В' then 2 when 'Г' then 3 when 'Д' then 4
      when 'Е' then 5 when 'Ё' then 5 when 'Ж' then 6 when 'З' then 7 when 'И' then 8
      when 'К' then 9 when 'Л' then 10 when 'М' then 11 when 'Н' then 12 when 'О' then 13
      when 'П' then 14 when 'Р' then 15 when 'С' then 16 when 'Т' then 17 when 'У' then 18
      when 'Ф' then 19 when 'Х' then 20 when 'Ц' then 21 when 'Ч' then 22 when 'Ш' then 23
      when 'Щ' then 24 when 'Э' then 25 when 'Ю' then 26 when 'Я' then 27
      when 'A' then 0 when 'B' then 1 when 'C' then 2 when 'D' then 3 when 'E' then 4
      when 'F' then 5 when 'G' then 6 when 'H' then 7 when 'I' then 8 when 'J' then 9
      when 'K' then 10 when 'L' then 11 when 'M' then 12 when 'N' then 13 when 'O' then 14
      when 'P' then 15 when 'Q' then 16 when 'R' then 17 when 'S' then 18 when 'T' then 19
      when 'U' then 20 when 'V' then 21 when 'W' then 22 when 'X' then 23 when 'Y' then 24
      when 'Z' then 25
      else -1
    end;
    if v_idx >= 0 and v_idx < v_len then
      return array[v_idx];
    end if;
    return array[]::integer[];
  end if;

  -- 4. Читаемый эталон без совпадения текста: номер 1-based.
  if v_clean ~ '^[0-9]{1,2}\)' then
    v_n := substring(v_clean from '^([0-9]{1,2})\)')::integer;
    if v_n >= 1 and v_n <= v_len then
      return array[v_n - 1];
    end if;
  end if;

  -- 5. Числовой эталон: сначала номер варианта «5) …», затем 0-based.
  if v_clean ~ '^[0-9]{1,2}$' then
    v_n := v_clean::integer;
    for i in 0 .. v_len - 1 loop
      if public.medbiohim_option_raw_label(p_options -> i) ~ ('^[[:space:]]*\(?' || v_n || '[).:][[:space:]]*') then
        return array[i];
      end if;
    end loop;
    if v_n >= 0 and v_n < v_len then
      return array[v_n];
    end if;
    if v_n = v_len then
      return array[v_n - 1];
    end if;
    return array[]::integer[];
  end if;

  -- 6. Несколько чисел через запятую/точку с запятой: «1,3».
  if v_clean ~ '^[0-9]{1,2}([[:space:]]*[,;][[:space:]]*[0-9]{1,2})+$' then
    v_out := array[]::integer[];
    for v_pair in
      select m.arr[1] as num from regexp_matches(v_clean, '([0-9]{1,2})', 'g') as m(arr)
    loop
      v_n := v_pair.num::integer;
      v_idx := null;
      for i in 0 .. v_len - 1 loop
        if public.medbiohim_option_raw_label(p_options -> i) ~ ('^[[:space:]]*\(?' || v_n || '[).:][[:space:]]*') then
          v_idx := i;
          exit;
        end if;
      end loop;
      if v_idx is null and v_n >= 0 and v_n < v_len then
        v_idx := v_n;
      end if;
      if v_idx is null and v_n = v_len then
        v_idx := v_n - 1;
      end if;
      if v_idx is not null then
        v_out := array_append(v_out, v_idx);
      end if;
    end loop;
    if cardinality(v_out) > 0 then
      return (select array_agg(distinct x) from unnest(v_out) as x);
    end if;
  end if;

  -- Вопрос на последовательность («123», «132») намеренно не превращаем
  -- в набор правильных вариантов: порядок проверяется в runtime.
  return array[]::integer[];
end;
$function$;

revoke all on function public.medbiohim_resolve_closed_indexes(text, jsonb) from public, anon, authenticated;

with candidates as (
  select
    q.id,
    q.options,
    public.medbiohim_resolve_closed_indexes(q.answer, q.options) as idxs
  from public.questions q
  where q.archived_at is null
    and q.type::text in (
      'mcq', 'mc', 'multiple', 'multi', 'multi_choice', 'multi-choice',
      'single', 'single_choice', 'single-choice', 'closed', 'choice', 'test', 'quiz'
    )
    and jsonb_typeof(q.options) = 'array'
    and jsonb_array_length(q.options) >= 2
    and (
      select count(*)
      from jsonb_array_elements(q.options) as o(value)
      where btrim(public.medbiohim_option_raw_label(o.value)) <> ''
    ) >= 2
    and nullif(btrim(q.answer), '') is not null
    and not exists (
      select 1
      from jsonb_array_elements(q.options) as o(value)
      where coalesce((o.value ->> 'correct')::boolean, false)
    )
),
updatable as (
  select * from candidates where cardinality(idxs) > 0
)
update public.questions q
set options = (
  select jsonb_agg(
    jsonb_build_object(
      'label', public.medbiohim_option_raw_label(o.value),
      'correct', (o.ordinality - 1) = any(u.idxs)
    ) || case
      when jsonb_typeof(o.value) = 'object' and o.value ? 'id'
        then jsonb_build_object('id', o.value -> 'id')
      else '{}'::jsonb
    end
    order by o.ordinality
  )
  from jsonb_array_elements(u.options) with ordinality as o(value, ordinality)
)
from updatable u
where q.id = u.id;

-- Контроль: у каждого обновлённого вопроса должен быть хотя бы один флаг.
do $check$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from public.questions q
  where q.archived_at is null
    and jsonb_typeof(q.options) = 'array'
    and jsonb_array_length(q.options) >= 2
    and (
      select count(*)
      from jsonb_array_elements(q.options) as o(value)
      where btrim(public.medbiohim_option_raw_label(o.value)) <> ''
    ) >= 2
    and nullif(btrim(q.answer), '') is not null
    and public.medbiohim_resolve_closed_indexes(q.answer, q.options) <> array[]::integer[]
    and not exists (
      select 1
      from jsonb_array_elements(q.options) as o(value)
      where coalesce((o.value ->> 'correct')::boolean, false)
    );
  if v_bad > 0 then
    raise exception 'normalize_closed_question_options: % questions left without correct option', v_bad;
  end if;
end;
$check$;
