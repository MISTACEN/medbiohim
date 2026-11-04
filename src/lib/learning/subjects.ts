/**
 * Предметные адаптеры для реальных дисциплин MEDBIOHIM.
 *
 * Список slug взят из живой базы (`public.subjects`), а не из референсов:
 * в Supabase есть дубли строк с одинаковым slug (biology ×2,
 * chemistry_organic_physical ×3, physiology ×3, histology ×2). Адаптер
 * привязан к slug, поэтому дубли не создают второй движок и не требуют
 * переименования существующих записей.
 */

import type { SubjectAdapter, SubjectCapability, KnowledgeLevel } from "./types";

const ALL_LEVELS: KnowledgeLevel[] = [1, 2, 3];

export const SUBJECT_ADAPTERS: SubjectAdapter[] = [
  {
    slug: "physiology",
    name: "Физиология",
    aliases: ["fiziologiya", "physiology-normal"],
    levels: ALL_LEVELS,
    capabilities: ["lectures", "tests", "tickets", "cards", "progress", "simulations", "library"],
    simulations: ["membrane-potential"],
    notes: "7 пособий и 35 занятий уже в базе; симуляции добавляются к ним, а не заменяют.",
  },
  {
    slug: "histology",
    name: "Гистология, цитология",
    aliases: ["histology-cytology", "gistologiya"],
    levels: ALL_LEVELS,
    capabilities: ["lectures", "tests", "tickets", "cards", "progress", "atlas", "library", "simulations"],
    simulations: [],
    notes: "178 микропрепаратов и 28 электронограмм; симуляции не дублируют атлас.",
  },
  {
    slug: "chemistry_organic_physical",
    name: "Органическая и физическая химия",
    aliases: ["organic-chemistry", "chemistry-organic"],
    levels: ALL_LEVELS,
    capabilities: [
      "lectures",
      "tests",
      "tickets",
      "cards",
      "progress",
      "simulations",
      "chem_reference",
      "molecule_editor",
      "reactions",
      "labs",
    ],
    simulations: ["buffer-titration"],
    notes: "Существующий химический модуль (118 элементов, лаборатория) сохраняется без переписывания.",
  },
  {
    slug: "inorganic_chemistry",
    name: "Неорганическая химия",
    aliases: ["inorganic-chemistry", "neorganicheskaya-himiya"],
    levels: ALL_LEVELS,
    capabilities: ["lectures", "tests", "tickets", "cards", "progress", "simulations", "chem_reference", "reactions"],
    simulations: ["buffer-titration"],
    notes: "Формат билета: 2 теоретических вопроса + 1 практический + 1 задача.",
  },
  {
    slug: "biology",
    name: "Биология",
    aliases: ["biologiya"],
    levels: ALL_LEVELS,
    capabilities: ["lectures", "tests", "tickets", "cards", "progress", "simulations", "library"],
    simulations: ["enzyme-kinetics"],
    notes: "475 вопросов в базе; цитология и эмбриология связаны с гистологией, а не копируются.",
  },
];

const BY_SLUG = new Map<string, SubjectAdapter>(
  SUBJECT_ADAPTERS.flatMap((adapter) => [
    [adapter.slug, adapter] as const,
    ...adapter.aliases.map((alias) => [alias, adapter] as const),
  ]),
);

export function normalizeSubjectSlug(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Адаптер по slug. Для неизвестного предмета возвращается безопасный
 * минимум — общие лекции/тесты/прогресс, без предметных инструментов.
 */
export function resolveSubjectAdapter(slug: unknown): SubjectAdapter {
  const normalized = normalizeSubjectSlug(slug);
  const known = BY_SLUG.get(normalized);
  if (known) return known;
  return {
    slug: normalized || "unknown",
    name: normalized || "Предмет",
    aliases: [],
    levels: ALL_LEVELS,
    capabilities: ["lectures", "tests", "cards", "progress"],
    simulations: [],
    notes: "Предметный адаптер не настроен: доступны только общие разделы.",
  };
}

export function hasCapability(slug: unknown, capability: SubjectCapability): boolean {
  return resolveSubjectAdapter(slug).capabilities.includes(capability);
}

export function simulationsForSubject(slug: unknown): string[] {
  return resolveSubjectAdapter(slug).simulations;
}
