/**
 * Периодическая таблица химических элементов: типы, валидатор, поиск и подписи.
 *
 * Данные НЕ хардкодятся: единственный источник значений — снимок
 * `src/data/chemical-elements.json`. Снимок собран из проверяемых публичных
 * датасетов (см. `meta.sources` внутри JSON):
 *
 * - основной набор: Bowserinator/Periodic-Table-JSON (commit a78c7a4,
 *   снимок 2026-10-29). Лицензия в репозитории не указана (GitHub API:
 *   NOASSERTION), README разрешает свободное использование, данные собраны
 *   из Википедии (CC BY-SA 3.0);
 * - русские названия: метки Wikidata (CC0 1.0) по свойствам P246 (символ)
 *   и P1086 (атомный номер), первая буква приведена к заглавной;
 * - сверка атомных масс и символов: PubChem PUG REST periodictable (NIH,
 *   public domain).
 *
 * Метаданные снимка (URL, дата, лицензия, отчёт о сверке) лежат в `meta`,
 * а не в этом файле, поэтому тесты проверяют их прямо в JSON.
 */
import datasetJson from "@/data/chemical-elements.json";

export const ELEMENT_COUNT = 118;
export const GROUP_COUNT = 18;
export const PERIOD_COUNT = 7;

export type ElementPhase = "Solid" | "Liquid" | "Gas";
export type ElementBlock = "s" | "p" | "d" | "f";

/** Запись об элементе — ровно те поля, которые есть в снимке источника. */
export interface ChemicalElement {
  number: number;
  symbol: string;
  name_en: string;
  name_ru: string;
  atomic_mass: number;
  group: number;
  period: number;
  category: string;
  block: ElementBlock;
  phase: ElementPhase;
  electron_configuration: string;
  electron_configuration_semantic: string;
  xpos: number;
  ypos: number;
  discovered_by: string | null;
  named_by: string | null;
  wikidata: string;
  wikipedia: string;
}

export interface ElementsDatasetSource {
  id: string;
  role: "primary" | "russian-names" | "verification";
  title: string;
  url: string;
  homepage?: string;
  commit?: string;
  retrieved: string;
  license: string;
  attribution: string;
  fields: string;
  query?: string;
}

export interface ElementsMassOutlier {
  number: number;
  symbol: string;
  stored: number;
  pubchem: number;
  difference: number;
}

export interface ElementsVerification {
  checkedAt: string;
  method: string;
  independentSource: string;
  symbolMatches: number;
  nameEnMatches: number;
  exactMassMatches: number;
  massWithinTolerance: number;
  massTolerance: number;
  massOutliers: ElementsMassOutlier[];
  massOutlierNote: string;
  samples: Array<{
    number: number;
    element: string;
    stored: number;
    pubchem: number;
    difference: number;
    symbolMatch: boolean;
    nameEnMatch: boolean;
  }>;
}

export interface ElementsDatasetMeta {
  title: string;
  snapshotDate: string;
  elementCount: number;
  source: string;
  license: string;
  attribution: string;
  sources: ElementsDatasetSource[];
  verification: ElementsVerification;
}

export interface ChemicalElementsDataset {
  meta: ElementsDatasetMeta;
  elements: ChemicalElement[];
}

export interface ElementsValidationResult {
  valid: boolean;
  errors: string[];
}

/** Русские подписи категорий — так, как они названы в источнике. */
export const CATEGORY_LABELS_RU: Record<string, string> = {
  "alkali metal": "Щелочные металлы",
  "alkaline earth metal": "Щёлочноземельные металлы",
  "transition metal": "Переходные металлы",
  "post-transition metal": "Постпереходные металлы",
  lanthanide: "Лантаноиды",
  actinide: "Актиноиды",
  metalloid: "Металлоиды",
  "diatomic nonmetal": "Двухатомные неметаллы",
  "polyatomic nonmetal": "Многоатомные неметаллы",
  "noble gas": "Благородные газы",
  "unknown, probably transition metal": "Неизвестно — вероятно, переходный металл",
  "unknown, probably post-transition metal": "Неизвестно — вероятно, постпереходный металл",
  "unknown, probably metalloid": "Неизвестно — вероятно, металлоид",
  "unknown, predicted to be noble gas": "Неизвестно — предсказан благородный газ",
};

