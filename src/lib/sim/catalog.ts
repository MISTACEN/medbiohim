/**
 * Каталог симуляций MEDBIOHIM.
 *
 * Каждая модель — учебное приближение с явными ограничениями и источником.
 * Уравнения настоящие, но это не исследовательский инструмент: интерфейс
 * обязан показывать `source.kind` и `assumptions`.
 *
 * Защищённый код и контент референсов (NeoFamily, Acetyl) не копируется —
 * формулы и постановки самостоятельные, на основе классических уравнений.
 */

import type { SimDefinition, SimParams } from "./types";

/** Уравнение Михаэлиса–Ментен с конкурентным ингибированием. */
const enzymeKinetics: SimDefinition = {
  slug: "enzyme-kinetics",
  title: "Кинетика фермента: Михаэлис–Ментен",
  subjectSlug: "biology",
  level: 2,
  summary:
    "Зависимость скорости ферментативной реакции от концентрации субстрата и конкурентного ингибитора. Показывает насыщение и кажущееся изменение Km.",
  assumptions: [
    "Один субстрат, стационарное приближение, обратимостью пренебрегаем.",
    "Конкурентный ингибитор связывается только со свободным ферментом.",
    "Кооперативность, ингибирование избытком субстрата и инактивация фермента не моделируются.",
  ],
  source: {
    title: "Уравнение Михаэлиса–Ментен; конкурентное ингибирование",
    author: "L. Michaelis, M. L. Menten (1913); стандартное изложение биохимии",
    year: 1913,
    kind: "teaching_model",
    limitations: [
      "Модель справедлива при избытке субстрата относительно фермента.",
      "Km — это концентрация субстрата при половине максимальной скорости только в этой модели.",
    ],
  },
  parameters: [
    { id: "vmax", label: "Vmax", unit: "мкмоль/мин", min: 1, max: 100, step: 1, default: 20, description: "Максимальная скорость при насыщении." },
    { id: "km", label: "Km", unit: "мМ", min: 0.1, max: 10, step: 0.1, default: 2, description: "Концентрация субстрата при половине Vmax." },
    { id: "substrate", label: "[S]", unit: "мМ", min: 0.1, max: 50, step: 0.1, default: 5, description: "Концентрация субстрата." },
    { id: "inhibitor", label: "[I]", unit: "мМ", min: 0, max: 20, step: 0.1, default: 0, description: "Концентрация конкурентного ингибитора." },
    { id: "ki", label: "Ki", unit: "мМ", min: 0.1, max: 10, step: 0.1, default: 2, description: "Константа диссоциации комплекса фермент–ингибитор." },
  ],
  outputs: [
    { id: "velocity", label: "Скорость v", unit: "мкмоль/мин", precision: 2 },
    { id: "saturation", label: "Доля от Vmax", unit: "%", precision: 1 },
    { id: "kmApp", label: "Кажущийся Km", unit: "мМ", precision: 2 },
  ],
  steps: [
    { id: "s1", title: "Без ингибитора", explanation: "При [I] = 0 скорость описывается v = Vmax·[S] / (Km + [S]).", outputs: ["velocity"] },
    { id: "s2", title: "Насыщение", explanation: "Когда [S] ≫ Km, скорость приближается к Vmax: свободных молекул фермента становится мало.", outputs: ["velocity", "saturation"] },
    { id: "s3", title: "Конкурентное ингибирование", explanation: "Ингибитор повышает кажущийся Km, но Vmax не меняется: при очень большом [S] ингибитор вытесняется.", outputs: ["velocity", "kmApp"] },
  ],
  compute: (params) => {
    const vmax = params.vmax;
    const km = params.km;
    const substrate = params.substrate;
    const inhibitor = params.inhibitor;
    const ki = Math.max(0.0001, params.ki);
    const kmApp = km * (1 + inhibitor / ki);
    const velocity = (vmax * substrate) / (kmApp + substrate);
    const notes = [
      `Km(app) = Km · (1 + [I]/Ki) = ${kmApp.toFixed(2)} мМ`,
      inhibitor > 0
        ? "Vmax не изменяется: это признак конкурентного ингибирования."
        : "Ингибитор не добавлен — наблюдается базовая кинетика.",
    ];
    return {
      outputs: {
        velocity,
        saturation: (velocity / vmax) * 100,
        kmApp,
      },
      notes,
      warning: substrate < km * 0.2
        ? "При [S] ≪ Km скорость почти линейна по субстрату — эффект насыщения ещё не виден."
        : undefined,
    };
  },
  sweep: {
    paramId: "substrate",
    from: 0.1,
    to: 50,
    points: 80,
    xLabel: "[S], мМ",
    outputId: "velocity",
    yLabel: "v, мкмоль/мин",
  },
  check: {
    prompt: "При [S] = Km и отсутствии ингибитора скорость равна…",
    options: ["Vmax", "Vmax / 2", "2·Vmax", "0"],
    correctIndex: 1,
    explanation: "Подстановка [S] = Km даёт v = Vmax·Km / (Km + Km) = Vmax / 2.",
  },
};

