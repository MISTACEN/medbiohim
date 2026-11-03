-- Тренажёр Telegram-бота: ежедневный хим-челлендж, формула дня,
-- подписка на утреннюю рассылку карточек. Бот читает всё через API-воркер
-- по внутреннему секрету, поэтому таблицы закрыты от клиентов (только service role).
BEGIN;

CREATE TABLE IF NOT EXISTS public.bot_chem_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('balance', 'product')),
  prompt text NOT NULL,
  equation text NOT NULL,
  variants jsonb NOT NULL,
  correct_index int NOT NULL CHECK (correct_index >= 0 AND correct_index < 8),
  explanation text NOT NULL DEFAULT '',
  formula text,
  subject_name text,
  topic text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_chem_challenges_variants_shape CHECK (
    jsonb_typeof(variants) = 'array' AND jsonb_array_length(variants) BETWEEN 2 AND 8
  )
);

CREATE INDEX IF NOT EXISTS bot_chem_challenges_active_idx
  ON public.bot_chem_challenges (kind, is_active);

CREATE TABLE IF NOT EXISTS public.bot_formulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  latex text NOT NULL,
  description text NOT NULL DEFAULT '',
  subject_name text,
  topic text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bot_daily_prefs (
  telegram_user_id bigint PRIMARY KEY CHECK (telegram_user_id > 0),
  drill_enabled boolean NOT NULL DEFAULT true,
  challenge_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bot_challenge_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  telegram_user_id bigint NOT NULL CHECK (telegram_user_id > 0),
  challenge_id uuid NOT NULL REFERENCES public.bot_chem_challenges(id) ON DELETE CASCADE,
  chosen_label text,
  is_correct boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_challenge_attempts_user_recent_idx
  ON public.bot_challenge_attempts (telegram_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bot_challenge_attempts_challenge_idx
  ON public.bot_challenge_attempts (challenge_id, created_at);

-- Только service role (API-воркер через createServiceClient). Клиентам — ничего.
ALTER TABLE public.bot_chem_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_formulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_daily_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_challenge_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bot_chem_challenges FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bot_formulas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bot_daily_prefs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bot_challenge_attempts FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.bot_chem_challenges IS 'Банк ежедневных хим-челленджей бота: уравнять реакцию или назвать продукт; variants — jsonb-массив {label}, правильный ответ по correct_index.';
COMMENT ON TABLE public.bot_formulas IS 'Банк «формула дня» для бота (LaTeX, рендерится в Unicode на стороне API).';
COMMENT ON TABLE public.bot_daily_prefs IS 'Подписки чатов на утреннюю рассылку тренажёра (кнопки /daily в боте).';
COMMENT ON TABLE public.bot_challenge_attempts IS 'Попытки прохождения челленджей: для серии и статистики, без личных учебных данных.';

-- ---------------------------------------------------------------------------
-- Сид: уравнять реакцию (kind = balance). variants — наборы коэффициентов.
-- ---------------------------------------------------------------------------
INSERT INTO public.bot_chem_challenges (kind, prompt, equation, variants, correct_index, explanation, subject_name, topic) VALUES
('balance', 'Расставьте коэффициенты: какой набор верный?', 'C6H12O6 + O2 → CO2 + H2O',
 '[{"label":"1, 6, 6, 6"},{"label":"1, 3, 6, 3"},{"label":"2, 6, 6, 6"},{"label":"1, 6, 3, 6"}]'::jsonb, 0,
 'Всего атомов: 6 C, 12 H, 18 O слева → 6 CO2 (6 C, 12 O) + 6 H2O (12 H, 6 O). Итого 18 O: 6+6+6=12 O от CO2 и 6 O от H2O.', 'Биохимия', 'Углеводы'),
('balance', 'Расставьте коэффициенты: какой набор верный?', 'KMnO4 + HCl → KCl + MnCl2 + Cl2 + H2O',
 '[{"label":"2, 16, 2, 2, 5, 8"},{"label":"1, 8, 1, 1, 5, 4"},{"label":"2, 8, 2, 2, 5, 8"},{"label":"2, 16, 2, 2, 2, 8"}]'::jsonb, 0,
 'Классическая ОВР: Mn+7 → Mn+2 принимает 5 e⁻, 2 Cl⁻ → Cl2 отдают 2 e⁻. НОК 10: 2 KMnO4 и 5 Cl2, дальше баланс по K, Mn, H, Cl, O.', 'Химия', 'ОВР'),
('balance', 'Расставьте коэффициенты: какой набор верный?', 'Al + HCl → AlCl3 + H2',
 '[{"label":"2, 6, 2, 3"},{"label":"1, 3, 1, 3"},{"label":"2, 3, 2, 3"},{"label":"3, 6, 3, 3"}]'::jsonb, 0,
 'Al → AlCl3 требует 3 Cl⁻, значит 6 HCl на 2 Al. 2 Al + 6 HCl → 2 AlCl3 + 3 H2.', 'Химия', 'Металлы'),
('balance', 'Расставьте коэффициенты: какой набор верный?', 'H2O2 → H2O + O2',
 '[{"label":"2, 2, 1"},{"label":"1, 1, 1"},{"label":"2, 1, 1"},{"label":"1, 2, 1"}]'::jsonb, 0,
 'Диспропорционирование пероксида: 2 H2O2 → 2 H2O + O2. Кислород одновременно окисляется и восстанавливается.', 'Химия', 'Пероксиды'),
('balance', 'Расставьте коэффициенты: какой набор верный?', 'NaOH + H2SO4 → Na2SO4 + H2O',
 '[{"label":"2, 1, 1, 2"},{"label":"1, 1, 1, 1"},{"label":"2, 1, 1, 1"},{"label":"2, 2, 1, 2"}]'::jsonb, 0,
 'Реакция нейтрализации: 2 NaOH + H2SO4 → Na2SO4 + 2 H2O. Считайте по водороду: 2 Na дают Na2SO4, 2 H+ дают 2 H2O.', 'Химия', 'Кислоты и основания'),
('balance', 'Расставьте коэффициенты: какой набор верный?', 'CaCO3 + HCl → CaCl2 + H2O + CO2',
 '[{"label":"1, 2, 1, 1, 1"},{"label":"1, 1, 1, 1, 1"},{"label":"1, 2, 1, 2, 1"},{"label":"2, 2, 1, 1, 1"}]'::jsonb, 0,
 'Карбонат реагирует с кислотой 1:2: CaCO3 + 2 HCl → CaCl2 + H2O + CO2↑. Два HCl нужны для замещения двух карбонат-ионов.', 'Химия', 'Карбонаты'),
('balance', 'Расставьте коэффициенты: какой набор верный?', 'Cu + HNO3(конц.) → Cu(NO3)2 + NO2 + H2O',
 '[{"label":"1, 4, 1, 2, 2"},{"label":"1, 2, 1, 2, 2"},{"label":"1, 4, 1, 1, 2"},{"label":"2, 4, 2, 2, 2"}]'::jsonb, 0,
 'Cu0 → Cu2+ (2 e⁻), N+5 → N+4 в NO2 (1 e⁻). На 1 Cu нужно 2 NO2 = 2 восстановленных HNO3 + ещё 2 HNO3 на нитрат-ионы: всего 4.', 'Химия', 'ОВР'),
('balance', 'Расставьте коэффициенты: какой набор верный?', 'Zn + HCl → ZnCl2 + H2',
 '[{"label":"1, 2, 1, 1"},{"label":"1, 1, 1, 1"},{"label":"2, 2, 1, 1"},{"label":"1, 2, 2, 1"}]'::jsonb, 0,
 'Zn + 2 HCl → ZnCl2 + H2↑. Водород всегда двухатомный, поэтому нужно 2 HCl на один Zn.', 'Химия', 'Металлы'),
('balance', 'Расставьте коэффициенты: какой набор верный?', 'CH4 + O2 → CO2 + H2O',
 '[{"label":"1, 2, 1, 2"},{"label":"1, 1, 1, 2"},{"label":"1, 2, 1, 1"},{"label":"2, 2, 1, 2"}]'::jsonb, 0,
 'Горение метана: CH4 + 2 O2 → CO2 + 2 H2O. 4 H дают 2 H2O, на них 2 O = 2 O2 минус 2 в CO2... проверьте: 2 O2 = 4 O = 2 (CO2) + 2 (H2O).', 'Химия', 'Углеводороды'),
('balance', 'Расставьте коэффициенты: какой набор верный?', 'Fe2O3 + CO → Fe + CO2',
 '[{"label":"1, 3, 2, 3"},{"label":"1, 1, 2, 1"},{"label":"1, 3, 1, 3"},{"label":"2, 3, 4, 3"}]'::jsonb, 0,
 'Восстановление железа монооксидом углерода: Fe2O3 + 3 CO → 2 Fe + 3 CO2. Каждый CO забирает один O от оксида.', 'Химия', 'Металлургия'),

-- ---------------------------------------------------------------------------
-- Сид: назвать продукт реакции (kind = product).
-- ---------------------------------------------------------------------------
('product', 'Назовите продукт реакции', 'Глюкоза + АТФ —(гексокиназа)→ ?',
 '[{"label":"Глюкозо-6-фосфат"},{"label":"Фруктозо-6-фосфат"},{"label":"Глюкозо-1-фосфат"},{"label":"Пируват"}]'::jsonb, 0,
 'Гексокиназа фосфорилирует глюкозу за счёт АТФ в глюкозо-6-фосфат — первый шаг гликолиза, «запирает» сахар в клетке.', 'Биохимия', 'Гликолиз'),
('product', 'Назовите продукт реакции', 'Пируват + NADH + H+ —(лактатдегидрогеназа)→ ?',
 '[{"label":"Лактат"},{"label":"Ацетил-КоА"},{"label":"Оксалоацетат"},{"label":"Аланин"}]'::jsonb, 0,
 'ЛДГ восстанавливает пируват в лактат, регенерируя NAD+ для гликолиза в анаэробных условиях (в том числе в эритроцитах и при гипоксии).', 'Биохимия', 'Гликолиз'),
('product', 'Назовите продукт реакции', 'Ацетил-КоА + оксалоацетат —(цитратсинтаза)→ ?',
 '[{"label":"Цитрат"},{"label":"Изоцитрат"},{"label":"α-Кетоглутарат"},{"label":"Сукцинат"}]'::jsonb, 0,
 'Цитратсинтаза — вход в цикл Кребса: конденсация ацетил-КоА с оксалоацетатом даёт цитрат.', 'Биохимия', 'Цикл Кребса'),
('product', 'Назовите продукт реакции', 'Фруктозо-6-фосфат + АТФ —(фосфофруктокиназа)→ ?',
 '[{"label":"Фруктозо-1,6-дифосфат"},{"label":"Фруктозо-6-фосфат-2"},{"label":"Глюкозо-6-фосфат"},{"label":"3-Фосфоглицерат"}]'::jsonb, 0,
 'ФФК-1 — ключевой и лимитирующий фермент гликолиза: переносит фосфат на C1, получая фруктозо-1,6-дифосфат.', 'Биохимия', 'Гликолиз'),
('product', 'Назовите продукт реакции', 'Малат + NAD+ —(малатдегидрогеназа)→ ?',
 '[{"label":"Оксалоацетат"},{"label":"Фумарат"},{"label":"Лактат"},{"label":"Цитрат"}]'::jsonb, 0,
 'МДГ окисляет малат в оксалоацетат (NAD+ → NADH) — замыкающий шаг цикла Кребса перед цитратсинтазой.', 'Биохимия', 'Цикл Кребса'),
('product', 'Назовите продукт реакции', '2-Фосфоглицерат —(енолаза)→ ?',
 '[{"label":"Фосфоенолпируват (ФЕП)"},{"label":"Пируват"},{"label":"1,3-Бифосфоглицерат"},{"label":"3-Фосфоглицерат"}]'::jsonb, 0,
 'Енолаза проводит дегидратацию: 2-фосфоглицерат → ФЕП, высокоэнергетическая молекула для второй субстратного фосфорилирования гликолиза.', 'Биохимия', 'Гликолиз'),
('product', 'Назовите продукт реакции', 'Сукцинил-КоА + ГДФ + Pi —(сукцинил-КоА-синтетаза)→ ?',
 '[{"label":"Сукцинат + ГТФ"},{"label":"Сукцинат + АТФ"},{"label":"Фумарат + ГТФ"},{"label":"α-Кетоглутарат + ГТФ"}]'::jsonb, 0,
 'Субстратное фосфорилирование в цикле Кребса: тиоэфирная связь гидролизуется, энергия уходит в ГТФ (в некоторых тканях — АТФ).', 'Биохимия', 'Цикл Кребса'),
('product', 'Назовите продукт реакции', 'Глюкозо-6-фосфат —(глюкозо-6-фосфатаза)→ ?',
 '[{"label":"Свободная глюкоза"},{"label":"Глюкозо-1-фосфат"},{"label":"Фруктозо-6-фосфат"},{"label":"Рибулозо-5-фосфат"}]'::jsonb, 0,
 'Финальный шаг гликогенолиза и глюконеогенеза (печень, почки): дефосфорилирование даёт свободную глюкозу в кровь.', 'Биохимия', 'Гликогенолиз'),
('product', 'Назовите продукт реакции', 'NH3 + CO2 + 2 АТФ —(карбамоилфосфатсинтетаза-1)→ ?',
 '[{"label":"Карбамоилфосфат"},{"label":"Цитруллин"},{"label":"Аргинин"},{"label":"Мочевина"}]'::jsonb, 0,
 'ЦПС-1 в митохондриях печени запускает орнитиновый цикл: фиксация NH3 в карбамоилфосфат — шаг образования мочевины.', 'Биохимия', 'Обмен азота'),
('product', 'Назовите продукт реакции', 'Лактат —(лактатдегидрогеназа, печень)→ ?',
 '[{"label":"Пируват"},{"label":"Глюкоза"},{"label":"Аланин"},{"label":"Ацетил-КоА"}]'::jsonb, 0,
 'Реципрокная реакция цикла Кори: в печени лактат окисляется обратно в пируват, откуда начинается глюконеогенез.', 'Биохимия', 'Цикл Кори');

-- ---------------------------------------------------------------------------
-- Сид: «формула дня».
-- ---------------------------------------------------------------------------
INSERT INTO public.bot_formulas (title, latex, description, subject_name, topic) VALUES
('Уравнение Михаэлиса–Ментен', 'v = \\frac{V_{max}[S]}{K_m + [S]}',
 'Скорость ферментативной реакции от концентрации субстрата. При [S] = Km скорость равна половине максимальной.', 'Биохимия', 'Ферменты'),
('Уравнение Гендерсона–Хассельбаха', 'pH = pK_a + \\lg\\frac{[A^-]}{[HA]}',
 'Связь pH буферной системы с соотношением сопряжённого основания и кислоты. Основа понимания бикарбонатного буфера крови.', 'Биохимия', 'Кислотно-основное состояние'),
('Молярная концентрация', 'c = \\frac{n}{V} = \\frac{m}{M \\cdot V}',
 'Сколько молей вещества в литре раствора. Базовый расчёт всех растворов в лабораторных.', 'Химия', 'Растворы'),
('Разведение растворов', 'C_1 V_1 = C_2 V_2',
 'Правило разведения: сколько концентрированного раствора взять, чтобы получить рабочий.', 'Химия', 'Растворы'),
('Водородный показатель', 'pH = -\\lg[H^+]',
 'pH — отрицательный десятичный логарифм концентрации ионов водорода. pH 7 — нейтральный, меньше — кислая среда.', 'Химия', 'Кислоты и основания'),
('Закон Гесса (расчёт через число Авогадро)', 'N_A = 6{,}022 \\cdot 10^{23} \\text{ моль}^{-1}',
 'Число Авогадро: столько частиц в одном моле вещества.', 'Химия', 'Основные понятия'),
('Уравнение Клапейрона–Менделеева', 'P V = n R T',
 'Уравнение состояния идеального газа. R ≈ 8,31 Дж/(моль·К).', 'Химия', 'Газы'),
('Энергия Гиббса', '\\Delta G = \\Delta H - T \\Delta S',
 'Свободная энергия реакции: ΔG < 0 — процесс идёт самопроизвольно. Так оценивают термодинамику реакций метаболизма.', 'Биохимия', 'Биоэнергетика'),
('Индекс атерогенности', '\\text{ИА} = \\frac{(ЛПНП + ЛПОНП)}{ЛПВП}',
 'Коэффициент атерогенности липидограммы: в норме 2–3. Выше — риск атеросклероза.', 'Биохимия', 'Обмен липидов'),
('Клиренс креатинина', 'Cl = \\frac{U_{cr} \\cdot V}{P_{cr}}',
 'Концентрация креатинина в моче × минутный диурез ÷ концентрация в плазме. Показатель скорости клубочковой фильтрации.', 'Биохимия', 'Выделительная система'),
('Индекс массы тела', '\\text{ИМТ} = \\frac{m}{h^2}',
 'Масса (кг) ÷ рост² (м²). Норма 18,5–24,9; выше 25 — избыточная масса, выше 30 — ожирение.', 'Медицина', 'Общее'),
('Осмотическое давление (разбавленные растворы)', '\\pi = i \\cdot c \\cdot R \\cdot T',
 'Закон Вант-Гоффа: осмотическое давление пропорционально молярной концентрации с изотоническим коэффициентом i.', 'Химия', 'Растворы');

NOTIFY pgrst, 'reload schema';
COMMIT;
