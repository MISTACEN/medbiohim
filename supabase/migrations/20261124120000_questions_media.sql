-- Рисунки к вопросам банка.
--
-- Сборник тестов (ДВГМУ 2016) содержит структурные формулы, которые нельзя
-- записать строкой: они вынесены на отдельные листы и нарезаны в WebP-кропы.
-- Раньше вопросы хранили только текст, поэтому в прохождении теста рисунок
-- терялся. Колонка аддитивная: старые вопросы получают пустой массив.

alter table public.questions
  add column if not exists media jsonb not null default '[]'::jsonb;

comment on column public.questions.media is
  'Рисунки к вопросу: [{"kind":"figure","url":"/content/portals/figures/...","width":N,"height":N,"label":"Вопрос 5"}]';