/** Порядок категорий для легенды и фильтра. */
export const CATEGORY_ORDER: string[] = [
  "alkali metal",
  "alkaline earth metal",
  "transition metal",
  "post-transition metal",
  "lanthanide",
  "actinide",
  "metalloid",
  "diatomic nonmetal",
  "polyatomic nonmetal",
  "noble gas",
  "unknown, probably transition metal",
  "unknown, probably post-transition metal",
  "unknown, probably metalloid",
  "unknown, predicted to be noble gas",
];

export const PHASE_LABELS_RU: Record<ElementPhase, string> = {
  Solid: "Твёрдое",
  Liquid: "Жидкое",
  Gas: "Газ",
};

export const BLOCK_LABELS_RU: Record<ElementBlock, string> = {
  s: "s-блок",
  p: "p-блок",
  d: "d-блок",
  f: "f-блок",
};

const PHASES = new Set<string>(Object.keys(PHASE_LABELS_RU));
const BLOCKS = new Set<string>(Object.keys(BLOCK_LABELS_RU));
const SYMBOL_PATTERN = /^[A-Z][a-z]?$/;
const CYRILLIC_PATTERN = /[А-Яа-яЁё]/;
const QID_PATTERN = /^Q\d+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Строгий валидатор снимка: 118 элементов, непрерывные номера 1..118,
 * уникальные символы, допустимые группа/период/блок/агрегатное состояние,
 * положительная атомная масса, кириллица в русском названии и метаданные
 * об источнике. Возвращает все найденные ошибки, а не первую.
 */
