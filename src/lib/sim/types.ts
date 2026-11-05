/**
 * Контракт общего движка симуляций.
 *
 * Движок и содержимое разделены: страница знает только этот контракт, а
 * новая симуляция — это объект данных с чистой функцией `compute`. Поэтому
 * физиология, химия и биохимия используют один плеер (раздел 12 задания).
 */

import type { KnowledgeLevel, SourceAttribution } from "@/lib/learning/types";

export type SimParams = Record<string, number>;
export type SimOutputs = Record<string, number>;

export type SimParameter = {
  id: string;
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** Зачем параметр нужен студенту. */
  description?: string;
};

export type SimOutput = {
  id: string;
  label: string;
  unit?: string;
  description?: string;
  /** Знаков после запятой в интерфейсе. */
  precision?: number;
};

export type SimStep = {
  id: string;
  title: string;
  explanation: string;
  /** Какие выходы показывать на этом шаге (id из `outputs`). */
  outputs?: string[];
};

export type SimComputation = {
  outputs: SimOutputs;
  notes: string[];
  /** Предупреждение о границах применимости при текущих параметрах. */
  warning?: string;
};

export type SimSweep = {
  paramId: string;
  from: number;
  to: number;
  points: number;
  xLabel: string;
  /** id выхода, который откладывается по Y. */
  outputId: string;
  yLabel: string;
};

export type SimCheck = {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export type SimDefinition = {
  slug: string;
  title: string;
  subjectSlug: string;
  level: KnowledgeLevel;
  summary: string;
  /** Что именно моделируется и чего в модели нет. */
  assumptions: string[];
  source: SourceAttribution;
  parameters: SimParameter[];
  outputs: SimOutput[];
  steps: SimStep[];
  compute: (params: SimParams) => SimComputation;
  sweep?: SimSweep;
  check: SimCheck;
  /**
   * Специальная визуализация в общем плеере (анимация механизма).
   * Плеер рисует её вместо плоского списка этапов; без флага — обычный вид.
   */
  visual?: "na-k-pump";
};

export type SimEvaluation = {
  params: SimParams;
  outputs: SimOutputs;
  notes: string[];
  warning?: string;
};

export type SimPoint = { x: number; y: number };
