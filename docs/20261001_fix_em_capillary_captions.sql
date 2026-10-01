-- Fix captions: Поперечный срез кровеносного капилляра (from exam image labels)
UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["1. Эритроцит", "2. Тромбоцит", "3. Ядро эндотелиоцита", "4. Пиноцитозные пузырьки", "5. Поры в эндотелии", "6. Базальная мембрана", "7. Адвентициальная клетка"]'::jsonb, true),
    updated_at = now()
WHERE subject_slug = 'histology'
  AND mode_set = 'electronogram'
  AND (
    id = 'feed-em-bab1517f74'
    OR preparation->>'name' = 'Поперечный срез кровеносного капилляра'
  );
