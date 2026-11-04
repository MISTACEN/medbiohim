/**
 * Растворы и pH — детерминированные расчёты для практикума.
 *
 * Все формулы классические; приближения подписаны в интерфейсе. Это не
 * замена лабораторному измерению: активности, ионная сила и температура
 * здесь не учитываются.
 */

export type CalcResult<T> = { ok: true; value: T } | { ok: false; error: string };

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

/** pH сильной одноосновной кислоты: [H⁺] ≈ C. */
export function phStrongAcid(c: number): CalcResult<number> {
  if (!Number.isFinite(c) || c <= 0 || c > 1) {
    return { ok: false, error: "Концентрация должна быть в диапазоне (0; 1] моль/л." };
  }
  return { ok: true, value: phFromHydrogen(c) };
}

/** pH сильного основания: [OH⁻] ≈ C, pOH = −lg C. */
export function phStrongBase(c: number): CalcResult<number> {
  if (!Number.isFinite(c) || c <= 0 || c > 1) {
    return { ok: false, error: "Концентрация должна быть в диапазоне (0; 1] моль/л." };
  }
  return { ok: true, value: Math.max(0, Math.min(14, 14 + Math.log10(c))) };
}

/**
 * pH слабой одноосновной кислоты: решение h² + Ka·h − Ka·C = 0.
 * Приближение [H⁺] ≈ √(Ka·C) здесь не используется — оно врёт для сильных
 * разбавлений, где заметен вклад воды.
 */
export function phWeakAcid(ka: number, c: number): CalcResult<number> {
  if (!Number.isFinite(ka) || ka <= 0 || ka >= 1) {
    return { ok: false, error: "Ka должна быть в диапазоне (0; 1)." };
  }
  if (!Number.isFinite(c) || c <= 0 || c > 1) {
    return { ok: false, error: "Концентрация должна быть в диапазоне (0; 1] моль/л." };
  }
  const h = (-ka + Math.sqrt(ka * ka + 4 * ka * c)) / 2;
  return { ok: true, value: phFromHydrogen(h) };
}

/** Уравнение Гендерсона–Хассельбаха для буфера. */
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
