/**
 * H6: банк задач по химии с генератором вариантов.
 *
 * Задачи не выдумывают данные: параметры берутся из детерминированного
 * генератора с явным seed, а молярные массы считаются по снимку
 * `src/data/chemical-elements.json` (тот же проверенный набор, что в
 * периодической таблице). Один seed всегда даёт один и тот же вариант,
 * поэтому преподаватель может назвать seed вместо пересылки файла.
 */

import { getElementBySymbol } from "@/lib/elements";

export type PracticeTopic =
  | "molar_mass"
  | "concentration"
  | "dilution"
  | "ph"
  | "gas"
  | "titration"
  | "calorimetry"
  | "kinetics";

export type PracticeDifficulty = 1 | 2 | 3;

export const PRACTICE_TOPICS: Array<{ id: PracticeTopic; label: string; hint: string }> = [
  { id: "molar_mass", label: "Молярная масса", hint: "масса 1 моль вещества по атомным массам" },
  { id: "concentration", label: "Растворы", hint: "c = n/V, масса навески" },
  { id: "dilution", label: "Разведение", hint: "c₁V₁ = c₂V₂" },
  { id: "ph", label: "pH", hint: "сильные кислоты и основания" },
  { id: "gas", label: "Газы", hint: "pV = nRT" },
  { id: "titration", label: "Титрование", hint: "объём титранта до эквивалентности" },
  { id: "calorimetry", label: "Термохимия", hint: "q = mcΔT" },
  { id: "kinetics", label: "Кинетика", hint: "период полураспада 1-го порядка" },
];

export const TOPIC_LABEL: Record<PracticeTopic, string> = Object.fromEntries(
  PRACTICE_TOPICS.map((topic) => [topic.id, topic.label]),
) as Record<PracticeTopic, string>;

export type PracticeQuestion = {
  id: string;
  topic: PracticeTopic;
  difficulty: PracticeDifficulty;
  prompt: string;
  answer: { value: number; unit: string; tolerance: number };
  steps: string[];
  /** Оговорки модели: что расчёт не учитывает. */
  notes: string[];
};

export type PracticeVariant = {
  seed: number;
  questions: PracticeQuestion[];
};

const DIFFICULTY_LABEL: Record<PracticeDifficulty, string> = { 1: "базовый", 2: "средний", 3: "сложный" };
export function difficultyLabel(level: PracticeDifficulty): string {
  return DIFFICULTY_LABEL[level];
}

/* -------------------------------------------------------------------------- */
/* Детерминированный генератор                                                */
/* -------------------------------------------------------------------------- */

/** FNV-1a: строковый seed → 32-битное число. */
export function hashSeed(seed: string | number): number {
  const text = String(seed).trim() || "0";
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = {
  float: () => number;
  /** Целое [min, max] включительно. */
  int: (min: number, max: number) => number;
  /** Случайный шаг из набора. */
  pick: <T>(items: readonly T[]) => T;
  /** Значение из диапазона с фиксированным числом знаков. */
  value: (min: number, max: number, digits: number) => number;
};

function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min;
  const value = (min: number, max: number, digits: number) => {
    const raw = min + next() * (max - min);
    return Number(raw.toFixed(digits));
  };
  return {
    float: next,
    int,
    pick: <T,>(items: readonly T[]) => items[Math.floor(next() * items.length)] as T,
    value,
  };
}

/* -------------------------------------------------------------------------- */
/* Химия: формулы и молярные массы                                            */
/* -------------------------------------------------------------------------- */

const FORMULA_TOKEN = /([A-Z][a-z]?|\d+|[()])/g;

/** Разбор формулы с вложенными скобками: (NH4)2SO4, Ca(OH)2, Fe2(SO4)3. */
export function parseFormula(formula: string): Record<string, number> {
  const tokens = formula.match(FORMULA_TOKEN) || [];
  if (!tokens.length || tokens.join("") !== formula.replace(/\s+/g, "")) {
    throw new Error(`Не удалось разобрать формулу: ${formula}`);
  }
  const stack: Array<Record<string, number>> = [{}];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === "(") {
      stack.push({});
      index += 1;
      continue;
    }
    if (token === ")") {
      if (stack.length === 1) throw new Error(`Лишняя закрывающая скобка: ${formula}`);
      const group = stack.pop() as Record<string, number>;
      index += 1;
      const multiplier = /^\d+$/.test(tokens[index] || "") ? Number(tokens[index++]) : 1;
      const target = stack[stack.length - 1];
      for (const [symbol, count] of Object.entries(group)) {
        target[symbol] = (target[symbol] || 0) + count * multiplier;
      }
      continue;
    }
    if (/^\d+$/.test(token)) throw new Error(`Множитель без атома: ${formula}`);
    const symbol = token;
    index += 1;
    const count = /^\d+$/.test(tokens[index] || "") ? Number(tokens[index++]) : 1;
    const current = stack[stack.length - 1];
    current[symbol] = (current[symbol] || 0) + count;
  }
  if (stack.length !== 1) throw new Error(`Не хватает закрывающей скобки: ${formula}`);
  return stack[0];
}

