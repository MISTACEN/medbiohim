/**
 * Общий движок симуляций: валидация параметров, расчёт, кривая для графика.
 * Никакой физики здесь нет — только контракт и безопасная арифметика.
 */

import type {
  SimDefinition,
  SimEvaluation,
  SimParams,
  SimPoint,
} from "./types";

/** Значения по умолчанию для формы. */
export function defaultParams(definition: SimDefinition): SimParams {
  const params: SimParams = {};
  for (const parameter of definition.parameters) {
    params[parameter.id] = parameter.default;
  }
  return params;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Приводит вход к допустимому диапазону. Нечисловые значения заменяются
 * значением по умолчанию: симуляция не должна падать из-за пустого поля.
 */
export function sanitizeParams(definition: SimDefinition, input: SimParams): SimParams {
  const params: SimParams = {};
  for (const parameter of definition.parameters) {
    const raw = input[parameter.id];
    const candidate = typeof raw === "number" && Number.isFinite(raw) ? raw : parameter.default;
    params[parameter.id] = clamp(candidate, parameter.min, parameter.max);
  }
  return params;
}

/** Один расчёт с проверкой результата. */
export function evaluate(definition: SimDefinition, input: SimParams): SimEvaluation {
  const params = sanitizeParams(definition, input);
  const computation = definition.compute(params);
  const outputs = Object.fromEntries(
    Object.entries(computation.outputs).map(([key, value]) => [
      key,
      Number.isFinite(value) ? value : 0,
    ]),
  );
  return {
    params,
    outputs,
    notes: computation.notes,
    warning: computation.warning,
  };
}

/**
 * Кривая для графика: перебирает один параметр в заданном диапазоне.
 * Точки за пределами параметра обрезаются, чтобы график не показывал
 * состояния, которые форма выставить не может.
 */
export function computeCurve(
  definition: SimDefinition,
  input: SimParams,
  points?: number,
): SimPoint[] {
  const sweep = definition.sweep;
  if (!sweep) return [];
  const parameter = definition.parameters.find((item) => item.id === sweep.paramId);
  if (!parameter) return [];

  const from = clamp(Math.min(sweep.from, sweep.to), parameter.min, parameter.max);
  const to = clamp(Math.max(sweep.from, sweep.to), parameter.min, parameter.max);
  const count = Math.max(2, Math.min(400, Math.round(points ?? sweep.points)));
  const base = sanitizeParams(definition, input);
  const result: SimPoint[] = [];

  for (let index = 0; index < count; index += 1) {
    const ratio = index / (count - 1);
    const x = from + (to - from) * ratio;
    const evaluation = evaluate(definition, { ...base, [sweep.paramId]: x });
    const y = evaluation.outputs[sweep.outputId];
    if (Number.isFinite(y)) result.push({ x, y });
  }
  return result;
}

export function formatOutput(value: number, precision = 2): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  return value.toFixed(precision);
}
