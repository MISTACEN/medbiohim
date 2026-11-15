-- Официальное пояснение кафедры к вопросу (ключ + механизм + ловушки).
-- Заполняется импортёром банка ЦНС v2 (tools/physiology/import_cns_bank_v2.mjs),
-- отображается в подготовке после проверки (publicPreparationQuestion).
alter table public.questions add column if not exists explanation text;

comment on column public.questions.explanation is 'Пояснение кафедры: почему ключ верен, почему остальные не подходят, ловушки (markdown)';
