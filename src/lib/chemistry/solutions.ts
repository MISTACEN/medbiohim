/**
 * Растворы и pH — детерминированные расчёты для практикума.
 *
 * Все расчёты кислот/оснований учитывают автоионизацию воды (Kw = 1·10⁻¹⁴).
 * Это принципиально для разбавленных растворов: без члена Kw калькулятор
 * выдавал бы pH 8 для 10⁻⁸ M HCl, что физически невозможно. Уравнение
 * электронейтральности решается численно, а не aproximation √(Ka·C).
 *
 * Ограничения модели: активности заменены концентрациями, ионная сила и
 * температура (Kw зависит от неё) не учитываются.
 */

export type CalcResult<T> = { ok: true; value: T } | { ok: false; error: string };

const KW = 1e-14;

/** Ниже этой концентрации вклад воды уже заметен — интерфейс предупреждает. */
export const WATER_LIMIT = 1e-6;

export function isWaterLimited(c: number): boolean {
  return Number.isFinite(c) && c > 0 && c < WATER_LIMIT;
}

/** C₁V₁ = C₂V₂: объём исходного раствора для разведения. */
export function stockVolume(
  c1: number,
  c2: number,
  v2: number,
): CalcResult<{ stockVolumeMl: number; solventVolumeMl: number }> {
  if (![c1, c2, v2].every((value) => Number.isFinite(value) && value > 0)) {
    return { ok: false, error: "Концентрации и объём должны быть больше нуля." };
  }
  if (c2 > c1) {
    return { ok: false, error: "Разбавлением нельзя повысить концентрацию — проверьте C₁ и C₂." };
  }
  const stockVolumeMl = (c2 * v2) / c1;
  return {
    ok: true,
    value: { stockVolumeMl, solventVolumeMl: Math.max(0, v2 - stockVolumeMl) },
  };
}

function phFromHydrogen(h: number): number {
  return Math.max(0, Math.min(14, -Math.log10(h)));
}

/**
 * Сильная кислота. Электронейтральность: [H⁺] = C + Kw/[H⁺],
 * откуда [H⁺]² − C·[H⁺] − Kw = 0.
 */
export function phStrongAcid(c: number): CalcResult<number> {
  if (!Number.isFinite(c) || c <= 0 || c > 1) {
    return { ok: false, error: "Концентрация должна быть в диапазоне (0; 1] моль/л." };
  }
  const h = (c + Math.sqrt(c * c + 4 * KW)) / 2;
  return { ok: true, value: phFromHydrogen(h) };
}

/**
 * Сильное основание. Аналогично: [OH⁻]² − C·[OH⁻] − Kw = 0,
 * pH = 14 − pOH.
 */
export function phStrongBase(c: number): CalcResult<number> {
  if (!Number.isFinite(c) || c <= 0 || c > 1) {
    return { ok: false, error: "Концентрация должна быть в диапазоне (0; 1] моль/л." };
  }
  const oh = (c + Math.sqrt(c * c + 4 * KW)) / 2;
  return { ok: true, value: Math.max(0, Math.min(14, 14 + Math.log10(oh))) };
}

/**
 * Слабая одноосновная кислота. Электронейтральность:
 * [H⁺] = Kw/[H⁺] + C·Ka/(Ka + [H⁺]).
 *
 * Функция f(h) = h − Kw/h − C·Ka/(Ka+h) монотонно возрастает, поэтому
 * корень ищется бисекцией по lg h на [−14; 1]. Это эквивалентно решению
 * кубического уравнения, но устойчивее к масштабу концентраций.
 */
export function phWeakAcid(ka: number, c: number): CalcResult<number> {
  if (!Number.isFinite(ka) || ka <= 0 || ka >= 1) {
    return { ok: false, error: "Ka должна быть в диапазоне (0; 1)." };
  }
  if (!Number.isFinite(c) || c <= 0 || c > 1) {
    return { ok: false, error: "Концентрация должна быть в диапазоне (0; 1] моль/л." };
  }
  const charge = (h: number) => h - KW / h - (c * ka) / (ka + h);
  let low = -14;
  let high = 1;
  for (let step = 0; step < 200; step += 1) {
    const middle = (low + high) / 2;
    if (charge(Math.pow(10, middle)) > 0) high = middle;
    else low = middle;
  }
  return { ok: true, value: phFromHydrogen(Math.pow(10, (low + high) / 2)) };
}

/**
 * Уравнение Гендерсона–Хассельбаха для буфера. Применимо, когда
 * концентрации компонентов заметно выше вклада воды; для предельно
 * разбавленных буферов нужен полный charge balance, который здесь не
 * моделируется.
 */
export function phBuffer(ka: number, acid: number, base: number): CalcResult<number> {
  if (!Number.isFinite(ka) || ka <= 0 || ka >= 1) {
    return { ok: false, error: "Ka должна быть в диапазоне (0; 1)." };
  }
  if (![acid, base].every((value) => Number.isFinite(value) && value > 0)) {
    return { ok: false, error: "Концентрации кислоты и основания должны быть больше нуля." };
  }
  return { ok: true, value: Math.max(0, Math.min(14, -Math.log10(ka) + Math.log10(base / acid))) };
}

/** Ka из pKa — удобно для ввода табличного значения. */
export function kaFromPka(pka: number): CalcResult<number> {
  if (!Number.isFinite(pka) || pka < 0 || pka > 14) {
    return { ok: false, error: "pKa должен быть в диапазоне 0…14." };
  }
  return { ok: true, value: Math.pow(10, -pka) };
}