/**
 * Титрование слабой одноосновной кислоты сильным основанием.
 *
 * pH считается из уравнения электронейтральности (бисекция по [H+]),
 * а не только по Гендерсону–Хассельбаху: приближение HH ломается возле
 * точки эквивалентности, и показывать там неверный pH нельзя.
 */
function phFromChargeBalance(params: SimParams): { ph: number; alpha: number; equivalenceMl: number } {
  const ka = Math.pow(10, -params.pka);
  const kw = 1e-14;
  const volumeMl = params.volumeAcid + params.volumeBase;
  const totalAcid = (params.concAcid * params.volumeAcid) / volumeMl / 1000;
  const sodium = (params.concBase * params.volumeBase) / volumeMl / 1000;

  const charge = (h: number) =>
    h + sodium - kw / h - (totalAcid * ka) / (ka + h);

  let low = -14;
  let high = 1;
  if (charge(Math.pow(10, low)) > 0) return { ph: 14, alpha: 0, equivalenceMl: 0 };
  for (let index = 0; index < 200; index += 1) {
    const middle = (low + high) / 2;
    if (charge(Math.pow(10, middle)) > 0) high = middle;
    else low = middle;
  }
  const h = Math.pow(10, (low + high) / 2);
  const alpha = ka / (ka + h);
  return {
    ph: Math.max(0, Math.min(14, -Math.log10(h))),
    alpha,
    equivalenceMl: (params.concAcid * params.volumeAcid) / Math.max(0.0001, params.concBase),
  };
}