/** Молярная масса по атомным массам снимка; неизвестный символ — ошибка. */
export function molarMass(formula: string): number {
  const composition = parseFormula(formula);
  let mass = 0;
  for (const [symbol, count] of Object.entries(composition)) {
    const element = getElementBySymbol(symbol);
    if (!element) throw new Error(`Элемент ${symbol} отсутствует в таблице`);
    mass += element.atomic_mass * count;
  }
  return mass;
}

/* -------------------------------------------------------------------------- */
/* Форматирование                                                             */
/* -------------------------------------------------------------------------- */

/** Русская запись числа: запятая, неразрывные пробелы в тысячах не нужны. */
export function formatNumber(value: number, digits = 2): string {
  const rounded = Number(value.toFixed(digits));
  return String(rounded).replace(".", ",");
}

/* -------------------------------------------------------------------------- */
/* Шаблоны задач                                                              */
/* -------------------------------------------------------------------------- */

const MOLAR_FORMULAS: Record<PracticeDifficulty, string[]> = {
  1: ["H2O", "CO2", "NaCl", "NH3", "CH4", "O2"],
  2: ["C6H12O6", "H2SO4", "CaCO3", "NaOH", "KNO3", "C2H5OH"],
  3: ["(NH4)2SO4", "Ca(OH)2", "Fe2(SO4)3", "K3PO4", "Al2(SO4)3", "Cu(NO3)2"],
};

const ACIDS: Array<{ formula: string; name: string; protons: number }> = [
  { formula: "HCl", name: "соляная кислота", protons: 1 },
  { formula: "HNO3", name: "азотная кислота", protons: 1 },
  { formula: "H2SO4", name: "серная кислота", protons: 2 },
];

const BASES: Array<{ formula: string; name: string }> = [
  { formula: "NaOH", name: "гидроксид натрия" },
  { formula: "KOH", name: "гидроксид калия" },
];

function molarMassTask(rng: Rng, difficulty: PracticeDifficulty): Omit<PracticeQuestion, "id" | "difficulty" | "topic"> {
  const formula = rng.pick(MOLAR_FORMULAS[difficulty]);
  const composition = parseFormula(formula);
  const mass = molarMass(formula);
  const parts = Object.entries(composition).map(([symbol, count]) => {
    const element = getElementBySymbol(symbol);
    return `${symbol}: ${count} × ${formatNumber(element?.atomic_mass ?? 0, 3)}`;
  });
  return {
    prompt: `Вычислите молярную массу ${formula} (г/моль).`,
    answer: { value: mass, unit: "г/моль", tolerance: 0.05 },
    steps: [
      `Состав: ${Object.entries(composition).map(([s, c]) => `${s}${c === 1 ? "" : c}`).join(" + ")}.`,
      `Атомные массы: ${parts.join("; ")}.`,
      `M = ${Object.entries(composition).map(([s, c]) => `${c}·${formatNumber(getElementBySymbol(s)?.atomic_mass ?? 0, 3)}`).join(" + ")} = ${formatNumber(mass, 2)} г/моль.`,
    ],
    notes: ["Атомные массы — из снимка периодической таблицы; для изотопных смесей это средние значения."],
  };
}

