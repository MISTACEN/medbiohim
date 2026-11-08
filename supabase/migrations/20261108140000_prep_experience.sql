-- Блок 8/ведомость: различать «подготовку» (проверка сразу, не считается)
-- и «полное тестирование» (solve/exam/control — главный результат преподa).
alter table public.test_preparation_sessions
  add column if not exists experience text not null default 'prepare'
  check (experience in ('prepare','solve','exam','control'));
