/**
 * H7: расчётное ядро виртуальной лаборатории.
 *
 * Три симуляции считают реальные равновесия, а не подбирают красивые числа:
 * - титрование: кривая pH из уравнения электронейтральности (сильная и
 *   слабая кислота / сильное основание), точка эквивалентности, индикатор;
 * - электрохимия: уравнение Нернста по таблице стандартных потенциалов,
 *   ЭДС, ΔG° и направление реакции;
 * - спектроскопия: закон Бугера–Ламберта–Бера, пропускание, обратный расчёт
 *   концентрации и границы линейности.
 *
 * Все приближения перечислены в notes/протоколе: активности заменены
 * концентрациями, температура 25 °C, объёмы аддитивны.
 */

export const KW = 1e-14;
export const GAS_CONSTANT = 8.314462618; // Дж/(моль·К)
export const FARADAY = 96485.33212; // Кл/моль

/* -------------------------------------------------------------------------- */
/* Титрование                                                                 */
/* -------------------------------------------------------------------------- */

export type AnalyteKind = "strong_acid" | "weak_acid" | "strong_base" | "weak_base";

export const ANALYTE_LABEL: Record<AnalyteKind, string> = {
  strong_acid: "Сильная кислота (HCl)",
  weak_acid: "Слабая кислота (CH₃COOH)",
  strong_base: "Сильное основание (NaOH)",
  weak_base: "Слабое основание (NH₃)",
};

/** Справочные константы (25 °C): Ka кислоты или Ka сопряжённой кислоты. */
export const WEAK_ACIDS = [
  { id: "acetic", label: "Уксусная (CH₃COOH)", ka: 1.8e-5, pka: 4.76 },
  { id: "formic", label: "Муравьиная (HCOOH)", ka: 1.8e-4, pka: 3.75 },
  { id: "benzoic", label: "Бензойная (C₆H₅COOH)", ka: 6.3e-5, pka: 4.2 },
] as const;

export const WEAK_BASES = [
  { id: "ammonia", label: "Аммиак (NH₃)", kaConjugate: 5.6e-10, pkaConjugate: 9.25 },
] as const;

export type TitrationInput = {
  analyte: AnalyteKind;
  /** Концентрация определяемого вещества, моль/л. */
  analyteConcentration: number;
  /** Аликвота, мл. */
  analyteVolumeMl: number;
  /** Концентрация титранта, моль/л. */
  titrantConcentration: number;
  /** Ka для слабой кислоты / Ka сопряжённой кислоты для слабого основания. */
  ka?: number;
  /** Сколько точек кривой считать (по умолчанию 81). */
  points?: number;
};

export type TitrationPoint = { volumeMl: number; ph: number };

export type TitrationResult = {
  equivalenceVolumeMl: number;
  equivalencePh: number;
  points: TitrationPoint[];
  indicators: Array<{ name: string; range: string; recommended: boolean; reason: string }>;
  notes: string[];
  warnings: string[];
};

export const INDICATORS = [
  { name: "Метиловый оранжевый", from: 3.1, to: 4.4 },
  { name: "Бромтимоловый синий", from: 6.0, to: 7.6 },
  { name: "Фенолфталеин", from: 8.2, to: 10.0 },
] as const;

function assertPositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label}: нужно положительное число`);
}

/** Корень f(h)=0 бисекцией по [1e-14, 10]; f монотонно возрастает. */
function solveProtonConcentration(f: (h: number) => number): number {
  let low = 1e-14;
  let high = 10;
  let fLow = f(low);
  let fHigh = f(high);
  if (fLow === 0) return low;
  if (fHigh === 0) return high;
  if (fLow > 0) return low;
  if (fHigh < 0) return high;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const mid = Math.sqrt(low * high); // геометрическая середина: pH-шкала логарифмическая
    const value = f(mid);
    if (value === 0) return mid;
    if ((fLow < 0) === (value < 0)) {
      low = mid;
      fLow = value;
    } else {
      high = mid;
      fHigh = value;
    }
    if (high / low < 1 + 1e-12) break;
  }
  return Math.sqrt(low * high);
}

/**
 * pH при заданном объёме титранта. Уравнение электронейтральности решается
 * численно, поэтому буферная область и скачок у эквивалентности получаются
 * сами, без отдельных формул для каждого участка.
 */
function phAtVolume(input: TitrationInput, titrantVolumeMl: number): number {
  const analyteMoles = (input.analyteConcentration * input.analyteVolumeMl) / 1000;
  const titrantMoles = (input.titrantConcentration * titrantVolumeMl) / 1000;
  const totalLiters = (input.analyteVolumeMl + titrantVolumeMl) / 1000;
  const ca = analyteMoles / totalLiters;
  const ct = titrantMoles / totalLiters;
  const isAcid = input.analyte === "strong_acid" || input.analyte === "weak_acid";

  let f: (h: number) => number;
  if (isAcid) {
    // [H+] + [Na+] = [OH−] + [A−]
    const ka = input.analyte === "weak_acid" ? (input.ka as number) : 0;
    f = (h) => {
      const anion = input.analyte === "weak_acid" ? (ca * ka) / (ka + h) : ca;
      return h + ct - KW / h - anion;
    };
  } else {
    // [H+] + [BH+] = [OH−] + [Cl−]
    const ka = input.analyte === "weak_base" ? (input.ka as number) : 0;
    f = (h) => {
      const cation = input.analyte === "weak_base" ? (ca * h) / (ka + h) : ca;
      return h + cation - KW / h - ct;
    };
  }
  return -Math.log10(solveProtonConcentration(f));
}

export function titrate(input: TitrationInput): TitrationResult {
  assertPositive(input.analyteConcentration, "Концентрация аликвоты");
  assertPositive(input.analyteVolumeMl, "Объём аликвоты");
  assertPositive(input.titrantConcentration, "Концентрация титранта");
  if (input.analyte === "weak_acid" || input.analyte === "weak_base") {
    if (!input.ka || !Number.isFinite(input.ka) || input.ka <= 0) {
      throw new Error("Для слабого электролита нужна константа Ka");
    }
  }

  const analyteMoles = (input.analyteConcentration * input.analyteVolumeMl) / 1000;
  const equivalenceVolumeMl = (analyteMoles / input.titrantConcentration) * 1000;
  const maxVolume = Math.max(equivalenceVolumeMl * 1.5, equivalenceVolumeMl + 1);
  const steps = Math.min(401, Math.max(21, Math.floor(input.points ?? 81)));

  const points: TitrationPoint[] = [];
  for (let index = 0; index < steps; index += 1) {
    const volumeMl = (maxVolume * index) / (steps - 1);
    points.push({ volumeMl, ph: phAtVolume(input, volumeMl) });
  }
  // Точка эквивалентности — обязательная точка графика, а не «между ними».
  points.push({ volumeMl: equivalenceVolumeMl, ph: phAtVolume(input, equivalenceVolumeMl) });
  points.sort((a, b) => a.volumeMl - b.volumeMl);

  const equivalencePh = phAtVolume(input, equivalenceVolumeMl);
  const indicators = INDICATORS.map((indicator) => {
    const matches = equivalencePh >= indicator.from && equivalencePh <= indicator.to;
    const distance = Math.min(
      Math.abs(equivalencePh - indicator.from),
      Math.abs(equivalencePh - indicator.to),
    );
    return {
      name: indicator.name,
      range: `${indicator.from.toString().replace(".", ",")}–${indicator.to.toString().replace(".", ",")}`,
      recommended: false,
      distance,
      matches,
    };
  });
  const nearest = [...indicators].sort((a, b) => {
    if (a.matches !== b.matches) return a.matches ? -1 : 1;
    return a.distance - b.distance;
  })[0];
  const resultIndicators = indicators.map((indicator) => ({
    name: indicator.name,
    range: indicator.range,
    recommended: indicator.name === nearest.name,
    reason: indicator.matches
      ? `интервал перехода ${indicator.range} накрывает pH эквивалентности ${equivalencePh.toFixed(2)}`
      : `интервал ${indicator.range} не совпадает с pH ${equivalencePh.toFixed(2)}${indicator.name === nearest.name ? " (ближайший)" : ""}`,
  }));

  const notes = [
    "Активности заменены концентрациями, температура 25 °C, Kw = 1,0·10⁻¹⁴.",
    "Объёмы аддитивны; CO₂ из воздуха и разбавление при смешивании не учтены.",
  ];
  const warnings: string[] = [];
  if (equivalencePh > 10.5 || equivalencePh < 3.5) {
    warnings.push("Скачок pH очень резкий: вблизи эквивалентности нужна бюретка с малым шагом.");
  }

  return {
    equivalenceVolumeMl,
    equivalencePh,
    points,
    indicators: resultIndicators,
    notes,
    warnings,
  };
}

/* -------------------------------------------------------------------------- */
/* Электрохимия                                                               */
/* -------------------------------------------------------------------------- */

export type StandardPotential = {
  id: string;
  label: string;
  /** Восстановительный потенциал, В (относительно SHE). */
  e0: number;
  /** Число электронов в полуреакции. */
  electrons: number;
};

/** Стандартные восстановительные потенциалы при 25 °C (IUPAC-значения). */
export const STANDARD_POTENTIALS: StandardPotential[] = [
  { id: "li", label: "Li⁺/Li", e0: -3.0401, electrons: 1 },
  { id: "k", label: "K⁺/K", e0: -2.931, electrons: 1 },
  { id: "ca", label: "Ca²⁺/Ca", e0: -2.868, electrons: 2 },
  { id: "na", label: "Na⁺/Na", e0: -2.71, electrons: 1 },
  { id: "mg", label: "Mg²⁺/Mg", e0: -2.372, electrons: 2 },
  { id: "al", label: "Al³⁺/Al", e0: -1.662, electrons: 3 },
  { id: "zn", label: "Zn²⁺/Zn", e0: -0.7618, electrons: 2 },
  { id: "fe2", label: "Fe²⁺/Fe", e0: -0.44, electrons: 2 },
  { id: "ni", label: "Ni²⁺/Ni", e0: -0.257, electrons: 2 },
  { id: "sn", label: "Sn²⁺/Sn", e0: -0.1375, electrons: 2 },
  { id: "pb", label: "Pb²⁺/Pb", e0: -0.1262, electrons: 2 },
  { id: "h", label: "H⁺/H₂ (SHE)", e0: 0, electrons: 2 },
  { id: "cu", label: "Cu²⁺/Cu", e0: 0.3419, electrons: 2 },
  { id: "i2", label: "I₂/I⁻", e0: 0.5355, electrons: 2 },
  { id: "fe3", label: "Fe³⁺/Fe²⁺", e0: 0.771, electrons: 1 },
  { id: "ag", label: "Ag⁺/Ag", e0: 0.7996, electrons: 1 },
  { id: "br2", label: "Br₂/Br⁻", e0: 1.066, electrons: 2 },
  { id: "o2", label: "O₂/H₂O", e0: 1.229, electrons: 4 },
  { id: "cl2", label: "Cl₂/Cl⁻", e0: 1.358, electrons: 2 },
  { id: "mno4", label: "MnO₄⁻/Mn²⁺", e0: 1.51, electrons: 5 },
  { id: "ce4", label: "Ce⁴⁺/Ce³⁺", e0: 1.61, electrons: 1 },
  { id: "f2", label: "F₂/F⁻", e0: 2.866, electrons: 2 },
];

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export type CellResult = {
  cathode: StandardPotential;
  anode: StandardPotential;
  /** Стандартная ЭДС, В. */
  e0Cell: number;
  /** ЭДС при заданных T и Q, В. */
  eCell: number;
  electrons: number;
  /** ΔG°, кДж/моль. */
  deltaG0Kj: number;
  /** ΔG при заданных T и Q, кДж/моль. */
  deltaGKj: number;
  spontaneous: boolean;
  notes: string[];
};

export type CellInput = {
  cathodeId: string;
  anodeId: string;
  temperatureK?: number;
  /** Q = произведение активностей продуктов / реагентов. */
  reactionQuotient?: number;
};

export function cellPotential(input: CellInput): CellResult {
  const cathode = STANDARD_POTENTIALS.find((item) => item.id === input.cathodeId);
  const anode = STANDARD_POTENTIALS.find((item) => item.id === input.anodeId);
  if (!cathode || !anode) throw new Error("Выберите оба электрода из таблицы");
  if (cathode.id === anode.id) throw new Error("Катод и анод должны быть разными");
  const temperatureK = input.temperatureK ?? 298.15;
  const q = input.reactionQuotient ?? 1;
  if (!Number.isFinite(temperatureK) || temperatureK <= 0) throw new Error("Температура должна быть выше 0 К");
  if (!Number.isFinite(q) || q <= 0) throw new Error("Q должно быть положительным числом");

  const electrons = (cathode.electrons * anode.electrons) / gcd(cathode.electrons, anode.electrons);
  const e0Cell = cathode.e0 - anode.e0;
  const eCell = e0Cell - (GAS_CONSTANT * temperatureK / (electrons * FARADAY)) * Math.log(q);
  const deltaG0Kj = (-electrons * FARADAY * e0Cell) / 1000;
  const deltaGKj = (-electrons * FARADAY * eCell) / 1000;

  return {
    cathode,
    anode,
    e0Cell,
    eCell,
    electrons,
    deltaG0Kj,
    deltaGKj,
    spontaneous: eCell > 0,
    notes: [
      "Стандартные потенциалы — водные растворы, 25 °C, 1 М активности, 1 бар для газов.",
      "Q задаётся вручную: активности и коэффициенты активности не вычисляются.",
      ...(Math.abs(temperatureK - 298.15) > 0.01
        ? ["Температурная зависимость E° и коэффициентов активности не учтена — меняется только член RT/nF·lnQ."]
        : []),
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Спектроскопия                                                              */
/* -------------------------------------------------------------------------- */

export type BeerLambertInput = {
  /** Молярный коэффициент поглощения, л·моль⁻¹·см⁻¹. */
  epsilon: number;
  /** Толщина кюветы, см. */
  pathCm: number;
  /** Концентрация, моль/л. */
  concentration: number;
};

export type BeerLambertResult = {
  absorbance: number;
  transmittancePercent: number;
  /** Доля поглощённого света. */
  absorbedFraction: number;
  linear: boolean;
  warnings: string[];
};

export function beerLambert(input: BeerLambertInput): BeerLambertResult {
  assertPositive(input.epsilon, "Молярный коэффициент поглощения");
  assertPositive(input.pathCm, "Толщина кюветы");
  if (!Number.isFinite(input.concentration) || input.concentration < 0) {
    throw new Error("Концентрация не может быть отрицательной");
  }
  const absorbance = input.epsilon * input.pathCm * input.concentration;
  const transmittance = 10 ** -absorbance;
  const warnings: string[] = [];
  if (absorbance < 0.05) warnings.push("A < 0,05: сигнал сравним с шумом прибора, результат ненадёжен.");
  if (absorbance > 1.5) warnings.push("A > 1,5: закон Бугера–Ламберта–Бера может нарушаться, нужен разбавленный раствор.");
  return {
    absorbance,
    transmittancePercent: transmittance * 100,
    absorbedFraction: 1 - transmittance,
    linear: absorbance >= 0.05 && absorbance <= 1.5,
    warnings,
  };
}

export function concentrationFromAbsorbance(
  absorbance: number,
  epsilon: number,
  pathCm: number,
): { concentration: number; warnings: string[] } {
  assertPositive(epsilon, "Молярный коэффициент поглощения");
  assertPositive(pathCm, "Толщина кюветы");
  if (!Number.isFinite(absorbance) || absorbance <= 0) throw new Error("Оптическая плотность должна быть > 0");
  const warnings: string[] = [];
  if (absorbance > 1.5) warnings.push("A > 1,5: результат вне линейного участка, разбавьте раствор.");
  if (absorbance < 0.05) warnings.push("A < 0,05: слишком низкий сигнал.");
  return { concentration: absorbance / (epsilon * pathCm), warnings };
}

/* -------------------------------------------------------------------------- */
/* Протоколы                                                                  */
/* -------------------------------------------------------------------------- */

export const LAB_PROTOCOLS: Record<"titration" | "electrochemistry" | "spectroscopy", string[]> = {
  titration: [
    "Промойте бюретку рабочим раствором титранта и заполните её без пузырей.",
    "Отберите точную аликвоту пипеткой в коническую колбу, добавьте 2–3 капли индикатора.",
    "Титруйте при перемешивании: сначала быстро, у точки эквивалентности — по каплям.",
    "Зафиксируйте объём в момент устойчивой смены окраски и повторите опыт 2–3 раза.",
    "Сравните объём с расчётным и оцените расхождение (не более 1–2 % для учебного опыта).",
  ],
  electrochemistry: [
    "Зачистите электроды и промойте их дистиллированной водой.",
    "Соберите цепь: анод — окисление, катод — восстановление; проверьте полярность вольтметра.",
    "Заполните полуэлементы растворами заданной концентрации, замкните солевой мост.",
    "Измерьте ЭДС, дождитесь стабильного показания, запишите температуру.",
    "Сравните измерение с расчётом по Нернсту и объясните расхождение.",
  ],
  spectroscopy: [
    "Включите прибор и дайте лазеру/лампе выйти на режим 10–15 минут.",
    "Измерьте нулевой сигнал (кювета с растворителем) и запишите его.",
    "Заполните кювету раствором, протрите стенки и поставьте в кюветное отделение.",
    "Запишите оптическую плотность при выбранной длине волны, повторите для серии разведений.",
    "Постройте зависимость A от c: линейный участок — рабочий диапазон метода.",
  ],
};
