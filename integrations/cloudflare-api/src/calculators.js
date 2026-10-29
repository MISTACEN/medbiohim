/**
 * Stateless medical-study calculators ported from backend/src/Services/CalculatorsService.php.
 * Keep formulas and response keys aligned with the PHP API; no result is persisted.
 *
 * Each result now carries an educational audit trail:
 *   steps[]      — {label, formula, value} пошаговое решение;
 *   approximate  — true, если итог опирается на приближённую формулу/коэффициент;
 *   notes[]      — оговорки и допущения (что именно приблизительно).
 * Всё считается на сервере; UI только показывает.
 */
const CALCULATORS = [
  {
    id: "bmi",
    name: "Индекс массы тела (ИМТ)",
    category: "общеклинические",
    description: "Оценка массы тела по росту и массе.",
    fields: [
      { key: "weight_kg", label: "Масса, кг", type: "number", min: 1, max: 500, step: 0.1 },
      { key: "height_cm", label: "Рост, см", type: "number", min: 40, max: 250, step: 0.1 },
    ],
  },
  {
    id: "bsa",
    name: "Площадь поверхности тела",
    category: "общеклинические",
    description: "Формула Mosteller для площади поверхности тела.",
    fields: [
      { key: "weight_kg", label: "Масса, кг", type: "number", min: 1, max: 500, step: 0.1 },
      { key: "height_cm", label: "Рост, см", type: "number", min: 40, max: 250, step: 0.1 },
    ],
  },
  {
    id: "ckd_epi_2021",
    name: "eGFR CKD-EPI 2021",
    category: "почки",
    description: "Расчёт расчетной СКФ по креатинину без расового коэффициента.",
    fields: [
      { key: "age", label: "Возраст, лет", type: "number", min: 18, max: 120, step: 1 },
      { key: "creatinine_mg_dl", label: "Креатинин, мг/дл", type: "number", min: 0.1, max: 20, step: 0.01 },
      { key: "sex", label: "Пол", type: "select", options: [{ value: "female", label: "Женский" }, { value: "male", label: "Мужской" }] },
    ],
  },
  {
    id: "cockcroft_gault",
    name: "Клиренс креатинина Cockcroft–Gault",
    category: "почки",
    description: "Оценка клиренса креатинина для взрослых.",
    fields: [
      { key: "age", label: "Возраст, лет", type: "number", min: 18, max: 120, step: 1 },
      { key: "weight_kg", label: "Масса, кг", type: "number", min: 1, max: 400, step: 0.1 },
      { key: "creatinine_mg_dl", label: "Креатинин, мг/дл", type: "number", min: 0.1, max: 20, step: 0.01 },
      { key: "sex", label: "Пол", type: "select", options: [{ value: "female", label: "Женский" }, { value: "male", label: "Мужской" }] },
    ],
  },
  {
    id: "anion_gap",
    name: "Анионная разница",
    category: "лаборатория",
    description: "Расчёт AG по натрию, хлору и бикарбонату.",
    fields: [
      { key: "sodium", label: "Na⁺, ммоль/л", type: "number", min: 80, max: 220, step: 0.1 },
      { key: "chloride", label: "Cl⁻, ммоль/л", type: "number", min: 40, max: 180, step: 0.1 },
      { key: "bicarbonate", label: "HCO₃⁻, ммоль/л", type: "number", min: 1, max: 80, step: 0.1 },
      { key: "albumin", label: "Альбумин, г/дл", type: "number", min: 0.5, max: 8, step: 0.1, optional: true },
    ],
  },
  {
    id: "corrected_calcium",
    name: "Скорректированный кальций",
    category: "лаборатория",
    description: "Приближённая коррекция общего кальция по альбумину.",
    fields: [
      { key: "calcium_mg_dl", label: "Общий Ca, мг/дл", type: "number", min: 1, max: 20, step: 0.1 },
      { key: "albumin_g_dl", label: "Альбумин, г/дл", type: "number", min: 0.5, max: 8, step: 0.1 },
    ],
  },
  {
    id: "serum_osmolality",
    name: "Осмолярность сыворотки",
    category: "лаборатория",
    description: "Расчётная осмолярность по натрию, глюкозе и мочевине.",
    fields: [
      { key: "sodium", label: "Na⁺, ммоль/л", type: "number", min: 80, max: 220, step: 0.1 },
      { key: "glucose_mg_dl", label: "Глюкоза, мг/дл", type: "number", min: 1, max: 1000, step: 1 },
      { key: "bun_mg_dl", label: "BUN, мг/дл", type: "number", min: 1, max: 300, step: 1 },
    ],
  },
  {
    id: "infusion_rate",
    name: "Скорость инфузии",
    category: "дозы",
    description: "Расчёт мл/ч и капель/мин для заданного объёма и времени.",
    fields: [
      { key: "volume_ml", label: "Объём, мл", type: "number", min: 1, max: 10000, step: 1 },
      { key: "time_hours", label: "Время, ч", type: "number", min: 0.1, max: 100, step: 0.1 },
      { key: "drop_factor", label: "Капель/мл", type: "number", min: 1, max: 100, step: 1, default: 20 },
    ],
  },
  {
    id: "abg",
    name: "КЩС: газовый состав крови (ABG)",
    category: "лаборатория",
    approximate: true,
    description:
      "Первичное нарушение КЩС, ожидаемая компенсация (Winter и др.), анионная разница, delta ratio и base excess. Формулы компенсации приблизительны и зависят от клинического контекста.",
    fields: [
      { key: "ph", label: "pH", type: "number", min: 6.5, max: 8, step: 0.01, hint: "Референс 7.35–7.45; венозная кровь обычно ниже." },
      { key: "paco2_mm_hg", label: "PaCO₂, мм рт. ст.", type: "number", min: 5, max: 150, step: 0.1, hint: "Референс 35–45 мм рт. ст." },
      { key: "hco3_mmol_l", label: "HCO₃⁻, ммоль/л", type: "number", min: 1, max: 60, step: 0.1, hint: "Референс 22–26 ммоль/л." },
      { key: "sodium", label: "Na⁺, ммоль/л", type: "number", min: 80, max: 220, step: 0.1, optional: true, hint: "Нужен вместе с Cl⁻ для анионной разницы." },
      { key: "chloride", label: "Cl⁻, ммоль/л", type: "number", min: 40, max: 180, step: 0.1, optional: true, hint: "Нужен вместе с Na⁺ для анионной разницы." },
      { key: "albumin_g_dl", label: "Альбумин, г/дл", type: "number", min: 0.5, max: 8, step: 0.1, optional: true, hint: "Для поправки анионной разницы на гипоальбуминемию." },
      { key: "lactate_mmol_l", label: "Лактат, ммоль/л", type: "number", min: 0, max: 40, step: 0.1, optional: true, hint: "Ориентировочная верхняя граница ~2 ммоль/л." },
    ],
  },
  {
    id: "michaelis_menten",
    name: "Кинетика: Михаэлис–Ментен",
    category: "биохимия",
    description: "Скорость ферментативной реакции V = Vmax × [S] / (Km + [S]) с пошаговым решением.",
    fields: [
      { key: "substrate", label: "Концентрация субстрата [S], ммоль/л", type: "number", min: 0, max: 1000000, hint: "Единицы [S] и Km должны совпадать." },
      { key: "km", label: "Константа Михаэлиса Km, ммоль/л", type: "number", min: 0, max: 1000000, hint: "Km > 0; концентрация, при которой V = Vmax/2." },
      { key: "vmax", label: "Vmax, ед. скорости", type: "number", min: 0, max: 1000000000, hint: "В любых единицах скорости (например, мкмоль/(л·мин))." },
    ],
  },
  {
    id: "arrhenius",
    name: "Кинетика: уравнение Аррениуса",
    category: "биохимия",
    description: "Константа скорости k = A × exp(−Ea / (R × T)) с пошаговым решением. A и Ea задаёт пользователь — калькулятор их не подбирает.",
    fields: [
      { key: "a", label: "Предэкспонента A, ед. k", type: "number", min: 0, max: 1e30, hint: "A > 0, в тех же единицах, что и k." },
      { key: "ea_kj", label: "Энергия активации Ea, кДж/моль", type: "number", min: 0, max: 1000, step: 0.1, hint: "Берётся из эксперимента; типичные значения десятки кДж/моль." },
      { key: "temp_k", label: "Температура T, К", type: "number", min: 1, max: 2000, step: 0.1, hint: "T(К) = t(°C) + 273.15." },
      { key: "temp2_k", label: "Вторая температура T₂, К", type: "number", min: 1, max: 2000, step: 0.1, optional: true, hint: "Необязательно: сравнить k при двух температурах." },
    ],
  },
  {
    id: "atp_glucose",
    name: "АТФ: полное окисление глюкозы",
    category: "биохимия",
    approximate: true,
    description: "Стехиометрия аэробного окисления глюкозы: 30–32 АТФ в зависимости от шаттла и принятых P/O.",
    fields: [
      {
        key: "shuttle",
        label: "Шаттл цитозольного NADH",
        type: "select",
        options: [
          { value: "range", label: "Не указан — диапазон 30–32 АТФ" },
          { value: "malate_aspartate", label: "Малат-аспартатный (2.5 АТФ на NADH)" },
          { value: "glycerol_phosphate", label: "Глицерол-3-фосфатный (1.5 АТФ на NADH)" },
        ],
      },
    ],
  },
  {
    id: "atp_fatty_acid",
    name: "АТФ: β-окисление жирной кислоты",
    category: "биохимия",
    approximate: true,
    description: "АТФ для насыщенной чётной жирной кислоты: циклы β-окисления, ацетил-КоА и окислительное фосфорилирование с допущениями.",
    fields: [
      {
        key: "carbons",
        label: "Число атомов углерода n",
        type: "number",
        min: 4,
        max: 28,
        step: 2,
        default: 16,
        hint: "Только чётное n; для нечётных цепей нужен отдельный расчёт пропионил-КоА.",
      },
    ],
  },
  {
    id: "concentration_units",
    name: "Конверсия: концентрация (mg/dL ↔ ммоль/л)",
    category: "конверсии",
    approximate: true,
    description: "Пересчёт глюкозы, мочевины, креатинина и холестерина по молярным массам.",
    fields: [
      {
        key: "analyte",
        label: "Показатель",
        type: "select",
        options: [
          { value: "glucose", label: "Глюкоза (M = 180.16 г/моль)" },
          { value: "urea", label: "Мочевина целиком (M = 60.06 г/моль)" },
          { value: "creatinine", label: "Креатинин (M = 113.12 г/моль)" },
          { value: "cholesterol", label: "Холестерин (M = 386.65 г/моль)" },
        ],
      },
      {
        key: "direction",
        label: "Направление",
        type: "select",
        options: [
          { value: "to_si", label: "mg/dL → ммоль/л" },
          { value: "from_si", label: "ммоль/л → mg/dL" },
        ],
      },
      { key: "value", label: "Значение", type: "number", min: 0, max: 100000, step: 0.01, hint: "Единицы задаются выбранным направлением." },
    ],
  },
  {
    id: "pressure_units",
    name: "Конверсия: давление (мм рт. ст. ↔ кПа)",
    category: "конверсии",
    approximate: true,
    description: "Пересчёт давления: 1 мм рт. ст. = 0.133322 кПа.",
    fields: [
      {
        key: "direction",
        label: "Направление",
        type: "select",
        options: [
          { value: "mmhg_to_kpa", label: "мм рт. ст. → кПа" },
          { value: "kpa_to_mmhg", label: "кПа → мм рт. ст." },
        ],
      },
      { key: "value", label: "Значение", type: "number", min: 0, max: 10000, step: 0.01, hint: "Например, 120 мм рт. ст. ≈ 16.0 кПа." },
    ],
  },
];

