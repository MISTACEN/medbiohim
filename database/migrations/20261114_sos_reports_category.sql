-- Жалоба на ошибку на сайте: категория обращения (форма в Sidebar).
-- Прежняя «тревожная кнопка» превращена в структурированную жалобу:
-- content / test / broken / typo / other (unknown → other).
alter table public.sos_reports
  add column if not exists category text not null default 'other';
