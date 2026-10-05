-- Histology source reconciliation: attach the complete source-backed trainer set
-- to the canonical active histology subject and add the 28th EM material source.
-- Source verified against the user-provided Гистология.zip (2026-10-05).

BEGIN;

UPDATE public.trainer_feed_cards c
SET subject_id = s.id
FROM public.subjects s
WHERE c.subject_slug = 'histology'
  AND s.slug = 'histology'
  AND s.is_active = true
  AND c.subject_id IS DISTINCT FROM s.id;

INSERT INTO public.materials
  (id, subject_id, module_id, topic_id, type, title, file_id, external_url,
   content_html, order_index, is_published, source_key)
SELECT
  gen_random_uuid(),
  s.id,
  NULL,
  NULL,
  'other',
  'Поперечный срез кровеносного капилляра',
  NULL,
  NULL,
  '<p>Исходный материал МБХ.</p><p>Файл: Гистология/1_Экзаменационные электронограммы_РАСПЕЧАТАТЬ ВСЕ!/Поперечный срез кровеносного капилляра.docx</p><p>Оригинальный формат: DOCX.</p>',
  28,
  true,
  'histology-em-5f10d7076c5dd5'
FROM public.subjects s
WHERE s.slug = 'histology'
  AND s.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.materials m
    WHERE m.source_key = 'histology-em-5f10d7076c5dd5'
  );

COMMIT;
