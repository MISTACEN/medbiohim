/**
 * Связь тем генератора задач по химии с календарно-тематическим планом
 * кафедры, который показывает ChemPlan.
 *
 * Принцип: ссылка ставится только там, где в плане есть дословное место про ту
 * же тему. Каждая ссылка хранит `quote` — фрагмент названия занятия или его
 * темы — и тест `chemPlanLinks.test.ts` сверяет его с настоящим JSON плана.
 * Если темы в плане нет, честно возвращается `anchor: null`, а не «похожая»
 * пара.
 */

import type { PracticeTopic } from "./practice";

/** Файл плана кафедры органической и физической химии. */
export const CHEM_PLAN_FILE = "chem/plan-organic-2025-2026.json";
/** Страница предмета с вкладкой плана — оттуда открывается ChemPlan. */
export const CHEM_PLAN_HREF = "/subjects/organic_chemistry?tab=plan";

export type PlanAnchor = {
  kind: "lab" | "lecture";
  n: number;
  /** Дословный фрагмент названия занятия или его темы в плане. */
  quote: string;
};

export type TopicPlanLink = {
  topic: PracticeTopic;
  anchor: PlanAnchor | null;
  /** Что именно связывает тему с занятием (или почему связи нет). */
  note: string;
};

export const TOPIC_PLAN_LINKS: TopicPlanLink[] = [
  {
    topic: "ph",
    anchor: { kind: "lab", n: 4, quote: "кислотных и основных свойств" },
    note: "Занятие 4 — оценка кислотных и основных свойств; задачи считают pH тех же растворов.",
  },
  {
    topic: "titration",
    anchor: null,
    note: "В плане кафедры титрование не разбирается — это внешняя расчётная практика.",
  },
  {
    topic: "concentration",
    anchor: null,
    note: "Готовить растворы заданной концентрации в плане орг. химии не учат.",
  },
  {
    topic: "dilution",
    anchor: null,
    note: "Разведение растворов в плане кафедры не выделено отдельной темой.",
  },
  {
    topic: "molar_mass",
    anchor: null,
    note: "Молярная масса — инструмент расчёта, отдельного занятия в плане нет.",
  },
  {
    topic: "gas",
    anchor: null,
    note: "Газовые законы в плане органической химии не встречаются.",
  },
  {
    topic: "kinetics",
    anchor: null,
    note: "План разбирает механизмы реакций, а не кинетику (порядок, период полураспада).",
  },
  {
    topic: "calorimetry",
    anchor: null,
    note: "Термохимия в плане кафедры не предусмотрена.",
  },
];

export function planLinkFor(topic: PracticeTopic): TopicPlanLink | undefined {
  return TOPIC_PLAN_LINKS.find((link) => link.topic === topic);
}

/** Подпись ссылки для интерфейса: «лаб. 4 · занятие» или «вне плана». */
export function planAnchorLabel(anchor: PlanAnchor | null): string {
  if (!anchor) return "вне плана кафедры";
  return `${anchor.kind === "lab" ? "лаб." : "лекция"} ${anchor.n}`;
}