function concentrationTask(rng: Rng, difficulty: PracticeDifficulty): Omit<PracticeQuestion, "id" | "difficulty" | "topic"> {
  const solute = rng.pick([
    { formula: "NaCl", name: "хлорид натрия" },
    { formula: "C6H12O6", name: "глюкоза" },
    { formula: "KNO3", name: "нитрат калия" },
  ]);
  const concentration = rng.value(difficulty === 1 ? 0.1 : 0.05, difficulty === 3 ? 2 : 0.5, 2);
  const volumeMl = rng.int(difficulty === 1 ? 100 : 50, 500);
  const mass = molarMass(solute.formula);
  const moles = concentration * (volumeMl / 1000);
  const required = moles * mass;
  return {
    prompt: `Сколько граммов ${solute.name} (${solute.formula}) нужно взять для приготовления ${volumeMl} мл раствора с концентрацией ${formatNumber(concentration)} моль/л?`,
    answer: { value: required, unit: "г", tolerance: 0.01 },
    steps: [
      `V = ${volumeMl} мл = ${formatNumber(volumeMl / 1000, 3)} л.`,
      `n = c·V = ${formatNumber(concentration)} · ${formatNumber(volumeMl / 1000, 4)} = ${formatNumber(moles, 4)} моль.`,
      `M(${solute.formula}) = ${formatNumber(mass, 2)} г/моль.`,
      `m = n·M = ${formatNumber(moles, 4)} · ${formatNumber(mass, 2)} = ${formatNumber(required, 2)} г.`,
    ],
    notes: ["Расчёт идеальный: поправка на плотность раствора и объёмное сжатие при растворении не учитывается."],
  };
}

function dilutionTask(rng: Rng, difficulty: PracticeDifficulty): Omit<PracticeQuestion, "id" | "difficulty" | "topic"> {
  const c1 = rng.value(0.5, difficulty === 1 ? 2 : 1, 2);
  const v1 = rng.int(10, difficulty === 1 ? 50 : 100);
  const factor = rng.int(difficulty === 1 ? 2 : 3, 10);
  const c2 = (c1 * v1) / (v1 * factor);
  return {
    prompt: `Раствор ${formatNumber(c1)} моль/л объёмом ${v1} мл разбавили водой до ${v1 * factor} мл. Какова концентрация полученного раствора (моль/л)?`,
    answer: { value: c2, unit: "моль/л", tolerance: 0.002 },
    steps: [
      `Количество вещества не меняется: c₁V₁ = c₂V₂.`,
      `c₂ = c₁V₁/V₂ = ${formatNumber(c1)} · ${v1} / ${v1 * factor}.`,
      `c₂ = ${formatNumber(c2, 3)} моль/л.`,
    ],
    notes: ["Объёмы считаются аддитивными; для концентрированных растворов это приближение."],
  };
}

function phTask(rng: Rng, difficulty: PracticeDifficulty): Omit<PracticeQuestion, "id" | "difficulty" | "topic"> {
  const isBase = difficulty === 1 ? rng.float() < 0.5 : rng.float() < 0.4;
  const base = rng.pick(BASES);
  const acid = rng.pick(ACIDS.filter((item) => item.protons === 1));
  const concentration = rng.value(0.001, difficulty === 3 ? 0.5 : 0.1, 3);
  const pValue = isBase ? 14 + Math.log10(concentration) : -Math.log10(concentration);
  const kind = isBase ? base : acid;
  const role = isBase ? "основание" : "кислота";
  return {
    prompt: `Вычислите pH раствора ${kind.name} (${kind.formula}) с концентрацией ${formatNumber(concentration, 3)} моль/л при 25 °C.`,
    answer: { value: pValue, unit: "pH", tolerance: 0.02 },
    steps: isBase
      ? [
          `${base.formula} — сильное ${role}, диссоциирует полностью: [OH⁻] = ${formatNumber(concentration, 3)} моль/л.`,
          `pOH = −lg[OH⁻] = ${formatNumber(-Math.log10(concentration), 2)}.`,
          `pH = 14 − pOH = ${formatNumber(pValue, 2)}.`,
        ]
      : [
          `${acid.formula} — сильная ${role}, диссоциирует полностью: [H⁺] = ${formatNumber(concentration, 3)} моль/л.`,
          `pH = −lg[H⁺] = −lg(${formatNumber(concentration, 3)}).`,
          `pH = ${formatNumber(pValue, 2)}.`,
        ],
    notes: ["Активности приравнены к концентрациям (ионная сила не учитывается) — для разбавленных растворов это допустимо."],
  };
}

