-- 2026-10-05: register the complete uploaded histology archive as the canonical source set.
-- Scope: histology only. Existing ticket_banks are intentionally not modified.
UPDATE public.content_sources
SET source_archive='Гистология.zip',
    note='Сверено с актуальным загруженным архивом Гистология.zip; источник считается каноническим.'
WHERE id LIKE 'histology-%';

-- The current archive contains the previously missing 28th electronogram.
INSERT INTO public.content_sources(id,title,source_path,mime_type,original_format,source_archive,note)
VALUES (
 'histology-em-capillary-20261005',
 'Поперечный срез кровеносного капилляра',
 '1_Экзаменационные электронограммы_РАСПЕЧАТАТЬ ВСЕ!/Поперечный срез кровеносного капилляра.docx',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'docx','Гистология.zip',
 'Канонический исходник из актуального архива; ранее отсутствовал в реестре источников.'
)
ON CONFLICT(id) DO UPDATE SET source_path=EXCLUDED.source_path,source_archive=EXCLUDED.source_archive,note=EXCLUDED.note;

UPDATE public.trainer_feed_cards
SET source_key='histology-em-capillary-20261005'
WHERE subject_slug='histology'
  AND preparation->>'name'='Поперечный срез кровеносного капилляра';

-- Remove orphaned legacy subject references from the trainer content.
UPDATE public.trainer_feed_cards
SET subject_id=(SELECT id FROM public.subjects WHERE slug='histology' AND is_active=true)
WHERE subject_slug='histology' AND subject_id IS NULL;

