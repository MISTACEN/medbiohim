alter table public.users add column if not exists semester smallint;
alter table public.users drop constraint if exists users_semester_check;
alter table public.users add constraint users_semester_check check (semester is null or (semester between 1 and 12));
