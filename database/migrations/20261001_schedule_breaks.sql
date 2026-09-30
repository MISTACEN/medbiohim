-- MEDBIOHIM: explicit breaks inside merged timetable blocks
-- Effective from 2026-10-01 schedule data.
alter table public.schedule_entries
  add column if not exists breaks jsonb not null default '[]'::jsonb;

create index if not exists idx_schedule_entries_breaks
  on public.schedule_entries using gin (breaks);

update public.schedule_entries
set breaks = case
  when start_time::time = '08:30' and end_time::time = '14:30'
       and subject_name = 'Физиология' then '["10:10–12:50"]'::jsonb
  when start_time::time = '10:40' and end_time::time = '15:20'
       and subject_name = 'Гистология, цитология' then '["12:20–13:40"]'::jsonb
  when start_time::time = '10:40' and end_time::time = '14:30'
       and subject_name in ('Органическая и физическая химия','Теория вероятности и математическая статистика','Оптика, атомная физика')
    then '["12:20–12:50"]'::jsonb
  when start_time::time = '08:30' and end_time::time = '12:20'
       and subject_name = 'Информационные технологии в здравоохранении'
    then '["10:10–10:40"]'::jsonb
  else '[]'::jsonb
end
where schedule_id = '4cc2d535-4da4-43fa-93f7-bcb3cff471d4';