-- Canonical non-EM sources from the uploaded archive.
INSERT INTO public.content_sources(id,title,source_path,mime_type,original_format,source_archive,note) VALUES
('histology-zip-scheme-0','0. Гистотехника','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/0. Гистотехника.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-1','1.Цитология','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/1.Цитология.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-2','2.Основы общей эмбриологии','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/2.Основы общей эмбриологии.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-3','3.Эпителиальные ткани','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/3.Эпителиальные ткани.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-4','4.Кровь','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/4.Кровь.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-5','5.Соединительные ткани','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/5.Соединительные ткани.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-6','6.Хрящевые ткани','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/6.Хрящевые ткани.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-7','7.Костные ткани','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/7.Костные ткани.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-8','8.Мышечные ткани','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/8.Мышечные ткани.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-9','9.Нервная ткань','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/9.Нервная ткань.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-10','10. Спинной мозг','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/10. Спинной мозг.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-11','11. Головной мозг. ВНС','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/11. Головной мозг. ВНС.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-12','12. Зрительный и обонятельный анализаторы','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/12. Зрительный и обонятельный анализаторы.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-13','13. Слуховой вестибулярный и вкусовой анализаторы','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/13. Слуховой вестибулярный и вкусовой анализаторы.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-14','14. Сердечно-сосудистая система','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/14. Сердечно-сосудистая система.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-15','15. Кроветворение','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/15. Кроветворение.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-16','16. Иммунная система','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/16. Иммунная система.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-17','17-18. Эндокринная система','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/17-18. Эндокринная система.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-19','19. Передний отдел ЖКТ','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/19. Передний отдел ЖКТ.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-20','20. Средний отдел ЖКТ','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/20. Средний отдел ЖКТ.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-21','21. Большие железы ЖКТ','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/21. Большие железы ЖКТ.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-22','22. Дыхательная система','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/22. Дыхательная система.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-23','23. Кожа','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/23. Кожа.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-24','24. Выделительная система','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/24. Выделительная система.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-25','25. Мужская половая система','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/25. Мужская половая система.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-26','26. Женская половая система','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/26. Женская половая система.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-scheme-27','27. Эмбриогенез человека','2_Схемы и таблицы к занятиям_ДЗ_пишем в тетрадь!/27. Эмбриогенез человека.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник из актуального архива.'),
('histology-zip-test-2008','Сборник тест зад по общ. и частн. гист. 2008','3_Сборники тестовых заданий/Сборник тест зад по общ. и частн. гист. 2008.doc','application/msword','doc','Гистология.zip','Канонический исходник тестового банка.'),
('histology-zip-test-general','Сборник тестовых заданий по общей гистологии','3_Сборники тестовых заданий/Сборник тестовых заданий по общей гистологии.doc','application/msword','doc','Гистология.zip','Канонический исходник тестового банка.'),
('histology-zip-test-cyto','Сборник тестовых заданий по цитологии и эмбриологии','3_Сборники тестовых заданий/Сборник тестовых заданий по цитологии и эмбриологии.doc','application/msword','doc','Гистология.zip','Канонический исходник тестового банка.'),
('histology-zip-test-cyto-docx','Сборник тестовых заданий по цитологии и эмбриологии (DOCX)','3_Сборники тестовых заданий/Сборник тестовых заданий по цитологии и эмбриологии.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический исходник тестового банка.'),
('histology-zip-method-mouth','гистология. пол. рта','4_Методички ко всем занятиям/гистология.   пол. рта.doc','application/msword','doc','Гистология.zip','Каноническая методичка из актуального архива.'),
('histology-zip-method-neuro','метод.по нервн кровен, кроветв.леч','4_Методички ко всем занятиям/метод по нервн, кровен,кроветв, эндокр с-мам/метод.по нервн кровен, кроветв.леч.doc','application/msword','doc','Гистология.zip','Каноническая методичка из актуального архива.'),
('histology-zip-method-cover','Титульник','4_Методички ко всем занятиям/метод по нервн, кровен,кроветв, эндокр с-мам/Титульник.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Каноническая методичка из актуального архива.'),
('histology-zip-method-digestive','методичка пищ леч','4_Методички ко всем занятиям/методичка пищ леч.doc','application/msword','doc','Гистология.zip','Каноническая методичка из актуального архива.'),
('histology-zip-method-general','Общая гистология','4_Методички ко всем занятиям/Общая гистология.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Каноническая методичка из актуального архива.'),
('histology-zip-method-cyto-2024','Цитол и эмбр. для самоподготовки 2024 г.','4_Методички ко всем занятиям/Цитол и эмбр. для самоподготовки 2024 г..docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Каноническая методичка из актуального архива.'),
('histology-zip-method-cyto','цитология и эмбриология','4_Методички ко всем занятиям/цитология и эмбриология.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Каноническая методичка из актуального архива.'),
('histology-zip-exam-tasks','задачи по гистологии','экзаменационные вопросы/задачи по гистологии.doc','application/msword','doc','Гистология.zip','Канонический экзаменационный источник.'),
('histology-zip-exam-specimens','списки экзамен. препаратов','экзаменационные вопросы/списки экзамен. препаратов.doc','application/msword','doc','Гистология.zip','Канонический экзаменационный источник.'),
('histology-zip-exam-dentistry','экзам.вопросы стом','экзаменационные вопросы/экзам.вопросы стом.doc','application/msword','doc','Гистология.zip','Канонический экзаменационный источник.'),
('histology-zip-exam-med-ped','экзаменационные вопросы леч. пед','экзаменационные вопросы/экзаменационные вопросы леч. пед.doc','application/msword','doc','Гистология.zip','Канонический экзаменационный источник.'),
('histology-zip-exam-answers','эталоны ответов к задачам','экзаменационные вопросы/эталоны ответов к задачам.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический экзаменационный источник.'),
('histology-zip-fed-medped','федеральные тесты пед. и леч','База тестовых заданий/федеральные тесты пед. и леч.doc','application/msword','doc','Гистология.zip','Канонический федеральный тестовый источник.'),
('histology-zip-fed-dent','федеральные тесты стом','База тестовых заданий/федеральные тесты стом.doc','application/msword','doc','Гистология.zip','Канонический федеральный тестовый источник.'),
('histology-zip-control-2','контрольная работа 2 диагностика','Контрольные работы к диагностикам/контрольная работа 2 диагностика.doc','application/msword','doc','Гистология.zip','Канонический источник контрольной работы.'),
('histology-zip-control-1','контрольная работа к 1 диагностике леч.пед.','Контрольные работы к диагностикам/контрольная работа к 1 диагностике леч.пед..doc','application/msword','doc','Гистология.zip','Канонический источник контрольной работы.'),
('histology-zip-specimen-list','Cписки препаратов для диагностики и экзмена','Cписки препаратов для диагностики и экзмена.doc','application/msword','doc','Гистология.zip','Канонический список препаратов.'),
('histology-zip-memo','Памятка_РАСПЕЧАТАТЬ!','Памятка_РАСПЕЧАТАТЬ!.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Каноническая памятка из актуального архива.'),
('histology-zip-spinal-schemes','схемы спинного мозга - копия','схемы спинного мозга/схемы спинного мозга - копия.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx','Гистология.zip','Канонический источник схем спинного мозга.')
ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,source_path=EXCLUDED.source_path,mime_type=EXCLUDED.mime_type,original_format=EXCLUDED.original_format,source_archive=EXCLUDED.source_archive,note=EXCLUDED.note;
