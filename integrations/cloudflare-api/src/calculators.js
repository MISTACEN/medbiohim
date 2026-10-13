/**
 * Stateless medical-study calculators ported from backend/src/Services/CalculatorsService.php.
 * Keep formulas and response keys aligned with the PHP API; no result is persisted.
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
];

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

export function computeCalculator(id, input) {
  if (!getCalculator(id)) throw new CalculatorValidationError("Калькулятор не найден");
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CalculatorValidationError("Некорректные входные данные");
  }

  const value = (key, required = true) => {
    const raw = input[key];
    if (raw === undefined || raw === null || raw === "") {
      if (required) throw new CalculatorValidationError(`Поле ${key} обязательно`);
      return 0;
    }
    if ((typeof raw !== "number" && typeof raw !== "string") || String(raw).trim() === "") {
      throw new CalculatorValidationError(`Поле ${key} должно быть числом`);
    }
    const number = Number(raw);
    if (!Number.isFinite(number)) throw new CalculatorValidationError(`Поле ${key} должно быть числом`);
    return number;
  };

  let result = {};
  let interpretation = "";

  switch (id) {
    case "bmi": {
      const weight = value("weight_kg");
      const height = value("height_cm");
      if (height <= 0) throw new CalculatorValidationError("Рост должен быть больше нуля");
      const bmi = weight / ((height / 100) ** 2);
      result = { "ИМТ": roundTo(bmi) };
      interpretation = bmi < 18.5
        ? "Ниже обычного диапазона взрослого ИМТ."
        : bmi < 25
          ? "Диапазон 18.5–24.9."
          : bmi < 30
            ? "Диапазон избыточной массы тела."
            : "Диапазон ожирения по ИМТ.";
      break;
    }
    case "bsa": {
      const weight = value("weight_kg");
      const height = value("height_cm");
      const bsa = Math.sqrt((weight * height) / 3600);
      result = { "ППТ, м²": roundTo(bsa) };
      interpretation = "Формула Mosteller, справочный расчёт.";
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
      let egfr = 142 * (Math.min(scr / k, 1) ** alpha) * (Math.max(scr / k, 1) ** -1.2) * (0.9938 ** age);
      if (sex === "female") egfr *= 1.012;
      result = { "СКФ, мл/мин/1.73 м²": roundTo(egfr) };
      interpretation = "CKD-EPI 2021, интерпретировать с учётом клинического контекста.";
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
      let crcl = ((140 - age) * weight) / (72 * scr);
      if (sex === "female") crcl *= 0.85;
      result = { "CrCl, мл/мин": roundTo(crcl) };
      interpretation = "Cockcroft–Gault; для дозировок учитывайте локальные рекомендации и клинический контекст.";
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
      if (albumin > 0) result["AG с поправкой на альбумин"] = roundTo(corrected);
      interpretation = "Без K⁺. Референсы зависят от метода лаборатории.";
      break;
    }
    case "corrected_calcium": {
      const calcium = value("calcium_mg_dl");
      const albumin = value("albumin_g_dl");
      result = { "Скорректированный Ca, мг/дл": roundTo(calcium + 0.8 * (4 - albumin)) };
      interpretation = "Приближённая коррекция общего Ca при изменении альбумина.";
      break;
    }
    case "serum_osmolality": {
      const sodium = value("sodium");
      const glucose = value("glucose_mg_dl");
      const bun = value("bun_mg_dl");
      result = { "Расчётная осмолярность, мОсм/кг": roundTo(2 * sodium + glucose / 18 + bun / 2.8) };
      interpretation = "Расчётная, а не измеренная осмолярность.";
      break;
    }
    case "infusion_rate": {
      const volume = value("volume_ml");
      const hours = value("time_hours");
      const drop = value("drop_factor");
      if (hours <= 0 || drop <= 0) {
        throw new CalculatorValidationError("Время и капельный фактор должны быть больше нуля");
      }
      result = {
        "мл/ч": roundTo(volume / hours),
        "капель/мин": roundTo((volume * drop) / (hours * 60), 0),
      };
      interpretation = "Справочный расчёт скорости инфузии.";
      break;
    }
    default:
      throw new CalculatorValidationError("Неизвестный калькулятор");
  }

  return { id, result, interpretation, warnings: [] };
}
