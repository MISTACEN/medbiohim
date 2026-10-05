-- Histology 3rd-semester audit: remove source-less/legacy-looking test metadata.
-- Source of truth: supplied Гистология.zip, not a destructive content rewrite.
INSERT INTO public.content_sources (id,title,source_path,mime_type,original_format,source_archive,note)
VALUES
 ('histology-test-derived-cytology','Тесты по цитологии — источник из Гистология.zip','3_Сборники тестовых заданий/Сборник тестовых заданий по цитологии и эмбриологии.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Производный набор теста; источник — предоставленный сборник 2007'),
 ('histology-test-derived-embryology','Тесты по эмбриологии — источник из Гистология.zip','3_Сборники тестовых заданий/Сборник тестовых заданий по цитологии и эмбриологии.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Производный набор теста; источник — предоставленный сборник 2007'),
 ('histology-test-derived-mixed-2007','Цитология и эмбриология — смешанный набор из Гистология.zip','3_Сборники тестовых заданий/Сборник тестовых заданий по цитологии и эмбриологии.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Производный смешанный набор; источник — предоставленный сборник 2007')
ON CONFLICT (id) DO NOTHING;

UPDATE public.tests SET source_key='histology-test-derived-cytology'
WHERE id='46a83064-868f-5962-8e23-ea936318baaf' AND subject_id='977d78ca-7a58-4b0a-9e93-29d8e03f6946';

UPDATE public.tests SET source_key='histology-test-derived-embryology'
WHERE id='ac224d19-9392-59d2-b442-d915a6ceedd3' AND subject_id='977d78ca-7a58-4b0a-9e93-29d8e03f6946';

UPDATE public.tests SET source_key='histology-test-derived-mixed-2007'
WHERE id='5d35202b-719a-523a-b280-ef4672a13506' AND subject_id='977d78ca-7a58-4b0a-9e93-29d8e03f6946';

-- This 67-question embryo set is an exact subset of the canonical mixed set;
-- keep the canonical 20-question embryo test and archive the duplicate set.
UPDATE public.tests SET is_published=false
WHERE id='ac224d19-9392-59d2-b442-d915a6ceedd3'
  AND subject_id='977d78ca-7a58-4b0a-9e93-29d8e03f6946'
  AND is_published=true;
