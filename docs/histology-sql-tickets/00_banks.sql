-- Histology ticket_banks only (bootstrap)
BEGIN;

INSERT INTO public.ticket_banks (id, subject_name, subject_slug, title, mode, created_at, updated_at)
VALUES ('bank-histology-lech-ped', 'Гистология, цитология', 'histology', 'Билеты — Гистология (леч./пед.)', 'exam', now(), now())
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, subject_slug = 'histology', updated_at = now();

INSERT INTO public.ticket_banks (id, subject_name, subject_slug, title, mode, created_at, updated_at)
VALUES ('bank-histology-stom', 'Гистология, цитология', 'histology', 'Билеты — Гистология (стом.)', 'exam', now(), now())
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, subject_slug = 'histology', updated_at = now();

INSERT INTO public.ticket_banks (id, subject_name, subject_slug, title, mode, created_at, updated_at)
VALUES ('bank-histology-cases', 'Гистология, цитология', 'histology', 'Ситуационные задачи — Гистология', 'exam', now(), now())
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, subject_slug = 'histology', updated_at = now();

INSERT INTO public.ticket_banks (id, subject_name, subject_slug, title, mode, created_at, updated_at)
VALUES ('bank-histology-preparations', 'Гистология, цитология', 'histology', 'Экзаменационные препараты — Гистология', 'exam', now(), now())
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, subject_slug = 'histology', updated_at = now();

INSERT INTO public.ticket_banks (id, subject_name, subject_slug, title, mode, created_at, updated_at)
VALUES ('bank-histology-all', 'Гистология, цитология', 'histology', 'Билеты — Гистология (полный банк)', 'exam', now(), now())
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, subject_slug = 'histology', updated_at = now();

SELECT id, title FROM public.ticket_banks WHERE subject_slug = 'histology';
COMMIT;