const bufferTitration: SimDefinition = {
  slug: "buffer-titration",
  title: "Титрование слабой кислоты",
  subjectSlug: "chemistry_organic_physical",
  level: 3,
  summary:
    "Кривая титрования уксусной кислоты гидроксидом натрия: буферная зона, точка эквивалентности и щелочная среда после неё.",
  assumptions: [
    "Одноосновная слабая кислота, сильное основание, идеальные растворы.",
    "Активности заменены концентрациями; ионная сила не учитывается.",
    "Температура 25 °C: Kw = 1·10⁻¹⁴.",
  ],
  source: {
    title: "Расчёт pH из уравнения электронейтральности",
    organization: "Классическая аналитическая химия (кислотно-основное титрование)",
    kind: "simplified_simulation",
    limitations: [
      "Не учитывает активности и ионную силу раствора.",
      "Многоосновные кислоты и осадки не моделируются.",
      "Объём считается аддитивным.",
    ],
  },
  parameters: [
    { id: "pka", label: "pKa кислоты", min: 2, max: 12, step: 0.01, default: 4.76, description: "Для уксусной кислоты pKa ≈ 4.76." },
    { id: "concAcid", label: "C кислоты", unit: "мМ", min: 1, max: 500, step: 1, default: 100 },
    { id: "volumeAcid", label: "V кислоты", unit: "мл", min: 5, max: 100, step: 1, default: 25 },
    { id: "concBase", label: "C NaOH", unit: "мМ", min: 1, max: 500, step: 1, default: 100 },
    { id: "volumeBase", label: "V добавленной NaOH", unit: "мл", min: 0, max: 100, step: 0.1, default: 12.5 },
  ],
  outputs: [
    { id: "ph", label: "pH", precision: 2 },
    { id: "alpha", label: "Диссоциация α", unit: "%", precision: 1 },
    { id: "equivalence", label: "V эквивалентности", unit: "мл", precision: 2 },
  ],
  steps: [
    { id: "s1", title: "Исходный раствор", explanation: "До добавления щёлочи pH определяется диссоциацией слабой кислоты: [H+] ≈ √(Ka·C).", outputs: ["ph", "alpha"] },
    { id: "s2", title: "Буферная зона", explanation: "Вблизи Vэкв/2 отношение [A⁻]/[HA] ≈ 1, поэтому pH ≈ pKa. Здесь раствор сопротивляется изменению pH.", outputs: ["ph", "alpha"] },
    { id: "s3", title: "Точка эквивалентности", explanation: "Кислота нейтрализована, но соль гидролизуется — среда щелочная, pH > 7.", outputs: ["ph", "equivalence"] },
  ],
  compute: (params) => {
    const { ph, alpha, equivalenceMl } = phFromChargeBalance(params);
    const notes = [
      `V эквивалентности = C(кислоты)·V(кислоты) / C(NaOH) = ${equivalenceMl.toFixed(2)} мл`,
      `Степень диссоциации α = ${(alpha * 100).toFixed(1)} %.`,
    ];
    return {
      outputs: { ph, alpha: alpha * 100, equivalence: equivalenceMl },
      notes,
      warning: Math.abs(params.volumeBase - equivalenceMl) < 0.15 * Math.max(0.5, equivalenceMl)
        ? "Рядом точка эквивалентности: буферная ёмкость минимальна, pH меняется резко."
        : undefined,
    };
  },
  sweep: {
    paramId: "volumeBase",
    from: 0,
    to: 100,
    points: 100,
    xLabel: "V(NaOH), мл",
    outputId: "ph",
    yLabel: "pH",
  },
  check: {
    prompt: "В середине буферной зоны (V = ½·Vэкв) pH приблизительно равен…",
    options: ["7.0", "pKa кислоты", "pKa + 2", "14 − pKa"],
    correctIndex: 1,
    explanation: "При [A⁻] = [HA] уравнение Гендерсона–Хассельбаха даёт pH = pKa.",
  },
};

/**
 * Мембранный потенциал покоя по уравнению Гольдмана–Ходжкина–Каца.
 */