function gasTask(rng: Rng, difficulty: PracticeDifficulty): Omit<PracticeQuestion, "id" | "difficulty" | "topic"> {
  const moles = rng.value(0.1, difficulty === 1 ? 1 : 2, 2);
  const temperature = rng.int(difficulty === 1 ? 273 : 250, 400);
  const pressure = rng.value(0.5, difficulty === 3 ? 5 : 2, 2);
  const R = 8.314; // кПа·л/(моль·К)
  const volume = (moles * R * temperature) / pressure;
  return {
    prompt: `Какой объём займут ${formatNumber(moles)} моль газа при ${temperature} К и давлении ${formatNumber(pressure)} кПа? Ответ в литрах.`,
    answer: { value: volume, unit: "л", tolerance: 0.05 },
    steps: [
      `pV = nRT, R = 8,314 кПа·л/(моль·К).`,
      `V = nRT/p = ${formatNumber(moles)} · 8,314 · ${temperature} / ${formatNumber(pressure)}.`,
      `V = ${formatNumber(volume, 2)} л.`,
    ],
    notes: ["Модель идеального газа: межмолекулярные взаимодействия и собственный объём молекул не учитываются."],
  };
}

function titrationTask(rng: Rng, difficulty: PracticeDifficulty): Omit<PracticeQuestion, "id" | "difficulty" | "topic"> {
  const acid = rng.pick(ACIDS);
  const volumeMl = rng.int(10, 25);
  const acidConc = rng.value(0.05, difficulty === 1 ? 0.3 : 0.5, 2);
  const baseConc = rng.value(0.05, 0.5, 2);
  const equivalents = acid.protons;
  const equivalentVolume = (equivalents * acidConc * volumeMl) / baseConc;
  return {
    prompt: `На титрование ${volumeMl} мл ${formatNumber(acidConc)} моль/л раствора ${acid.formula} (${acid.name}) пошло ${formatNumber(baseConc)} моль/л раствора NaOH. Какой объём титранта (мл) соответствует точке эквивалентности?`,
    answer: { value: equivalentVolume, unit: "мл", tolerance: 0.05 },
    steps: [
      `n(${acid.formula}) = c·V = ${formatNumber(acidConc)} · ${formatNumber(volumeMl / 1000, 4)} = ${formatNumber(acidConc * volumeMl / 1000, 4)} моль.`,
      equivalents > 1
        ? `У ${acid.formula} ${equivalents} протона, поэтому на нейтрализацию нужно ${equivalents}·n(OH⁻).`
        : `Реакция 1:1, поэтому n(NaOH) = n(${acid.formula}).`,
      `V(NaOH) = n(NaOH)/c = ${formatNumber((equivalents * acidConc * volumeMl) / 1000, 4)} / ${formatNumber(baseConc)} = ${formatNumber(equivalentVolume / 1000, 3)} л = ${formatNumber(equivalentVolume, 2)} мл.`,
    ],
    notes: ["Предполагается полная нейтрализация до эквивалентной точки; активности и CO₂ из воздуха не учитываются."],
  };
}

function calorimetryTask(rng: Rng, difficulty: PracticeDifficulty): Omit<PracticeQuestion, "id" | "difficulty" | "topic"> {
  const mass = rng.int(difficulty === 1 ? 50 : 100, 500);
  const delta = rng.int(difficulty === 1 ? 5 : 10, 60);
  const heatJ = mass * 4.18 * delta;
  return {
    prompt: `Сколько теплоты (кДж) нужно, чтобы нагреть ${mass} г воды на ${delta} °C? Удельная теплоёмкость воды 4,18 Дж/(г·К).`,
    answer: { value: heatJ / 1000, unit: "кДж", tolerance: 0.02 },
    steps: [
      `q = m·c·ΔT.`,
      `q = ${mass} · 4,18 · ${delta} = ${formatNumber(heatJ, 0)} Дж.`,
      `q = ${formatNumber(heatJ / 1000, 2)} кДж.`,
    ],
    notes: ["Теплоёмкость постоянна; потери в окружающую среду и теплота испарения не учитываются."],
  };
}

function kineticsTask(rng: Rng, difficulty: PracticeDifficulty): Omit<PracticeQuestion, "id" | "difficulty" | "topic"> {
  const kPerMin = rng.value(0.005, difficulty === 1 ? 0.05 : 0.2, 4);
  const halfLifeMin = Math.LN2 / kPerMin;
  return {
    prompt: `Реакция первого порядка имеет константу скорости k = ${formatNumber(kPerMin, 4)} мин⁻¹. Чему равен период полураспада (мин)?`,
    answer: { value: halfLifeMin, unit: "мин", tolerance: 0.05 },
    steps: [
      `Для первого порядка t½ = ln2 / k.`,
      `t½ = 0,693 / ${formatNumber(kPerMin, 4)}.`,
      `t½ = ${formatNumber(halfLifeMin, 2)} мин.`,
    ],
    notes: ["Формула справедлива только для реакции первого порядка с постоянной k."],
  };
}