/** Молярные массы и коэффициенты пересчёта: 1 ммоль/л = X mg/dL. */
const ANALYTES = {
  glucose: { label: "Глюкоза", mgdlPerMmol: 18.0156, molar: "180.16 г/моль" },
  urea: { label: "Мочевина", mgdlPerMmol: 6.006, molar: "60.06 г/моль" },
  creatinine: { label: "Креатинин", mgdlPerMmol: 11.312, molar: "113.12 г/моль" },
  cholesterol: { label: "Холестерин", mgdlPerMmol: 38.67, molar: "386.65 г/моль" },
};

/** Универсальная газовая постоянная, Дж/(моль·К). */
const R_GAS_CONSTANT = 8.314462618;
/** 1 мм рт. ст. в кПа. */
const MMHG_TO_KPA = 0.133322387415;

export class CalculatorValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CalculatorValidationError";
  }
}

export function listCalculators() {
  return CALCULATORS.map((item) => ({
    ...item,
    fields: item.fields.map((field) => ({
      ...field,
      ...(field.options ? { options: field.options.map((option) => ({ ...option })) } : {}),
    })),
  }));
}

export function getCalculator(id) {
  return listCalculators().find((item) => item.id === String(id)) || null;
}

function roundTo(value, places = 2) {
  const factor = 10 ** places;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(value) + Number.EPSILON) * factor) / factor;
}

function fmt(value, places = 2) {
  return roundTo(value, places).toFixed(places);
}

function fmtRange(low, high, places = 1) {
  return `${fmt(low, places)}–${fmt(high, places)}`;
}

/** Число для показа в результате: очень малые/большие — в экспоненциальной форме. */
function formatNumber(value, places = 4) {
  if (!Number.isFinite(value)) return String(value);
  if (value !== 0 && (Math.abs(value) < 1e-3 || Math.abs(value) >= 1e6)) {
    return value.toExponential(3);
  }
  return roundTo(value, places);
}

function step(label, formula, value) {
  return { label, formula: String(formula), value: String(value) };
}

