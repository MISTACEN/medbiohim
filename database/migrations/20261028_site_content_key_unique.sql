-- 2026-10-28 · Защита site_content от дубликатов ключей (D35)
-- Миграция 20261008_histology_lecture_05_blood.sql вставляет key='lectures'
-- беззащитным insert без проверки существования. Повторное применение даёт
-- вторую строку с тем же ключом, а .maybeSingle() в воркере тогда падает
-- PGRST116 → 503 на GET /admin/lectures. Код воркера уже читает
-- детерминированно (order by updated_at limit 1); индекс исключает рецидив.

-- Уникальность ключа
create unique index if not exists site_content_key_uidx
on public.site_content (key);
