-- 2026-10-03: remove duplicate trainer feed subject index.
drop index if exists public.trainer_feed_cards_subject_idx;