const membranePotential: SimDefinition = {
  slug: "membrane-potential",
  title: "Мембранный потенциал покоя (Гольдман–Ходжкин–Кац)",
  subjectSlug: "physiology",
  level: 3,
  summary:
    "Потенциал покоя как равновесие проницаемостей K⁺, Na⁺ и Cl⁻. Показывает, почему гиперкалиемия деполяризует мембрану.",
  assumptions: [
    "Постоянное поле в мембране, стационарное состояние, только одновалентные ионы.",
    "Проницаемости заданы относительно P(K⁺).",
    "Потенциал действия, насос и внутриклеточные компартменты не моделируются.",
  ],
  source: {
    title: "Уравнение Гольдмана–Ходжкина–Каца",
    author: "D. E. Goldman (1943); A. L. Hodgkin, B. Katz (1949)",
    year: 1943,
    kind: "teaching_model",
    limitations: [
      "Не описывает динамику потенциала действия.",
      "Температура фиксирована 37 °C (коэффициент 61.5 мВ).",
      "Активный транспорт учитывается только косвенно — через заданные концентрации.",
    ],
  },
  parameters: [
    { id: "kOut", label: "[K⁺] снаружи", unit: "мМ", min: 1, max: 10, step: 0.1, default: 4.5 },
    { id: "kIn", label: "[K⁺] внутри", unit: "мМ", min: 100, max: 170, step: 1, default: 140 },
    { id: "naOut", label: "[Na⁺] снаружи", unit: "мМ", min: 120, max: 170, step: 1, default: 145 },
    { id: "naIn", label: "[Na⁺] внутри", unit: "мМ", min: 4, max: 30, step: 0.5, default: 12 },
    { id: "clOut", label: "[Cl⁻] снаружи", unit: "мМ", min: 90, max: 130, step: 1, default: 110 },
    { id: "clIn", label: "[Cl⁻] внутри", unit: "мМ", min: 2, max: 40, step: 0.5, default: 10 },
    { id: "pNa", label: "P(Na⁺)/P(K⁺)", min: 0.01, max: 0.5, step: 0.01, default: 0.04 },
    { id: "pCl", label: "P(Cl⁻)/P(K⁺)", min: 0.05, max: 1.2, step: 0.01, default: 0.45 },
  ],
  outputs: [
    { id: "em", label: "E мембраны", unit: "мВ", precision: 1 },
    { id: "ek", label: "E(K⁺) по Нернсту", unit: "мВ", precision: 1 },
    { id: "drivingK", label: "Движущая сила K⁺", unit: "мВ", precision: 1 },
  ],
  steps: [
    { id: "s1", title: "Вклад калия", explanation: "В покое P(K⁺) максимальна, поэтому E мембраны близок к E(K⁺).", outputs: ["em", "ek"] },
    { id: "s2", title: "Вклад натрия", explanation: "Небольшая проницаемость для Na⁺ сдвигает потенциал в положительную сторону от E(K⁺).", outputs: ["em", "drivingK"] },
    { id: "s3", title: "Гиперкалиемия", explanation: "Рост [K⁺] снаружи уменьшает градиент, E(K⁺) становится менее отрицательным — мембрана деполяризуется.", outputs: ["em", "ek"] },
  ],
  compute: (params) => {
    const numerator = params.kOut + params.pNa * params.naOut + params.pCl * params.clIn;
    const denominator = params.kIn + params.pNa * params.naIn + params.pCl * params.clOut;
    const em = 61.5 * Math.log10(numerator / denominator);
    const ek = 61.5 * Math.log10(params.kOut / params.kIn);
    return {
      outputs: { em, ek, drivingK: em - ek },
      notes: [
        "E = 61.5·lg(([K⁺]₀ + P(Na)/P(K)·[Na⁺]₀ + P(Cl)/P(K)·[Cl⁻]ᵢ) / ([K⁺]ᵢ + P(Na)/P(K)·[Na⁺]ᵢ + P(Cl)/P(K)·[Cl⁻]₀)).",
        `E(K⁺) по Нернсту = ${ek.toFixed(1)} мВ; вклад Na⁺ делает E мембраны менее отрицательным.`,
      ],
      warning: params.kOut > 6
        ? "Концентрация K⁺ выше типичной внеклеточной: это учебная ситуация гиперкалиемии."
        : undefined,
    };
  },
  sweep: {
    paramId: "kOut",
    from: 1,
    to: 10,
    points: 90,
    xLabel: "[K⁺] снаружи, мМ",
    outputId: "em",
    yLabel: "E мембраны, мВ",
  },
  check: {
    prompt: "Что произойдёт с потенциалом покоя при повышении внеклеточного [K⁺]?",
    options: ["Станет более отрицательным", "Деполяризуется (станет менее отрицательным)", "Не изменится", "Исчезнет полностью"],
    correctIndex: 1,
    explanation: "E(K⁺) = 61.5·lg([K⁺]₀/[K⁺]ᵢ): рост [K⁺]₀ уменьшает отношение и сдвигает потенциал вверх.",
  },
};

export const SIMULATIONS: SimDefinition[] = [enzymeKinetics, bufferTitration, membranePotential];

export function getSimulation(slug: string): SimDefinition | undefined {
  return SIMULATIONS.find((simulation) => simulation.slug === slug);
}