export function computeCalculator(id, input) {
  const definition = getCalculator(id);
  if (!definition) throw new CalculatorValidationError("Калькулятор не найден");
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CalculatorValidationError("Некорректные входные данные");
  }

  const labelOf = (key) => {
    const field = definition.fields.find((item) => item.key === key);
    return field ? field.label : key;
  };

  const value = (key, required = true) => {
    const raw = input[key];
    if (raw === undefined || raw === null || raw === "") {
      if (required) throw new CalculatorValidationError(`Поле «${labelOf(key)}» обязательно`);
      return 0;
    }
    if ((typeof raw !== "number" && typeof raw !== "string") || String(raw).trim() === "") {
      throw new CalculatorValidationError(`Поле «${labelOf(key)}» должно быть числом`);
    }
    const number = Number(raw);
    if (!Number.isFinite(number)) throw new CalculatorValidationError(`Поле «${labelOf(key)}» должно быть числом`);
    return number;
  };

  const given = (key) => {
    const raw = input[key];
    return raw !== undefined && raw !== null && String(raw).trim() !== "";
  };

  let result = {};
  let interpretation = "";
  let warnings = [];
  let notes = [];
  let steps = [];
  let approximate = false;

  switch (id) {
    case "bmi": {
      const weight = value("weight_kg");
      const height = value("height_cm");
      if (height <= 0) throw new CalculatorValidationError("Рост должен быть больше нуля");
      const heightM = height / 100;
      const bmi = weight / (heightM ** 2);
      result = { "ИМТ": roundTo(bmi) };
      interpretation = bmi < 18.5
        ? "Ниже обычного диапазона взрослого ИМТ."
        : bmi < 25
          ? "Диапазон 18.5–24.9."
          : bmi < 30
            ? "Диапазон избыточной массы тела."
            : "Диапазон ожирения по ИМТ.";
      steps = [
        step("Рост в метрах", `рост = ${fmt(height, 1)} см / 100`, `${roundTo(heightM, 4)} м`),
        step("Квадрат роста", `рост² = ${roundTo(heightM, 4)}²`, `${roundTo(heightM ** 2, 4)} м²`),
        step("ИМТ", `ИМТ = масса / рост² = ${fmt(weight, 1)} / ${roundTo(heightM ** 2, 4)}`, `${roundTo(bmi, 2)} кг/м²`),
      ];
      notes = ["ИМТ не учитывает состав тела и не является диагнозом."];
      break;
    }
    case "bsa": {
      const weight = value("weight_kg");
      const height = value("height_cm");
      const product = weight * height;
      const bsa = Math.sqrt(product / 3600);
      result = { "ППТ, м²": roundTo(bsa) };
      interpretation = "Формула Mosteller, справочный расчёт.";
      steps = [
        step("Произведение массы и роста", `масса × рост = ${fmt(weight, 1)} × ${fmt(height, 1)}`, `${roundTo(product, 2)}`),
        step("Деление на 3600", `${roundTo(product, 2)} / 3600`, `${roundTo(product / 3600, 6)}`),
        step("Квадратный корень (Mosteller)", `ППТ = √(${roundTo(product / 3600, 6)})`, `${roundTo(bsa, 2)} м²`),
      ];
      notes = ["Формула Mosteller — приближённая оценка; для детей и крайних значений массы точность ниже."];
      break;
    }
    case "ckd_epi_2021": {
      const age = value("age");
      const scr = value("creatinine_mg_dl");
      const sex = String(input.sex ?? "");
      if (age < 18 || scr <= 0 || !["female", "male"].includes(sex)) {
        throw new CalculatorValidationError("Проверьте возраст, креатинин и пол");
      }
      const k = sex === "female" ? 0.7 : 0.9;
      const alpha = sex === "female" ? -0.241 : -0.302;
      const ratio = scr / k;
      let egfr = 142 * (Math.min(ratio, 1) ** alpha) * (Math.max(ratio, 1) ** -1.2) * (0.9938 ** age);
      if (sex === "female") egfr *= 1.012;
      result = { "СКФ, мл/мин/1.73 м²": roundTo(egfr) };
      interpretation = "CKD-EPI 2021, интерпретировать с учётом клинического контекста.";
      steps = [
        step("Коэффициент k по полу", `k = ${k} (${sex === "female" ? "женский" : "мужской"})`, String(k)),
        step("Показатель степени α по полу", `α = ${alpha}`, String(alpha)),
        step("Отношение креатинина к k", `Scr / k = ${fmt(scr, 2)} / ${k}`, `${roundTo(ratio, 4)}`),
        step(
          "Формула CKD-EPI 2021",
          `142 × min(Scr/k, 1)^${alpha} × max(Scr/k, 1)^−1.2 × 0.9938^${age}${sex === "female" ? " × 1.012" : ""}`,
          `${roundTo(egfr, 2)} мл/мин/1.73 м²`
        ),
      ];
      notes = ["CKD-EPI 2021 применима к взрослым со стабильным креатинином; при остром повреждении почек оценка ненадёжна."];
      break;
    }
    case "cockcroft_gault": {
      const age = value("age");
      const weight = value("weight_kg");
      const scr = value("creatinine_mg_dl");
      const sex = String(input.sex ?? "");
      if (age <= 0 || weight <= 0 || scr <= 0 || !["female", "male"].includes(sex)) {
        throw new CalculatorValidationError("Проверьте входные данные");
      }
      const numerator = (140 - age) * weight;
      const denominator = 72 * scr;
      let crcl = numerator / denominator;
      if (sex === "female") crcl *= 0.85;
      result = { "CrCl, мл/мин": roundTo(crcl) };
      interpretation = "Cockcroft–Gault; для дозировок учитывайте локальные рекомендации и клинический контекст.";
      steps = [
        step("Числитель", `(140 − возраст) × масса = (140 − ${fmt(age, 0)}) × ${fmt(weight, 1)}`, `${roundTo(numerator, 2)}`),
        step("Знаменатель", `72 × креатинин = 72 × ${fmt(scr, 2)}`, `${roundTo(denominator, 2)}`),
        step(
          "CrCl",
          `CrCl = ${roundTo(numerator, 2)} / ${roundTo(denominator, 2)}${sex === "female" ? " × 0.85" : ""}`,
          `${roundTo(crcl, 2)} мл/мин`
        ),
      ];
      notes = ["Cockcroft–Gault использует фактическую массу тела; при ожирении и отёках результат может смещаться."];
      break;
    }
    case "anion_gap": {
      const sodium = value("sodium");
      const chloride = value("chloride");
      const bicarbonate = value("bicarbonate");
      const anionGap = sodium - chloride - bicarbonate;
      const albumin = value("albumin", false);
      const corrected = albumin > 0 ? anionGap + 2.5 * (4 - albumin) : anionGap;
      result = { "Анионная разница": roundTo(anionGap) };
      steps = [
        step("Анионная разница", `AG = Na⁺ − Cl⁻ − HCO₃⁻ = ${fmt(sodium, 1)} − ${fmt(chloride, 1)} − ${fmt(bicarbonate, 1)}`, `${roundTo(anionGap, 2)} ммоль/л`),
      ];
      if (albumin > 0) {
        result["AG с поправкой на альбумин"] = roundTo(corrected);
        steps.push(
          step("Поправка на альбумин", `AGкорр = AG + 2.5 × (4 − альбумин) = ${roundTo(anionGap, 2)} + 2.5 × (4 − ${fmt(albumin, 1)})`, `${roundTo(corrected, 2)} ммоль/л`)
        );
      }
      interpretation = "Без K⁺. Референсы зависят от метода лаборатории.";
      notes = ["Нормальная анионная разница обычно 8–12 ммоль/л; уточняйте референс лаборатории."];
      break;
    }
    case "corrected_calcium": {
      const calcium = value("calcium_mg_dl");
      const albumin = value("albumin_g_dl");
      const corrected = calcium + 0.8 * (4 - albumin);
      result = { "Скорректированный Ca, мг/дл": roundTo(corrected) };
      interpretation = "Приближённая коррекция общего Ca при изменении альбумина.";
      steps = [
        step("Дефицит альбумина", `4 − альбумин = 4 − ${fmt(albumin, 1)}`, `${roundTo(4 - albumin, 1)} г/дл`),
        step("Поправка", `0.8 × (4 − альбумин) = 0.8 × ${roundTo(4 - albumin, 1)}`, `${roundTo(0.8 * (4 - albumin), 2)} мг/дл`),
        step("Скорректированный Ca", `${fmt(calcium, 1)} + ${roundTo(0.8 * (4 - albumin), 2)}`, `${roundTo(corrected, 2)} мг/дл`),
      ];
      notes = ["Формула приближённая; при выраженной гипоальбуминемии и болезнях печени точность ниже."];
      approximate = true;
      break;
    }
    case "serum_osmolality": {
      const sodium = value("sodium");
      const glucose = value("glucose_mg_dl");
      const bun = value("bun_mg_dl");
      const sodiumPart = 2 * sodium;
      const glucosePart = glucose / 18;
      const bunPart = bun / 2.8;
      result = { "Расчётная осмолярность, мОсм/кг": roundTo(sodiumPart + glucosePart + bunPart) };
      interpretation = "Расчётная, а не измеренная осмолярность.";
      steps = [
        step("Вклад натрия", `2 × Na⁺ = 2 × ${fmt(sodium, 1)}`, `${roundTo(sodiumPart, 1)} мОсм/кг`),
        step("Вклад глюкозы", `глюкоза / 18 = ${fmt(glucose, 0)} / 18`, `${roundTo(glucosePart, 1)} мОсм/кг`),
        step("Вклад BUN", `BUN / 2.8 = ${fmt(bun, 0)} / 2.8`, `${roundTo(bunPart, 1)} мОсм/кг`),
        step("Сумма", `${roundTo(sodiumPart, 1)} + ${roundTo(glucosePart, 1)} + ${roundTo(bunPart, 1)}`, `${roundTo(sodiumPart + glucosePart + bunPart, 1)} мОсм/кг`),
      ];
      notes = ["Формула не учитывает другие осмотически активные вещества (маннит, этанол, кетоны)."];
      approximate = true;
      break;
    }
    case "infusion_rate": {
      const volume = value("volume_ml");
      const hours = value("time_hours");
      const drop = value("drop_factor");
      if (hours <= 0 || drop <= 0) {
        throw new CalculatorValidationError("Время и капельный фактор должны быть больше нуля");
      }
      const mlPerHour = volume / hours;
      const dropsPerMinute = (volume * drop) / (hours * 60);
      result = {
        "мл/ч": roundTo(mlPerHour),
        "капель/мин": roundTo(dropsPerMinute, 0),
      };
      interpretation = "Справочный расчёт скорости инфузии.";
      steps = [
        step("Скорость, мл/ч", `объём / время = ${fmt(volume, 0)} / ${fmt(hours, 1)}`, `${roundTo(mlPerHour, 2)} мл/ч`),
        step("Капли в минуту", `(объём × капельный фактор) / (время × 60) = (${fmt(volume, 0)} × ${fmt(drop, 0)}) / (${fmt(hours, 1)} × 60)`, `${roundTo(dropsPerMinute, 0)} капель/мин`),
      ];
      notes = ["Капельный фактор зависит от системы (обычно 20 капель/мл для макрокапель)."];
      break;
    }
    case "abg": {
      const ph = value("ph");
      const paco2 = value("paco2_mm_hg");
      const hco3 = value("hco3_mmol_l");
      const sodium = given("sodium") ? value("sodium") : null;
      const chloride = given("chloride") ? value("chloride") : null;
      const albumin = given("albumin_g_dl") ? value("albumin_g_dl") : null;
      const lactate = given("lactate_mmol_l") ? value("lactate_mmol_l") : null;

      if (ph < 6.5 || ph > 8) throw new CalculatorValidationError("pH должен быть в диапазоне 6.5–8.0");
      if (paco2 < 5 || paco2 > 150) throw new CalculatorValidationError("PaCO₂ должен быть в диапазоне 5–150 мм рт. ст.");
      if (hco3 < 1 || hco3 > 60) throw new CalculatorValidationError("HCO₃⁻ должен быть в диапазоне 1–60 ммоль/л");
      if (sodium !== null && (sodium < 80 || sodium > 220)) throw new CalculatorValidationError("Na⁺ должен быть в диапазоне 80–220 ммоль/л");
      if (chloride !== null && (chloride < 40 || chloride > 180)) throw new CalculatorValidationError("Cl⁻ должен быть в диапазоне 40–180 ммоль/л");
      if (albumin !== null && (albumin < 0.5 || albumin > 8)) throw new CalculatorValidationError("Альбумин должен быть в диапазоне 0.5–8 г/дл");
      if (lactate !== null && (lactate < 0 || lactate > 40)) throw new CalculatorValidationError("Лактат должен быть в диапазоне 0–40 ммоль/л");

      const acidemia = ph < 7.35;
      const alkalemia = ph > 7.45;
      const lowHco3 = hco3 < 22;
      const highHco3 = hco3 > 26;
      const highPco2 = paco2 > 45;
      const lowPco2 = paco2 < 35;

      steps.push(
        step("Оценка pH", `pH = ${fmt(ph, 2)} (референс 7.35–7.45)`, ph < 7.35 ? "ацидемия" : ph > 7.45 ? "алкалемия" : "в пределах референса"),
        step("Оценка PaCO₂", `PaCO₂ = ${fmt(paco2, 1)} мм рт. ст. (референс 35–45)`, paco2 < 35 ? "снижен" : paco2 > 45 ? "повышен" : "в пределах референса"),
        step("Оценка HCO₃⁻", `HCO₃⁻ = ${fmt(hco3, 1)} ммоль/л (референс 22–26)`, hco3 < 22 ? "снижен" : hco3 > 26 ? "повышен" : "в пределах референса")
      );

      let kind = "none";
      let primary;
      if (acidemia && lowHco3 && highPco2) {
        kind = "mixed_acid";
        primary = "Смешанный ацидоз (метаболический + респираторный)";
      } else if (alkalemia && highHco3 && lowPco2) {
        kind = "mixed_alk";
        primary = "Смешанный алкалоз (метаболический + респираторный)";
      } else if (acidemia && lowHco3) {
        kind = "met_acid";
        primary = "Метаболический ацидоз";
      } else if (acidemia && highPco2) {
        kind = "resp_acid";
        primary = "Респираторный ацидоз";
      } else if (alkalemia && highHco3) {
        kind = "met_alk";
        primary = "Метаболический алкалоз";
      } else if (alkalemia && lowPco2) {
        kind = "resp_alk";
        primary = "Респираторный алкалоз";
      } else if (acidemia || alkalemia) {
        kind = "unknown";
        primary = "Изменение pH без типичного паттерна HCO₃⁻/PaCO₂";
      } else if (lowHco3 && lowPco2) {
        kind = "compensated_low";
        primary = "Компенсированный ацидоз (низкие HCO₃⁻ и PaCO₂, pH в норме)";
      } else if (highHco3 && highPco2) {
        kind = "compensated_high";
        primary = "Компенсированный алкалоз (высокие HCO₃⁻ и PaCO₂, pH в норме)";
      } else if (lowHco3) {
        kind = "met_acid";
        primary = "Метаболический ацидоз с компенсацией (pH в норме)";
      } else if (highHco3) {
        kind = "met_alk";
        primary = "Метаболический алкалоз с компенсацией (pH в норме)";
      } else if (highPco2) {
        kind = "resp_acid";
        primary = "Респираторный ацидоз с компенсацией (pH в норме)";
      } else if (lowPco2) {
        kind = "resp_alk";
        primary = "Респираторный алкалоз с компенсацией (pH в норме)";
      } else {
        kind = "none";
        primary = "КЩС в пределах референсных значений";
      }

      steps.push(step("Первичное нарушение", "оценка pH вместе с направлением PaCO₂ и HCO₃⁻", primary));

      let compensation = "";
      let expectedPaCO2 = null;
      let expectedHco3 = null;

      if (kind === "mixed_acid" || kind === "mixed_alk") {
        compensation = "при смешанном нарушении формулы компенсации неприменимы";
        steps.push(step("Компенсация", "—", compensation));
      } else if (kind === "met_acid") {
        const expected = 1.5 * hco3 + 8;
        const low = expected - 2;
        const high = expected + 2;
        expectedPaCO2 = fmtRange(low, high);
        steps.push(
          step("Ожидаемая компенсация (Winter)", `PaCO₂ = 1.5 × HCO₃⁻ + 8 ± 2 = 1.5 × ${fmt(hco3, 1)} + 8 ± 2`, `${expectedPaCO2} мм рт. ст.`)
        );
        if (paco2 > high) compensation = "PaCO₂ выше ожидаемого — присоединяется респираторный ацидоз";
        else if (paco2 < low) compensation = "PaCO₂ ниже ожидаемого — присоединяется респираторный алкалоз";
        else compensation = "PaCO₂ в пределах ожидаемого по Winter";
        steps.push(step("Сравнение с фактическим PaCO₂", `факт PaCO₂ = ${fmt(paco2, 1)} мм рт. ст.; ожидаемо ${expectedPaCO2}`, compensation));
      } else if (kind === "met_alk") {
        const expected = 0.7 * hco3 + 21;
        const low = expected - 2;
        const high = expected + 2;
        expectedPaCO2 = fmtRange(low, high);
        steps.push(
          step("Ожидаемая компенсация при метаболическом алкалозе", `PaCO₂ = 0.7 × HCO₃⁻ + 21 ± 2 = 0.7 × ${fmt(hco3, 1)} + 21 ± 2`, `${expectedPaCO2} мм рт. ст.`)
        );
        if (paco2 > high) compensation = "PaCO₂ выше ожидаемого — присоединяется респираторный ацидоз";
        else if (paco2 < low) compensation = "PaCO₂ ниже ожидаемого — присоединяется респираторный алкалоз";
        else compensation = "PaCO₂ в пределах ожидаемого";
        steps.push(step("Сравнение с фактическим PaCO₂", `факт PaCO₂ = ${fmt(paco2, 1)} мм рт. ст.; ожидаемо ${expectedPaCO2}`, compensation));
      } else if (kind === "resp_acid") {
        const acute = 24 + 0.1 * (paco2 - 40);
        const chronic = 24 + 0.35 * (paco2 - 40);
        expectedHco3 = `${fmt(acute, 1)} (острое) / ${fmt(chronic, 1)} (хроническое)`;
        steps.push(
          step("Ожидаемая компенсация при респираторном ацидозе", `HCO₃⁻ = 24 + 0.1 × (PaCO₂ − 40) остро; 24 + 0.35 × (PaCO₂ − 40) хронически`, `${expectedHco3} ммоль/л`)
        );
        if (hco3 < acute - 1) compensation = "HCO₃⁻ ниже острого ожидания — присоединяется метаболический ацидоз";
        else if (hco3 > chronic + 1) compensation = "HCO₃⁻ выше хронического ожидания — присоединяется метаболический алкалоз";
        else {
          const closer = Math.abs(hco3 - acute) <= Math.abs(hco3 - chronic) ? "острому" : "хроническому";
          compensation = `HCO₃⁻ ближе к ${closer} варианту; без анамнеза острое и хроническое состояние не различить`;
        }
        steps.push(step("Сравнение с фактическим HCO₃⁻", `факт HCO₃⁻ = ${fmt(hco3, 1)} ммоль/л; ожидаемо ${expectedHco3}`, compensation));
      } else if (kind === "resp_alk") {
        const acute = 24 - 0.2 * (40 - paco2);
        const chronic = 24 - 0.4 * (40 - paco2);
        expectedHco3 = `${fmt(acute, 1)} (острое) / ${fmt(chronic, 1)} (хроническое)`;
        steps.push(
          step("Ожидаемая компенсация при респираторном алкалозе", `HCO₃⁻ = 24 − 0.2 × (40 − PaCO₂) остро; 24 − 0.4 × (40 − PaCO₂) хронически`, `${expectedHco3} ммоль/л`)
        );
        if (hco3 < chronic - 1) compensation = "HCO₃⁻ ниже и острого, и хронического ожидания — присоединяется метаболический ацидоз";
        else if (hco3 > acute + 1) compensation = "HCO₃⁻ выше острого ожидания — присоединяется метаболический алкалоз";
        else {
          const closer = Math.abs(hco3 - acute) <= Math.abs(hco3 - chronic) ? "острому" : "хроническому";
          compensation = `HCO₃⁻ ближе к ${closer} варианту; без анамнеза острое и хроническое состояние не различить`;
        }
        steps.push(step("Сравнение с фактическим HCO₃⁻", `факт HCO₃⁻ = ${fmt(hco3, 1)} ммоль/л; ожидаемо ${expectedHco3}`, compensation));
      } else if (kind === "compensated_low") {
        const winter = 1.5 * hco3 + 8;
        const respAlkChronic = 24 - 0.4 * (40 - paco2);
        expectedPaCO2 = fmtRange(winter - 2, winter + 2);
        expectedHco3 = `${fmt(respAlkChronic, 1)} (хроническая респираторная компенсация)`;
        steps.push(
          step("Кандидат 1: метаболический ацидоз", `PaCO₂ = 1.5 × HCO₃⁻ + 8 ± 2`, `${expectedPaCO2} мм рт. ст.`),
          step("Кандидат 2: хронический респираторный алкалоз", `HCO₃⁻ = 24 − 0.4 × (40 − PaCO₂)`, `${fmt(respAlkChronic, 1)} ммоль/л`)
        );
        compensation = "неоднозначно: подходит и метаболический ацидоз с компенсацией, и хронический респираторный алкалоз; нужен анамнез";
      } else if (kind === "compensated_high") {
        const metAlk = 0.7 * hco3 + 21;
        const respAcidChronic = 24 + 0.35 * (paco2 - 40);
        expectedPaCO2 = fmtRange(metAlk - 2, metAlk + 2);
        expectedHco3 = `${fmt(respAcidChronic, 1)} (хроническая респираторная компенсация)`;
        steps.push(
          step("Кандидат 1: метаболический алкалоз", `PaCO₂ = 0.7 × HCO₃⁻ + 21 ± 2`, `${expectedPaCO2} мм рт. ст.`),
          step("Кандидат 2: хронический респираторный ацидоз", `HCO₃⁻ = 24 + 0.35 × (PaCO₂ − 40)`, `${fmt(respAcidChronic, 1)} ммоль/л`)
        );
        compensation = "неоднозначно: подходит и метаболический алкалоз, и хронический респираторный ацидоз; нужен анамнез";
      } else if (kind === "unknown") {
        compensation = "паттерн не соответствует типичному нарушению — проверьте единицы и значения";
        steps.push(step("Компенсация", "—", compensation));
        warnings.push("Комбинация pH, PaCO₂ и HCO₃⁻ не укладывается в типичный паттерн; проверьте единицы и правильность ввода.");
      } else {
        compensation = "не требуется: pH, PaCO₂ и HCO₃⁻ в референсных диапазонах";
        steps.push(step("Компенсация", "—", compensation));
      }

      let ag = null;
      let agCorrected = null;
      if (sodium !== null && chloride !== null) {
        ag = sodium - chloride - hco3;
        steps.push(
          step("Анионная разница", `AG = Na⁺ − Cl⁻ − HCO₃⁻ = ${fmt(sodium, 1)} − ${fmt(chloride, 1)} − ${fmt(hco3, 1)}`, `${fmt(ag, 1)} ммоль/л`)
        );
        if (albumin !== null) {
          agCorrected = ag + 2.5 * (4 - albumin);
          steps.push(
            step("Поправка AG на альбумин", `AGкорр = AG + 2.5 × (4 − альбумин) = ${fmt(ag, 1)} + 2.5 × (4 − ${fmt(albumin, 1)})`, `${fmt(agCorrected, 1)} ммоль/л`)
          );
        }
      } else if (sodium !== null || chloride !== null) {
        warnings.push("Для анионной разницы нужны оба электролита: Na⁺ и Cl⁻.");
      }

      const agForDelta = agCorrected !== null ? agCorrected : ag;
      let deltaRatio = null;
      let deltaText = "";
      if (agForDelta !== null && hco3 < 24) {
        deltaRatio = (agForDelta - 12) / (24 - hco3);
        if (deltaRatio < 0.4) deltaText = "ближе к нормальному (гиперхлоремическому) ацидозу";
        else if (deltaRatio < 1) deltaText = "смешанный нормальный и высокий анионный ацидоз";
        else if (deltaRatio <= 2) deltaText = "чистый высокоанионный ацидоз";
        else deltaText = "дополнительный метаболический алкалоз (или хронический респираторный ацидоз)";
        steps.push(
          step("Delta ratio (приближённо)", `Δ/Δ = (AG − 12) / (24 − HCO₃⁻) = (${fmt(agForDelta, 1)} − 12) / (24 − ${fmt(hco3, 1)})`, `${roundTo(deltaRatio, 2)} — ${deltaText}`)
        );
      }

      const baseExcess = hco3 - 24.4 + 14.8 * (ph - 7.4);
      steps.push(
        step("Base excess (приближённо)", `BE ≈ HCO₃⁻ − 24.4 + 14.8 × (pH − 7.4) = ${fmt(hco3, 1)} − 24.4 + 14.8 × (${fmt(ph, 2)} − 7.4)`, `${fmt(baseExcess, 1)} ммоль/л`)
      );

      if (lactate !== null) {
        steps.push(step("Лактат", `лактат = ${fmt(lactate, 1)} ммоль/л (ориентировочно < 2)`, lactate > 2 ? "повышен" : "в пределах ориентировочной нормы"));
        if (lactate > 2) warnings.push("Лактат повышен: возможен лактацидоз; интерпретируйте вместе с анионной разницей и клиникой.");
      }

      result = {
        "pH": roundTo(ph, 2),
        "PaCO₂, мм рт. ст.": roundTo(paco2, 1),
        "HCO₃⁻, ммоль/л": roundTo(hco3, 1),
        "Первичное нарушение": primary,
        "Компенсация": compensation,
        ...(expectedPaCO2 ? { "Ожидаемый PaCO₂, мм рт. ст.": expectedPaCO2 } : {}),
        ...(expectedHco3 ? { "Ожидаемый HCO₃⁻, ммоль/л": expectedHco3 } : {}),
        ...(ag !== null ? { "Анионная разница": roundTo(ag, 1) } : {}),
        ...(agCorrected !== null ? { "AG с поправкой на альбумин": roundTo(agCorrected, 1) } : {}),
        ...(deltaRatio !== null ? { "Delta ratio": roundTo(deltaRatio, 2) } : {}),
        "Base excess (приближ.), ммоль/л": roundTo(baseExcess, 1),
        ...(lactate !== null ? { "Лактат, ммоль/л": roundTo(lactate, 1) } : {}),
      };

      const sentences = [`Первичное нарушение: ${primary}.`];
      if (compensation) sentences.push(`Компенсация: ${compensation}.`);
      if (ag !== null) sentences.push(`Анионная разница ${fmt(ag, 1)} ммоль/л${ag > 12 ? " (повышена)" : ""}.`);
      if (deltaRatio !== null) sentences.push(`Delta ratio ${roundTo(deltaRatio, 2)}: ${deltaText}.`);
      if (lactate !== null) sentences.push(`Лактат ${fmt(lactate, 1)} ммоль/л.`);
      sentences.push("Расчёт учебный, формулы компенсации приблизительны; референсные диапазоны зависят от лаборатории.");
      interpretation = sentences.join(" ");

      notes = [
        "Референсные диапазоны приняты как pH 7.35–7.45, PaCO₂ 35–45 мм рт. ст., HCO₃⁻ 22–26 ммоль/л; в разных лабораториях они отличаются.",
        "Формулы компенсации (Winter, 0.7 × HCO₃⁻ + 21, 0.1/0.35 и 0.2/0.4) приближённые, рассчитаны для взрослых и неприменимы при смешанных нарушениях.",
        "Base excess рассчитан по HCO₃⁻ и pH без учёта гемоглобина, поэтому может отличаться от лабораторного BE.",
      ];
      if (agForDelta !== null) notes.push("Delta ratio использует нормальную анионную разницу 12 ммоль/л (зависит от лаборатории).");
      approximate = true;
      break;
    }
    case "michaelis_menten": {
      const s = value("substrate");
      const km = value("km");
      const vmax = value("vmax");
      if (s < 0) throw new CalculatorValidationError("Концентрация субстрата не может быть отрицательной");
      if (km <= 0) throw new CalculatorValidationError("Km должна быть больше нуля");
      if (vmax <= 0) throw new CalculatorValidationError("Vmax должна быть больше нуля");
      const denominator = km + s;
      const v = (vmax * s) / denominator;
      const regime = s <= km / 10
        ? "почти первый порядок (S ≪ Km)"
        : s >= km * 10
          ? "почти насыщение (S ≫ Km)"
          : "смешанный режим";
      result = {
        "V, ед. скорости": formatNumber(v, 4),
        "V/Vmax, %": roundTo((v / vmax) * 100, 1),
        "Km/(Km+[S])": roundTo(km / denominator, 4),
      };
      steps = [
        step("Формула Михаэлиса–Ментен", "V = Vmax × [S] / (Km + [S])", "—"),
        step("Подстановка", `V = ${fmt(vmax, 2)} × ${fmt(s, 2)} / (${fmt(km, 2)} + ${fmt(s, 2)})`, "—"),
        step("Знаменатель", `Km + [S] = ${fmt(km, 2)} + ${fmt(s, 2)}`, `${fmt(denominator, 2)}`),
        step("Результат", `V = ${fmt(vmax, 2)} × ${fmt(s, 2)} / ${fmt(denominator, 2)}`, `${formatNumber(v, 4)} ед. скорости`),
        step("Предельные случаи", "[S] ≫ Km → V → Vmax; [S] ≪ Km → V ≈ (Vmax/Km) × [S]", regime),
      ];
      interpretation = `Скорость ${formatNumber(v, 4)} ед.; ${regime}. Km — концентрация субстрата, при которой достигается половина Vmax.`;
      notes = [
        "Модель предполагает один субстрат, стационарное состояние и отсутствие ингибирования/активации; реальные ферменты могут отклоняться.",
        "Km и Vmax должны быть в согласованных единицах; калькулятор не подбирает их по экспериментальным точкам.",
      ];
      break;
    }
    case "arrhenius": {
      const a = value("a");
      const eaKj = value("ea_kj");
      const t = value("temp_k");
      const t2 = given("temp2_k") ? value("temp2_k") : null;
      if (!(a > 0)) throw new CalculatorValidationError("A должна быть больше нуля");
      if (eaKj < 0 || eaKj > 1000) throw new CalculatorValidationError("Ea должна быть в диапазоне 0–1000 кДж/моль");
      if (t < 1 || t > 2000) throw new CalculatorValidationError("Температура должна быть в диапазоне 1–2000 К");
      if (t2 !== null && (t2 < 1 || t2 > 2000)) throw new CalculatorValidationError("Вторая температура должна быть в диапазоне 1–2000 К");

      const eaJ = eaKj * 1000;
      const rt = R_GAS_CONSTANT * t;
      const exponent = -eaJ / rt;
      const k = a * Math.exp(exponent);
      steps = [
        step("Перевод Ea в Дж/моль", `Ea = ${fmt(eaKj, 1)} кДж/моль × 1000`, `${roundTo(eaJ, 1)} Дж/моль`),
        step("Знаменатель R·T", `R = ${R_GAS_CONSTANT} Дж/(моль·К), T = ${fmt(t, 2)} К`, `${roundTo(rt, 2)} Дж/моль`),
        step("Показатель экспоненты", `−Ea / (R·T) = −${roundTo(eaJ, 1)} / ${roundTo(rt, 2)}`, `${roundTo(exponent, 4)}`),
        step("Экспонента", `exp(${roundTo(exponent, 4)})`, `${Math.exp(exponent).toExponential(3)}`),
        step("Итог", `k = A × exp(−Ea/(R·T)) = ${a.toExponential(3)} × ${Math.exp(exponent).toExponential(3)}`, `${formatNumber(k, 6)} ед. k`),
      ];
      result = {
        "k (в единицах A)": formatNumber(k, 6),
        "Ea/(R·T)": roundTo(exponent, 4),
        "R·T, Дж/моль": roundTo(rt, 2),
      };
      interpretation = "Константа скорости рассчитана по уравнению Аррениуса для заданных A и Ea.";
      if (t2 !== null) {
        const k2 = a * Math.exp(-eaJ / (R_GAS_CONSTANT * t2));
        result["k при T₂"] = formatNumber(k2, 6);
        result["k₂ / k₁"] = roundTo(k2 / k, 3);
        steps.push(
          step("Вторая точка", `k₂ = A × exp(−Ea/(R·T₂)) при T₂ = ${fmt(t2, 2)} К`, `${formatNumber(k2, 6)} ед. k`),
          step("Отношение", `k₂ / k₁ = ${formatNumber(k2, 6)} / ${formatNumber(k, 6)}`, `${roundTo(k2 / k, 3)}`)
        );
        if (t2 > t) interpretation += " При более высокой температуре k выше — это ожидаемо для Ea > 0.";
      }
      notes = [
        "A и Ea должны быть известны из эксперимента; калькулятор не оценивает их по точкам k(T).",
        "Модель предполагает постоянную Ea в рассматриваемом диапазоне температур; при денатурации или смене механизма она нарушается.",
      ];
      break;
    }
    case "atp_glucose": {
      const shuttle = String(input.shuttle ?? "range");
      if (!["range", "malate_aspartate", "glycerol_phosphate"].includes(shuttle)) {
        throw new CalculatorValidationError("Выберите шаттл: диапазон, малат-аспартатный или глицерол-3-фосфатный");
      }
      const cytosolPerNadh = shuttle === "glycerol_phosphate" ? 1.5 : 2.5;
      const nadhAtp = 8 * 2.5 + 2 * cytosolPerNadh;
      const fadh2Atp = 2 * 1.5;
      const total = 4 + nadhAtp + fadh2Atp;
      result = {
        "АТФ, всего": shuttle === "range" ? "30–32" : total,
        "Субстратное фосфорилирование": 4,
        "АТФ из NADH": shuttle === "range" ? "23–25" : roundTo(nadhAtp, 1),
        "АТФ из FADH₂": roundTo(fadh2Atp, 1),
        "NADH, всего": 10,
        "FADH₂, всего": 2,
      };
      steps = [
        step("Гликолиз", "глюкоза → 2 пирувата + 2 АТФ + 2 NADH", "2 АТФ + 2 NADH (цитозоль)"),
        step("Пируватдегидрогеназа", "2 пирувата → 2 ацетил-КоА + 2 NADH", "2 NADH (митохондрии)"),
        step("Цикл Кребса", "2 ацетил-КоА → 6 NADH + 2 FADH₂ + 2 ГТФ", "6 NADH + 2 FADH₂ + 2 ГТФ"),
        step("Окислительное фосфорилирование", "NADH × 2.5 АТФ; FADH₂ × 1.5 АТФ (современные P/O)", "10 NADH → 25 АТФ; 2 FADH₂ → 3 АТФ"),
        step(
          "Шаттл цитозольного NADH",
          shuttle === "range"
            ? "малат-аспартатный даёт 2.5 АТФ на NADH, глицерол-3-фосфатный — 1.5"
            : `${shuttle === "malate_aspartate" ? "малат-аспартатный" : "глицерол-3-фосфатный"} шаттл: ${cytosolPerNadh} АТФ на NADH`,
          shuttle === "range" ? "30 или 32 АТФ в зависимости от шаттла" : `${cytosolPerNadh * 2} АТФ за 2 цитозольных NADH`
        ),
        step(
          "Сумма",
          shuttle === "range"
            ? "4 + 8 × 2.5 + 2 × 2.5 + 2 × 1.5 = 32; 4 + 8 × 2.5 + 2 × 1.5 + 2 × 1.5 = 30"
            : `4 + 8 × 2.5 + 2 × ${cytosolPerNadh} + 2 × 1.5`,
          shuttle === "range" ? "30–32 АТФ" : `${total} АТФ`
        ),
      ];
      interpretation = "Полное окисление глюкозы даёт 30–32 АТФ при современных P/O; точное число зависит от шаттла и принятых коэффициентов.";
      notes = [
        "Разброс 30–32 объясняется P/O: 2.5 АТФ на NADH и 1.5 на FADH₂; шаттл цитозольного NADH меняет вклад на 2 АТФ.",
        "В старых учебниках с P/O 3 и 2 получают 36–38 АТФ — это устаревшая оценка, а не ошибка расчёта.",
        "Не учитываются затраты на транспорт субстратов и альтернативные пути (пентозофосфатный цикл).",
      ];
      approximate = true;
      break;
    }
    case "atp_fatty_acid": {
      const n = value("carbons");
      if (!Number.isInteger(n)) throw new CalculatorValidationError("Число атомов углерода должно быть целым");
      if (n % 2 !== 0) throw new CalculatorValidationError("Поддерживаются только чётные цепи: для нечётных нужен отдельный расчёт пропионил-КоА");
      if (n < 4 || n > 28) throw new CalculatorValidationError("Число атомов углерода должно быть от 4 до 28");
      const cycles = n / 2 - 1;
      const acetyl = n / 2;
      const atpFromCycles = cycles * (2.5 + 1.5);
      const atpFromAcetyl = acetyl * 10;
      const total = atpFromCycles + atpFromAcetyl - 2;
      result = {
        "Циклов β-окисления": cycles,
        "Ацетил-КоА, шт.": acetyl,
        "АТФ из циклов": roundTo(atpFromCycles, 1),
        "АТФ из ацетил-КоА": roundTo(atpFromAcetyl, 1),
        "АТФ, всего": roundTo(total, 1),
      };
      steps = [
        step("Активация жирной кислоты", "ЖК + КоА + АТФ → ацил-КоА + АМФ + PPi", "−2 АТФ"),
        step("Число циклов β-окисления", `n/2 − 1 = ${n}/2 − 1`, `${cycles}`),
        step("Число ацетил-КоА", `n/2 = ${n}/2`, `${acetyl}`),
        step("Выход одного цикла", "1 FADH₂ (1.5) + 1 NADH (2.5) + 1 ацетил-КоА (10) = 14 АТФ", "14 АТФ за цикл, включая ацетил-КоА"),
        step("Сумма", `${cycles} × 4 + ${acetyl} × 10 − 2`, `${roundTo(total, 1)} АТФ`),
      ];
      interpretation = `Для насыщенной чётной ЖК с ${n} атомами углерода — ${roundTo(total, 1)} АТФ (с учётом затрат на активацию).`;
      notes = [
        "Приняты P/O 2.5 для NADH и 1.5 для FADH₂; каждый ацетил-КоА даёт 10 АТФ в цикле Кребса и окислительном фосфорилировании.",
        "Не учитываются ненасыщенные связи (каждая снижает выход) и окисление нечётных цепей через пропионил-КоА.",
      ];
      approximate = true;
      break;
    }
    case "concentration_units": {
      const analyte = String(input.analyte ?? "");
      const direction = String(input.direction ?? "");
      const raw = value("value");
      const spec = ANALYTES[analyte];
      if (!spec) throw new CalculatorValidationError("Выберите показатель: глюкоза, мочевина, креатинин или холестерин");
      if (!["to_si", "from_si"].includes(direction)) {
        throw new CalculatorValidationError("Выберите направление: mg/dL → ммоль/л или ммоль/л → mg/dL");
      }
      if (raw < 0) throw new CalculatorValidationError("Значение должно быть неотрицательным");
      if (raw > 100000) throw new CalculatorValidationError("Значение слишком велико для пересчёта");
      const toSi = direction === "to_si";
      const converted = toSi ? raw / spec.mgdlPerMmol : raw * spec.mgdlPerMmol;
      result = toSi
        ? {
            "Результат, ммоль/л": roundTo(converted, 3),
            "Коэффициент (mg/dL на 1 ммоль/л)": spec.mgdlPerMmol,
          }
        : {
            "Результат, mg/dL": roundTo(converted, 2),
            "Коэффициент (mg/dL на 1 ммоль/л)": spec.mgdlPerMmol,
          };
      steps = [
        step("Коэффициент пересчёта", `1 ммоль/л = ${spec.mgdlPerMmol} mg/dL (M = ${spec.molar})`, String(spec.mgdlPerMmol)),
        step(
          toSi ? "Перевод в ммоль/л" : "Перевод в mg/dL",
          toSi
            ? `ммоль/л = mg/dL / ${spec.mgdlPerMmol} = ${fmt(raw, 2)} / ${spec.mgdlPerMmol}`
            : `mg/dL = ммоль/л × ${spec.mgdlPerMmol} = ${fmt(raw, 3)} × ${spec.mgdlPerMmol}`,
          toSi ? `${fmt(converted, 3)} ммоль/л` : `${fmt(converted, 2)} mg/dL`
        ),
      ];
      interpretation = `Пересчёт «${spec.label}»: ${toSi ? `${fmt(raw, 2)} mg/dL = ${fmt(converted, 3)} ммоль/л` : `${fmt(raw, 3)} ммоль/л = ${fmt(converted, 2)} mg/dL`}.`;
      notes = [
        "Коэффициенты получены из молярных масс и округлены; лаборатории могут использовать 18.0 (глюкоза), 11.3 (креатинин), 38.7 (холестерин).",
        "Пересчёт не заменяет лабораторные референсы: единицы и коэффициенты уточняйте в бланке.",
      ];
      if (analyte === "urea") {
        notes.unshift("Коэффициент 6.006 относится к мочевине целиком; для азота мочевины (BUN) используется коэффициент 2.8 — это другой показатель.");
      }
      approximate = true;
      break;
    }
    case "pressure_units": {
      const direction = String(input.direction ?? "");
      const raw = value("value");
      if (!["mmhg_to_kpa", "kpa_to_mmhg"].includes(direction)) {
        throw new CalculatorValidationError("Выберите направление: мм рт. ст. → кПа или кПа → мм рт. ст.");
      }
      if (raw < 0) throw new CalculatorValidationError("Давление не может быть отрицательным");
      if (raw > 10000) throw new CalculatorValidationError("Значение слишком велико для пересчёта");
      const toKpa = direction === "mmhg_to_kpa";
      const converted = toKpa ? raw * MMHG_TO_KPA : raw / MMHG_TO_KPA;
      result = toKpa
        ? {
            "Результат, кПа": roundTo(converted, 3),
            "Коэффициент (кПа на 1 мм рт. ст.)": roundTo(MMHG_TO_KPA, 6),
          }
        : {
            "Результат, мм рт. ст.": roundTo(converted, 2),
            "Коэффициент (мм рт. ст. на 1 кПа)": roundTo(1 / MMHG_TO_KPA, 6),
          };
      steps = [
        step("Соотношение единиц", "1 мм рт. ст. = 0.133322 кПа", `${roundTo(MMHG_TO_KPA, 6)} кПа`),
        step(
          toKpa ? "Перевод в кПа" : "Перевод в мм рт. ст.",
          toKpa
            ? `кПа = мм рт. ст. × 0.133322 = ${fmt(raw, 2)} × 0.133322`
            : `мм рт. ст. = кПа / 0.133322 = ${fmt(raw, 3)} / 0.133322`,
          toKpa ? `${fmt(converted, 3)} кПа` : `${fmt(converted, 2)} мм рт. ст.`
        ),
      ];
      interpretation = toKpa
        ? `${fmt(raw, 2)} мм рт. ст. ≈ ${fmt(converted, 3)} кПа.`
        : `${fmt(raw, 3)} кПа ≈ ${fmt(converted, 2)} мм рт. ст.`;
      notes = [
        "Пересчёт линейный; коэффициент округлён. В физиологии часто используют 1 мм рт. ст. ≈ 0.1333 кПа.",
        "Давление в дыхательных путях и газах крови может выражаться в обеих единицах — сверяйте единицы бланка.",
      ];
      approximate = true;
      break;
    }
    default:
      throw new CalculatorValidationError("Неизвестный калькулятор");
  }

  return { id, result, interpretation, warnings, steps, approximate, notes };
}
