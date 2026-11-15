-- FSRS вместо SM-2 (roadmap фаза 14): модель состояния интервальных повторений.
-- SM-2-колонки (ease/interval/reps) остаются и продолжают обновляться для
-- совместимости (compress в study-prep пишет due_at напрямую, бот-тренажёр
-- использует общий nextReviewState), планирование теперь ведёт FSRS.
alter table public.srs_cards
  add column if not exists stability real,
  add column if not exists difficulty real,
  add column if not exists state smallint not null default 0,
  add column if not exists lapses integer not null default 0;

-- Бэкфилл существующих карточек из SM-2-состояния:
--  stability ≈ текущий интервал (дни), difficulty из ease (2.5 → 5, круче — меньше),
--  state: 2 review (есть интервал), 1 learning (были повторы без интервала), 0 new.
update public.srs_cards set
  stability = greatest(0.1, coalesce(interval, 0)::real),
  difficulty = greatest(1, least(10, 5 + (2.5 - coalesce(ease, 2.5)) * 4)),
  state = case
    when coalesce(interval, 0) > 0 then 2
    when coalesce(reps, 0) > 0 then 1
    else 0
  end
where stability is null or difficulty is null;

comment on column public.srs_cards.stability is 'FSRS: стабильность (дни до удержания 90%)';
comment on column public.srs_cards.difficulty is 'FSRS: сложность 1..10';
comment on column public.srs_cards.state is 'FSRS: 0 new / 1 learning / 2 review / 3 relearning';
comment on column public.srs_cards.lapses is 'FSRS: сколько раз карточка была забыта (оценка 1)';
