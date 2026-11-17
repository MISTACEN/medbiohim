/**
 * Кондуктометрия: определение константы диссоциации слабого электролита.
 *
 * Перенесено из `на сайт/course/chemlab/lab1.html`, где расчёт жил в inline-JS
 * и на сайте не работал. Формулы исходной работы:
 *   æ = φ · L            — удельная проводимость (φ — постоянная ячейки, 1/м)
 *   λ = æ / C            — молярная проводимость, См·м²/моль
 *   α = λ / λ∞           — степень диссоциации
 *   K = α²·C / (1 − α)   — константа диссоциации (закон разведения Оствальда)
 *
 * Плюс линейная форма Оствальда для графика 1/λ от λ·C:
 *   1/λ = 1/λ∞ + (λ·C) / (K·λ∞²)
 * отсюда λ∞ = 1/intercept и K = intercept²/slope.
 */

/** Типичная постоянная кондуктометрической ячейки, 1/м. */
export const DEFAULT_CELL_CONSTANT = 100;
/** Предельная молярная проводимость уксусной кислоты при 25 °C, См·м²/моль (≈ 390,6 См·см²/моль). */
export const DEFAULT_LIMIT_CONDUCTIVITY = 0.03906;
/** Константа диссоциации уксусной кислоты, моль/м³ (1,8·10⁻⁵ моль/л). */
export const ACETIC_ACID_K = 0.018;

export type ConductometryRow = {
  id: number;
  /** Концентрация раствора, моль/м³. */
  concentration: number;
  /** Измеренное сопротивление раствора, кОм. */
  resistanceKOhm: number;
};

export type ConductometryComputed = {
  id: number;
  concentration: number;
  resistanceKOhm: number;
  /** Проводимость L = 1/R, См. */
  conductance: number | null;
  /** Удельная проводимость æ = φ·L, См/м. */
  conductivity: number | null;
  /** Молярная проводимость λ = æ/C, См·м²/моль. */
  molarConductivity: number | null;
  /** Степень диссоциации α = λ/λ∞. */
  degree: number | null;
  /** Константа диссоциации K = α²C/(1−α), моль/м³. */
  constant: number | null;
  /** Почему строку нельзя посчитать (если нельзя). */
  error?: string;
};

export type ConductometrySummary = {
  /** Средняя K по валидным строкам, моль/м³. */
  meanConstant: number | null;
  /** Стандартное отклонение K, моль/м³. */
  deviation: number | null;
  /** Относительный разброс K, доля (0,12 = 12 %). */
  spread: number | null;
  validRows: number;
  totalRows: number;
};

export type LinearFit = {
  slope: number;
  intercept: number;
  /** Коэффициент детерминации R². */
  r2: number;
  points: Array<{ x: number; y: number }>;
};

