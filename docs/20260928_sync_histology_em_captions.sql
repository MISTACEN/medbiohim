-- Histology EM captions sync (28 cards)
-- Safe: only touches preparation.captions for known electronogram feed ids
-- Run in Supabase SQL editor as service role / postgres

BEGIN;

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["Кольцевидная конденсация хроматина в ядре", "Расширение перинуклеарного пространства"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-6dbc9c438d';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["А - межальвеолярная перегородка", "Б-  аэрогематический барьер", "1. Просвет кровеносного капилляра", "2. Просвет альвеол", "3. Базальные мембраны альвеолы и капилляра", "5. Ядро эндотелиоцита", "6. Цитоплазма эндотелиоцита", "7. Цитоплазма альвеолоцита 1-го типа (респираторного)", "8. Эритроци"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-41718a4d4c';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["1. Плазмолеммы контактирующих кардиомиоцитов, образующие интердигитации", "2. Десмосома", "3. Нексусы", "4. Митохондрии", "5. Актиновые и миозиновые филаменты миофибрилл"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-b48573a909';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["А – наружный сегмент", "Б – внутренний сегмент", "1. Мембраны дисков", "2. Цитоплазма", "3. Ресничка в связующем отделе", "4. Базальное тельце", "5. Митохондрия"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-402e952e4b';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["Уплощенные цистерны", "Вакуоли", "Микропузырьки", "Митохондрии"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-8de5f8b617';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["Лизосомы", "Мембрана лизосомы", "Митохондрии", "Гиалоплазма"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-5247a85d86';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["А – продольный срез микроворсинок", "Б – поперечный срез микроворсинок", "1. Выросты плазмолеммы эпителиоцита", "2. Пиноцитозный пузырек"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-46b117567b';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["Кардиомиоциты, формирующие функциональный синцитий", "Вставочные диски", "Сосуды", "Разветвления кардиомиоцитов"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-e9680b3eab';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["А – палочковидная митохондрия", "Б -  шаровидная митохондрия", "В – разрушающаяся митохондрия, окруженная лизосомами", "1. Наружная митохондриальная мембрана", "2. Внутренняя митохондриальная мембрана", "3. Кристы", "4. Матрикс", "5. Гранулярная эндоплазматическая сеть"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-b8e9dc6c11';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["1.Поперечный срез концевого ветвления аксона      мотонейрона", "2. Митохондрии аксона    мотонейрона", "3. Синаптические пузырьки", "4. Пресинаптическая мембрана (аксолемма)", "5. Постсинаптическая мембрана (плазмолемма миосимпласта)", "6. Складки плазмолеммы миосимпласта", "7. Синаптическая щель", "8. Цитоплазма леммоцита", "9. Саркоплазма миосимпласта", "10. Ядро миосимпласта"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-37df8b1950';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["МФ – остаточное тельце (миелиновая фигура)", "Л – липидные капли"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-8143d50aba';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["Внутриклеточный секреторный  каналец", "Микроворсинки канальца", "Ядро экзокриноцита", "Митохондрии околоядерные", "Митохондрии периферические", "Гладкая эндоплазматическая      сеть"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-f22bfe6d5e';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["1. Ядро эндотелиальной клетки", "2. Рибосомы", "3.Контакты соседних эндотелиальных клеток", "4. Пиноцитозные пузырьки", "5. Базальная мембрана капилляра", "6. Просвет капилляра"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-1d6bc4ee9f';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["1. Реснички мерцательных эпителиоцитов", "2. Апикальная часть бокаловидных клеток, содержащая слизь"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-8976014fa3';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["Просвет капилляра", "Ядро эндотелиоцита", "Цитоплазма эндотелиоцита", "Микропиноцитозные пузырьки", "Поры в эндотелии", "Базальная мембрана", "Адвентициальная клетка"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-bab1517f74';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["1. Витки мезаксона леммоцита, образующие миелиновый слой", "2. Осевой цилиндр – отросток нервной клетки"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-6b86c1d5d3';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["А – поперечный срез на уровне аксонемы", "Б – поперечный срез на уровне базального тельца.", "1. Плазмолемма", "2. Дуплеты периферических микротрубочек", "3. Триплеты периферических микротрубочек", "4. Центральный дуплет микротрубочек"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-a661167097';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["А – продольный срез саркомера   5. Актиновые филаменты (А)", "Б – поперечный срез саркомера    6. Актомиозиновые мостики", "В – сарколемма", "1. 1/2  I- диска", "А - диск", "2. А – диск в зоне перекрытия актиновыми и миозиновыми филаментами", "3. H – полоска в А – диске", "4. Миозиновые филаменты (М)", "8. Поперечный срез актиновых филаментов", "9. Актомиозиновые мостики", "10. ПМ – плазмолемма миосимпласта", "11. БМ – базальная мембрана", "12. Z - полоски"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-ebd23f14aa';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["Приносящая артериола", "Капилляры сосудистого клубочка", "Выносящая артериола"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-f8d44d3799';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["А – продольный срез", "Б – поперечный срез аксонемы на уровне главного отдела хвостика", "1. Ядро", "2. Связующий отдел", "3. Проксимальная центриоль", "4. Дистальная центриоль, формирующая аксонему жгутика", "5. Аксонема жгутика", "6. Митохондрии", "7. Плазмолемма", "8. Хвостик", "9. Промежуточный отдел"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-3012c17b58';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["Ядро сустентоцита", "Эндоплазматическая сеть", "Включения липидов", "Митохондрии", "Базальная мембрана", "Коллагеновые протофибриллы", "Сперматогонии, расположенные в инвагинациях сустентоцита"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-09cf767487';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["А. Узловой перехват  (Ранвье)  в нервном волокне седалищного нерва", "1. Осевой цилиндр", "2. Узловой перехват", "3. Миелиновый слой нервного волокна", "4. Нейролемма", "5. Митохондрия леммоцита", "6. Пальцевидные выпячивания двух леммоцитов в области их контакта", "7. Насечка в миелине", "Б. Строение мезаксона в области насечки миелинового слоя (насечка Шмидт-Лантермана)", "1. Миелиновый слой", "2. Цитоплазма леммоцита между двойными мембранами мезаксона в насечке.", "3. Разрежение мембран мезаксона в области насечки"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-05259b86bb';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["Фагоцитоз бактерии нейтрофильным лейкоцитом", "А – ранняя стадия", "Б – более поздняя стадия", "1. Ядро нейтрофила", "2. Цитоплазма нейтрофила", "3. Псевдоподии (ложноножки)      нейтрофила", "4. Бактерия"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-d69cfa101f';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["Просвет кровеносного капилляра", "Цитоплазма эндотелиоцита", "Митохондрия", "Поры в эндотелиальных клетках", "Трехслойная базальная мембрана", "Ядро подоцита", "Цитотрабекулы", "Цитоподии", "Полость капсулы"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-c1de285fb5';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["Рибосомы на поверхности канальцев гранулярной эндоплазматическоцй сети", "Мембрана канальца гранулярной ЭПС", "Гиалоплазма", "Канальцы гранулярной ЭПС", "Поперечный срез канальцев гладкой  ЭПС"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-745cbc0cf0';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["Сегментированное ядро эозинофила", "Специфические гранулы с кристаллоидом", "Митохондрии", "Эндоплазматическая сеть"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-2fff6ef90f';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["I. Ядро", "II. Ядрышко", "Наружная ядерная мембрана", "Внутренняя ядерная мембрана", "Нити хромосом", "Фибриллярный компонент ядрышка", "Гранулярный компонент ядрышка (субъединицы рибосом)"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-3609281642';

UPDATE public.trainer_feed_cards
SET preparation = jsonb_set(COALESCE(preparation, '{}'::jsonb), '{captions}', '["Ядро", "Ядрышко", "Желточные гранулы", "Мультивезикулярные тельца", "Оволемма с микроворсинками", "Блестящая зона", "Фолликулярные клетки, формирующие лучистый венец", "Отростки фолликулярных клеток"]'::jsonb, true),
    updated_at = now()
WHERE id = 'feed-em-2aa0d32a8d';

SELECT id, preparation->>'name' AS name,
       jsonb_array_length(COALESCE(preparation->'captions','[]'::jsonb)) AS captions_n
FROM public.trainer_feed_cards
WHERE mode_set = 'electronogram' OR tags @> ARRAY['electronogram']::text[]
ORDER BY preparation->>'name';

COMMIT;
