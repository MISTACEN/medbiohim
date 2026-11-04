-- Search only needs published-card metadata; never expose the answer-key JSON to search clients.
-- RLS remains enabled and the existing authenticated SELECT policy restricts rows to published cards.
GRANT SELECT (id, subject_slug, preparation, mode_set, tags, is_published)
ON TABLE public.trainer_feed_cards
TO authenticated;