/** Линейная регрессия y = k·x + b методом наименьших квадратов. */
export function linearFit(points: Array<{ x: number; y: number }>): LinearFit | null {
  if (points.length < 2) return null;
  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (Math.abs(denominator) < Number.EPSILON) return null;
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const ssTot = points.reduce((sum, p) => sum + (p.y - meanY) ** 2, 0);
  const ssRes = points.reduce((sum, p) => sum + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { slope, intercept, r2, points };
}

/** Одна строка измерений → æ, λ, α, K. */
export function computeRow(
  row: ConductometryRow,
  options: { cellConstant?: number; limitConductivity?: number } = {},
): ConductometryComputed {
  const cellConstant = options.cellConstant ?? DEFAULT_CELL_CONSTANT;
  const limitConductivity = options.limitConductivity ?? DEFAULT_LIMIT_CONDUCTIVITY;
  const empty: ConductometryComputed = {
    id: row.id,
    concentration: row.concentration,
    resistanceKOhm: row.resistanceKOhm,
    conductance: null,
    conductivity: null,
    molarConductivity: null,
    degree: null,
    constant: null,
  };

  if (!(row.concentration > 0)) return { ...empty, error: "Концентрация должна быть больше нуля" };
  if (!(row.resistanceKOhm > 0)) return { ...empty, error: "Сопротивление должно быть больше нуля" };
  if (!(cellConstant > 0)) return { ...empty, error: "Постоянная ячейки должна быть больше нуля" };
  if (!(limitConductivity > 0)) return { ...empty, error: "λ∞ должна быть больше нуля" };

  const conductance = 1 / (row.resistanceKOhm * 1000); // кОм → См
  const conductivity = cellConstant * conductance;
  const molarConductivity = conductivity / row.concentration;
  const degree = molarConductivity / limitConductivity;

  if (degree >= 1) {
    return {
      ...empty,
      conductance,
      conductivity,
      molarConductivity,
      degree,
      error: "α ≥ 1: раствор слишком разбавлен для этой λ∞ — проверьте данные",
    };
  }

  const constant = (degree ** 2 * row.concentration) / (1 - degree);
  return { ...empty, conductance, conductivity, molarConductivity, degree, constant };
}

export function computeRows(
  rows: ConductometryRow[],
  options: { cellConstant?: number; limitConductivity?: number } = {},
): ConductometryComputed[] {
  return rows.map((row) => computeRow(row, options));
}

/** Сводка по константе диссоциации: среднее, отклонение, разброс. */
export function summarize(rows: ConductometryComputed[]): ConductometrySummary {
  const values = rows.map((row) => row.constant).filter((value): value is number => value != null && Number.isFinite(value));
  const totalRows = rows.length;
  if (!values.length) return { meanConstant: null, deviation: null, spread: null, validRows: 0, totalRows };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const deviation = Math.sqrt(variance);
  return {
    meanConstant: mean,
    deviation,
    spread: mean > 0 ? deviation / mean : null,
    validRows: values.length,
    totalRows,
  };
}

/** Пять графиков работы: α(C), æ(C), 1/λ(æ), æ·10⁴(C), 1/λ(λ·C). */
export type ConductometrySeries = {
  id: "alpha" | "conductivity" | "inverse-vs-conductivity" | "scaled-conductivity" | "ostwald";
  title: string;
  xLabel: string;
  yLabel: string;
  points: Array<{ x: number; y: number }>;
};

export function buildSeries(rows: ConductometryComputed[]): ConductometrySeries[] {
  const valid = rows.filter((row) => row.constant != null && row.degree != null && row.molarConductivity != null);
  const series = (id: ConductometrySeries["id"], title: string, xLabel: string, yLabel: string) => ({
    id,
    title,
    xLabel,
    yLabel,
    points: [] as Array<{ x: number; y: number }>,
  });
  const byId = {
    alpha: series("alpha", "α от C", "C, моль/м³", "α"),
    conductivity: series("conductivity", "æ от C", "C, моль/м³", "æ, См/м"),
    inverseVsConductivity: series(
      "inverse-vs-conductivity",
      "1/λ от æ",
      "æ, См/м",
      "1/λ, моль/См·м²",
    ),
    scaledConductivity: series("scaled-conductivity", "æ·10⁴ от C", "C, моль/м³", "æ·10⁴, См/м"),
    ostwald: series("ostwald", "1/λ от λ·C (Оствальд)", "λ·C, См/м", "1/λ, моль/См·м²"),
  };

  for (const row of valid) {
    const c = row.concentration;
    const inverse = 1 / (row.molarConductivity as number);
    byId.alpha.points.push({ x: c, y: row.degree as number });
    byId.conductivity.points.push({ x: c, y: row.conductivity as number });
    byId.inverseVsConductivity.points.push({ x: row.conductivity as number, y: inverse });
    byId.scaledConductivity.points.push({ x: c, y: (row.conductivity as number) * 1e4 });
    byId.ostwald.points.push({ x: (row.molarConductivity as number) * c, y: inverse });
  }

  return Object.values(byId);
}

/** λ∞ и K из линейной формы Оствальда (график 1/λ от λ·C). */
export function fitOstwald(rows: ConductometryComputed[]):
  | { lambdaInfinity: number; constant: number; r2: number }
  | null {
  const series = buildSeries(rows).find((item) => item.id === "ostwald");
  if (!series) return null;
  const fit = linearFit(series.points);
  if (!fit || fit.intercept <= 0 || fit.slope <= 0) return null;
  const lambdaInfinity = 1 / fit.intercept;
  const constant = fit.intercept ** 2 / fit.slope;
  return { lambdaInfinity, constant, r2: fit.r2 };
}

/** Демонстрационные данные: уксусная кислота, φ = 100 1/м, K = 1,8·10⁻⁵ моль/л. */
export function exampleRows(): ConductometryRow[] {
  const cell = DEFAULT_CELL_CONSTANT;
  const lambdaInf = DEFAULT_LIMIT_CONDUCTIVITY;
  const concentrations = [1, 2, 4, 8, 16, 32];
  return concentrations.map((c, index) => {
    // Точное решение K = α²C/(1−α): Cα² + Kα − K = 0.
    // Приближение α ≈ √(K/C) годится только для сильно разбавленных растворов
    // и ломает линейную форму Оствальда на графике 1/λ от λ·C.
    const degree = (-ACETIC_ACID_K + Math.sqrt(ACETIC_ACID_K ** 2 + 4 * ACETIC_ACID_K * c)) / (2 * c);
    const molar = degree * lambdaInf;
    const conductivity = molar * c;
    const conductance = conductivity / cell;
    const resistanceKOhm = 1 / (conductance * 1000);
    // лёгкий «шум» измерения (±0,3 %), чтобы график не был идеально линейным
    const jitter = 1 + (index % 2 === 0 ? 0.003 : -0.002);
    return { id: index + 1, concentration: c, resistanceKOhm: Number((resistanceKOhm * jitter).toFixed(2)) };
  });
}