const GENERATORS: Record<PracticeTopic, (rng: Rng, difficulty: PracticeDifficulty) => Omit<PracticeQuestion, "id" | "difficulty" | "topic">> = {
  molar_mass: molarMassTask,
  concentration: concentrationTask,
  dilution: dilutionTask,
  ph: phTask,
  gas: gasTask,
  titration: titrationTask,
  calorimetry: calorimetryTask,
  kinetics: kineticsTask,
};

export type GenerateOptions = {
  seed?: string | number;
  count?: number;
  topics?: PracticeTopic[];
  difficulty?: PracticeDifficulty | "mixed";
};

const MAX_COUNT = 30;

/** Детерминированный вариант: тот же seed и опции → те же задачи и ответы. */
export function generateVariant(options: GenerateOptions = {}): PracticeVariant {
  const rawSeed = options.seed ?? Date.now();
  const seed = hashSeed(rawSeed);
  const rng = createRng(seed);
  const topics = (options.topics && options.topics.length ? options.topics : PRACTICE_TOPICS.map((topic) => topic.id));
  const count = Math.min(MAX_COUNT, Math.max(1, Math.floor(options.count ?? 6)));
  const difficulty = options.difficulty ?? 2;

  // Перемешиваем темы детерминированно, чтобы вариант не шёл одним списком.
  const order = [...topics];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = rng.int(0, index);
    [order[index], order[swap]] = [order[swap], order[index]];
  }

  const questions: PracticeQuestion[] = [];
  for (let index = 0; index < count; index += 1) {
    const topic = order[index % order.length];
    const level: PracticeDifficulty = difficulty === "mixed"
      ? ((rng.int(1, 3)) as PracticeDifficulty)
      : difficulty;
    const task = GENERATORS[topic](rng, level);
    questions.push({
      ...task,
      id: `${seed.toString(16)}-${index + 1}-${topic}`,
      topic,
      difficulty: level,
    });
  }
  return { seed, questions };
}

/* -------------------------------------------------------------------------- */
/* Проверка ответа                                                            */
/* -------------------------------------------------------------------------- */

export type AnswerCheck =
  | { status: "empty" }
  | { status: "invalid"; message: string }
  | { status: "correct"; expected: string }
  | { status: "incorrect"; expected: string; hint: string };

/** Принимает «12,5», «12.5», « 12,5 г »; единицы измерения не обязательны. */
export function parseAnswer(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/\s*(г\/моль|моль\/л|ммоль\/л|кДж|Дж|мл|л|pH|мин|моль|г)\s*$/i, "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  if (!cleaned) return null;
  if (!/^[+-]?\d*\.?\d+(?:[eE][+-]?\d+)?$/.test(cleaned)) return Number.NaN;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : Number.NaN;
}

export function checkPracticeAnswer(question: PracticeQuestion, raw: string): AnswerCheck {
  const parsed = parseAnswer(raw);
  if (parsed === null) return { status: "empty" };
  if (Number.isNaN(parsed)) {
    return { status: "invalid", message: "Введите число. Дробная часть — через запятую или точку." };
  }
  const { value, tolerance, unit } = question.answer;
  const expected = `${formatNumber(value, 2)} ${unit}`;
  if (Math.abs(parsed - value) <= tolerance) return { status: "correct", expected };
  if (parsed !== 0 && Math.abs(parsed - value) / Math.abs(value) < 1e-6) {
    return { status: "correct", expected };
  }
  return {
    status: "incorrect",
    expected,
    hint: parsed > value ? "Ответ завышен." : "Ответ занижен.",
  };
}

/** Строки для CSV-экспорта (H8) — без правильных ответов, если нужно. */
export function variantCsvRows(
  variant: PracticeVariant,
  results: Record<string, "correct" | "incorrect" | "invalid" | "empty">,
): Array<Record<string, string | number>> {
  return variant.questions.map((question, index) => ({
    "№": index + 1,
    "Тема": TOPIC_LABEL[question.topic],
    "Уровень": difficultyLabel(question.difficulty),
    "Задача": question.prompt,
    "Ответ": formatNumber(question.answer.value, 3),
    "Единица": question.answer.unit,
    "Ваш результат": results[question.id] ?? "empty",
    "Seed": variant.seed,
  }));
}