export function validateElementsDataset(input: unknown): ElementsValidationResult {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { valid: false, errors: ["Снимок данных должен быть JSON-объектом"] };
  }

  const meta = input.meta;
  if (!isRecord(meta)) {
    errors.push("meta: отсутствует блок с источником данных");
  } else {
    for (const key of ["title", "snapshotDate", "source", "license", "attribution"] as const) {
      if (!isNonEmptyString(meta[key])) errors.push(`meta.${key}: обязательное непустое поле`);
    }
    if (!Array.isArray(meta.sources) || meta.sources.length === 0) {
      errors.push("meta.sources: нужен хотя бы один источник с URL и лицензией");
    }
    if (meta.elementCount !== ELEMENT_COUNT) {
      errors.push(`meta.elementCount: ожидалось ${ELEMENT_COUNT}, получено ${String(meta.elementCount)}`);
    }
  }

  const rawElements = input.elements;
  if (!Array.isArray(rawElements)) {
    errors.push("elements: должен быть массивом элементов");
    return { valid: false, errors };
  }
  if (rawElements.length !== ELEMENT_COUNT) {
    errors.push(`elements: ожидалось ${ELEMENT_COUNT} элементов, получено ${rawElements.length}`);
  }

  const seenNumbers = new Set<number>();
  const seenSymbols = new Set<string>();

  rawElements.forEach((raw, index) => {
    if (!isRecord(raw)) {
      errors.push(`elements[${index}]: запись должна быть объектом`);
      return;
    }
    const label =
      typeof raw.number === "number" ? `Элемент №${raw.number}` : `elements[${index}]`;

    if (!isIntegerInRange(raw.number, 1, ELEMENT_COUNT)) {
      errors.push(`${label}: атомный номер должен быть целым числом 1..${ELEMENT_COUNT}`);
    } else if (seenNumbers.has(raw.number)) {
      errors.push(`${label}: дубликат атомного номера ${raw.number}`);
    } else {
      seenNumbers.add(raw.number);
    }

    if (typeof raw.symbol !== "string" || !SYMBOL_PATTERN.test(raw.symbol)) {
      errors.push(`${label}: символ должен быть непустым латинским обозначением вида Fe`);
    } else if (seenSymbols.has(raw.symbol)) {
      errors.push(`${label}: дубликат символа ${raw.symbol}`);
    } else {
      seenSymbols.add(raw.symbol);
    }

    if (!isNonEmptyString(raw.name_en)) errors.push(`${label}: пустое латинское название (name_en)`);
    if (!isNonEmptyString(raw.name_ru)) {
      errors.push(`${label}: пустое русское название (name_ru)`);
    } else if (!CYRILLIC_PATTERN.test(raw.name_ru)) {
      errors.push(`${label}: name_ru должно содержать кириллицу`);
    }

    if (typeof raw.atomic_mass !== "number" || !Number.isFinite(raw.atomic_mass) || raw.atomic_mass <= 0) {
      errors.push(`${label}: атомная масса должна быть положительным числом`);
    }

    if (!isIntegerInRange(raw.group, 1, GROUP_COUNT)) {
      errors.push(`${label}: группа должна быть целым числом 1..${GROUP_COUNT}`);
    }
    if (!isIntegerInRange(raw.period, 1, PERIOD_COUNT)) {
      errors.push(`${label}: период должен быть целым числом 1..${PERIOD_COUNT}`);
    }
    if (typeof raw.category !== "string" || !isNonEmptyString(raw.category)) {
      errors.push(`${label}: пустая категория`);
    }
    if (typeof raw.block !== "string" || !BLOCKS.has(raw.block)) {
      errors.push(`${label}: блок должен быть одним из s, p, d, f`);
    }
    if (typeof raw.phase !== "string" || !PHASES.has(raw.phase)) {
      errors.push(`${label}: состояние должно быть Solid, Liquid или Gas`);
    }
    if (!isNonEmptyString(raw.electron_configuration)) {
      errors.push(`${label}: пустая электронная конфигурация`);
    }
    if (!isNonEmptyString(raw.electron_configuration_semantic)) {
      errors.push(`${label}: пустая краткая электронная конфигурация`);
    }

    if (!isIntegerInRange(raw.xpos, 1, GROUP_COUNT)) {
      errors.push(`${label}: xpos должен быть целым числом 1..${GROUP_COUNT}`);
    }
    if (!isIntegerInRange(raw.ypos, 1, PERIOD_COUNT + 3)) {
      errors.push(`${label}: ypos должен быть целым числом 1..${PERIOD_COUNT + 3}`);
    }

    if (!(raw.discovered_by === null || typeof raw.discovered_by === "string")) {
      errors.push(`${label}: discovered_by должен быть строкой или null`);
    }
    if (!(raw.named_by === null || typeof raw.named_by === "string")) {
      errors.push(`${label}: named_by должен быть строкой или null`);
    }
    if (typeof raw.wikidata !== "string" || !QID_PATTERN.test(raw.wikidata)) {
      errors.push(`${label}: wikidata должен быть Q-id вида Q123`);
    }
    if (typeof raw.wikipedia !== "string" || !raw.wikipedia.startsWith("https://")) {
      errors.push(`${label}: wikipedia должен быть https-ссылкой`);
    }
  });

  if (seenNumbers.size === ELEMENT_COUNT) {
    for (let number = 1; number <= ELEMENT_COUNT; number += 1) {
      if (!seenNumbers.has(number)) errors.push(`Пропущен элемент с атомным номером ${number}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export class ElementsDatasetError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`Некорректный снимок химических элементов: ${errors.slice(0, 3).join("; ")}`);
    this.name = "ElementsDatasetError";
    this.errors = errors;
  }
}

/** Проверенный парсер: возвращает копию, отсортированную по атомному номеру, или бросает ошибку. */
export function parseElementsDataset(input: unknown): ChemicalElementsDataset {
  const { valid, errors } = validateElementsDataset(input);
  if (!valid) throw new ElementsDatasetError(errors);
  const { meta, elements } = input as ChemicalElementsDataset;
  return { meta, elements: [...elements].sort((a, b) => a.number - b.number) };
}

/** Результат валидации реального снимка — используется UI, чтобы показать понятную ошибку. */
export const elementsValidation: ElementsValidationResult = validateElementsDataset(datasetJson);

const dataset: ChemicalElementsDataset = elementsValidation.valid
  ? (datasetJson as unknown as ChemicalElementsDataset)
  : { meta: datasetJson.meta as unknown as ElementsDatasetMeta, elements: [] };

export const elementsMeta: ElementsDatasetMeta = dataset.meta;

/** Все 118 элементов, отсортированные по атомному номеру (пусто, если снимок невалиден). */
export const chemicalElements: ChemicalElement[] = [...dataset.elements].sort((a, b) => a.number - b.number);

const byNumber = new Map<number, ChemicalElement>();
const bySymbol = new Map<string, ChemicalElement>();
for (const element of chemicalElements) {
  byNumber.set(element.number, element);
  bySymbol.set(element.symbol.toLowerCase(), element);
}

export function getElementByNumber(number: number): ChemicalElement | undefined {
  return byNumber.get(number);
}

export function getElementBySymbol(symbol: string): ChemicalElement | undefined {
  return bySymbol.get(symbol.trim().toLowerCase());
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, "е");
}

/**
 * Поиск по номеру, символу и названию (русскому и латинскому).
 * «26» → железо, «Fe»/«fe» → железо, «железо»/«желез» → железо.
 */
export function matchesQuery(element: ChemicalElement, query: string): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  if (/^\d+$/.test(needle)) return String(element.number) === needle;
  if (element.symbol.toLowerCase() === needle) return true;
  return normalize(element.name_ru).includes(needle) || normalize(element.name_en).includes(needle);
}

export function searchElements(query: string, list: readonly ChemicalElement[] = chemicalElements): ChemicalElement[] {
  const needle = normalize(query);
  if (!needle) return [...list];
  // Сначала точное совпадение по символу: «Fe» — это железо, а не «Fermium».
  if (/^[a-z]{1,2}$/.test(needle)) {
    const bySymbol = list.filter((element) => element.symbol.toLowerCase() === needle);
    if (bySymbol.length > 0) return bySymbol;
  }
  return list.filter((element) => matchesQuery(element, query));
}

export function filterElements(
  filters: { query?: string; category?: string | null },
  list: readonly ChemicalElement[] = chemicalElements
): ChemicalElement[] {
  const category = filters.category?.trim();
  const byCategory = category ? list.filter((element) => element.category === category) : [...list];
  return searchElements(filters.query ?? "", byCategory);
}

export function categoryLabelRu(category: string): string {
  return CATEGORY_LABELS_RU[category] ?? category;
}

export function phaseLabelRu(phase: string): string {
  return PHASE_LABELS_RU[phase as ElementPhase] ?? phase;
}

export function blockLabelRu(block: string): string {
  return BLOCK_LABELS_RU[block as ElementBlock] ?? block;
}

export function formatAtomicMass(mass: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 6 }).format(mass);
}

/** Категории, реально встречающиеся в снимке, в порядке легенды. */
export function categoriesWithCounts(
  list: readonly ChemicalElement[] = chemicalElements
): Array<{ category: string; label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const element of list) counts.set(element.category, (counts.get(element.category) ?? 0) + 1);
  const known = CATEGORY_ORDER.filter((category) => counts.has(category));
  const extra = [...counts.keys()].filter((category) => !CATEGORY_ORDER.includes(category));
  return [...known, ...extra].map((category) => ({
    category,
    label: categoryLabelRu(category),
    count: counts.get(category) ?? 0,
  }));
}

export function elementAriaLabel(element: ChemicalElement): string {
  return `${element.name_ru}, ${element.symbol}, атомный номер ${element.number}, атомная масса ${formatAtomicMass(
    element.atomic_mass
  )}`;
}

/** Подпись источника для футера таблицы — тоже берётся из снимка, не из воздуха. */
export function primarySourceLabel(meta: ElementsDatasetMeta = elementsMeta): string {
  const primary = meta.sources.find((source) => source.role === "primary");
  const commit = primary?.commit ? `, commit ${primary.commit.slice(0, 7)}` : "";
  return `${primary?.title ?? meta.source}${commit} · снимок ${meta.snapshotDate}`;
}
