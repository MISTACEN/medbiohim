import { compareLessons, emPlanRank, isElectronogramCard, lessonKeyOf } from "@/lib/histologyOrder";
import { preparationContains, preparationKey } from "@/shared/histology/preparation-match";

// Ключ препарата — общее правило с Worker (`diagnosticum/model.ts`).
export { preparationKey };

/**
 * Атлас — это только препараты: гистологические микропрепараты и
 * электронограммы. Схемы, методички, тесты и учебники живут в «Материалах»,
 * поэтому попадать в атлас они не должны ни при каком фильтре.
 */
export type AtlasKind = "all" | "preparation" | "electronogram";
export type AtlasSort = "plan" | "name-asc" | "name-desc";

export type AtlasCard = {
  id?: unknown;
  title?: unknown;
  source_key?: unknown;
  tags?: unknown;
  mode_set?: unknown;
  plan_topic_title?: unknown;
  plan_module_title?: unknown;
  preparation?: {
    name?: unknown;
    captions?: unknown;
    imagePath?: unknown;
    imageUrl?: unknown;
  } | null;
};

export type AtlasGroup<T> = { lesson: string; items: T[] };

export type AtlasOptions = {
  kind?: AtlasKind;
  lesson?: string;
  query?: string;
  sort?: AtlasSort;
  /** Электронограммы без фильтра по занятию показываем одним блоком в порядке атласа. */
  singleElectronogramBlock?: boolean;
  /** Методические карточки: по ним работают фильтры по структурам. */
  guides?: Map<string, PreparationGuide> | null;
  filters?: AtlasFilters;
};

/** Заголовок сводного блока электронограмм (порядок трёх рядов атласа). */
export const EM_ATLAS_GROUP = "Электронограммы · порядок атласа";

export function atlasCardName(card: AtlasCard): string {
  const name = String(card.preparation?.name || "").trim();
  if (name) return name;
  return String(card.title || "").trim() || "Препарат";
}

function captionsOf(card: AtlasCard): string[] {
  return Array.isArray(card.preparation?.captions)
    ? (card.preparation?.captions as unknown[]).map(String).filter(Boolean)
    : [];
}

function searchableText(card: AtlasCard): string {
  const tags = Array.isArray(card.tags) ? card.tags.map(String) : [];
  return [
    atlasCardName(card),
    lessonKeyOf(card as never),
    String(card.plan_module_title || ""),
    ...tags,
    ...captionsOf(card),
    String(card.source_key || ""),
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Русские окончания: «кровь» должен находить «мазок крови», «почка» — «почки».
 * Поэтому к слову запроса добавляем усечённые основы, а не только точную форму.
 */
function tokenVariants(token: string): string[] {
  const variants = [token];
  if (token.length >= 5) variants.push(token.slice(0, -1));
  if (token.length >= 7) variants.push(token.slice(0, -2));
  return variants;
}

function matchesQuery(card: AtlasCard, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const text = searchableText(card);
  // «кровь мазок» должно находить карточку, где оба слова встречаются в любом месте.
  return tokens.every((token) => tokenVariants(token).some((variant) => text.includes(variant)));
}

function matchesKind(card: AtlasCard, kind: AtlasKind): boolean {
  const electronogram = isElectronogramCard(card as never);
  if (kind === "electronogram") return electronogram;
  if (kind === "preparation") return !electronogram;
  return true;
}

/** Один препарат может прийти двумя карточками банка — в атласе он должен быть один. */
export function dedupeAtlasCards<T extends AtlasCard>(cards: T[]): T[] {
  const seenId = new Set<string>();
  const seenSource = new Set<string>();
  const seenElectronogramName = new Set<string>();
  const result: T[] = [];
  for (const card of cards) {
    const id = String(card.id || "");
    const source = String(
      card.source_key || card.preparation?.imagePath || card.preparation?.imageUrl || "",
    ).trim();
    const electronogram = isElectronogramCard(card as never);
    const name = electronogram ? atlasCardName(card).toLowerCase() : "";
    if (id && seenId.has(id)) continue;
    if (source && seenSource.has(source)) continue;
    if (name && seenElectronogramName.has(name)) continue;
    if (id) seenId.add(id);
    if (source) seenSource.add(source);
    if (name) seenElectronogramName.add(name);
    result.push(card);
  }
  return result;
}

export function filterAtlasCards<T extends AtlasCard>(cards: T[], options: AtlasOptions = {}): T[] {
  const kind = options.kind ?? "all";
  const lesson = String(options.lesson || "").trim();
  return cards.filter(
    (card) =>
      matchesKind(card, kind) &&
      (!lesson || lessonKeyOf(card as never) === lesson) &&
      matchesQuery(card, String(options.query || "")) &&
      matchesGuideFilters(card, options.guides, options.filters),
  );
}

function byName(a: AtlasCard, b: AtlasCard): number {
  return atlasCardName(a).localeCompare(atlasCardName(b), "ru");
}

function comparator(sort: AtlasSort): (a: AtlasCard, b: AtlasCard) => number {
  if (sort === "name-asc") return byName;
  if (sort === "name-desc") return (a, b) => -byName(a, b);
  // По плану: препараты по алфавиту, затем электронограммы в порядке атласа.
  return (a, b) => {
    const ea = isElectronogramCard(a as never);
    const eb = isElectronogramCard(b as never);
    if (ea !== eb) return ea ? 1 : -1;
    if (ea && eb) return emPlanRank(a as never) - emPlanRank(b as never) || byName(a, b);
    return byName(a, b);
  };
}

export function groupAtlasCards<T extends AtlasCard>(
  cards: T[],
  options: AtlasOptions = {},
): AtlasGroup<T>[] {
  const visible = filterAtlasCards(dedupeAtlasCards(cards), options);
  const kind = options.kind ?? "all";
  const lesson = String(options.lesson || "").trim();
  const singleBlock = options.singleElectronogramBlock !== false && kind === "electronogram" && !lesson;

  const groups = new Map<string, T[]>();
  for (const card of visible) {
    const key = singleBlock ? EM_ATLAS_GROUP : lessonKeyOf(card as never);
    const bucket = groups.get(key);
    if (bucket) bucket.push(card);
    else groups.set(key, [card]);
  }

  const compare = comparator(options.sort ?? "plan");
  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === EM_ATLAS_GROUP) return 1;
      if (b === EM_ATLAS_GROUP) return -1;
      return compareLessons(a, b);
    })
    .map(([title, items]) => ({ lesson: title, items: items.sort(compare) }));
}

export function atlasStats(cards: AtlasCard[]): {
  total: number;
  preparations: number;
  electronograms: number;
} {
  let electronograms = 0;
  for (const card of cards) if (isElectronogramCard(card as never)) electronograms += 1;
  return { total: cards.length, preparations: cards.length - electronograms, electronograms };
}

/** Плоский порядок карточек совпадает с порядком карточек на экране. */
export function flattenAtlasGroups<T>(groups: AtlasGroup<T>[]): T[] {
  return groups.flatMap((group) => group.items);
}

// --- Методические карточки и сортировка по структурам ---------------------

/** Лёгкая методическая карточка: то, что нужно атласу для фильтров. */
export type PreparationGuide = {
  key: string;
  name: string;
  section?: string | null;
  system?: string | null;
  organ?: string | null;
  tissue?: string | null;
  stain?: string | null;
  difficulty?: number | null;
  structures?: string[] | null;
};

/** Дополнительная сортировка: по органу, ткани, структуре и сложности. */
export type AtlasFilters = {
  organ?: string;
  tissue?: string;
  structure?: string;
  difficulty?: number;
};

/** Индекс гидов по ключу и по нормализованному названию препарата. */
export function indexGuides(guides: PreparationGuide[]): Map<string, PreparationGuide> {
  const index = new Map<string, PreparationGuide>();
  for (const guide of guides) {
    if (!guide?.key) continue;
    index.set(preparationKey(guide.key), guide);
    const byName = preparationKey(guide.name);
    if (byName && !index.has(byName)) index.set(byName, guide);
  }
  return index;
}

/**
 * Гид для карточки банка. Название в карточке может быть длиннее методички
 * («Митоз (корешок лука)»), поэтому после точного совпадения ищем вхождение
 * названия гида в название карточки.
 */
export function guideForCard<T extends AtlasCard>(
  card: T,
  guides?: Map<string, PreparationGuide> | null,
): PreparationGuide | null {
  if (!guides || guides.size === 0) return null;
  const key = preparationKey(atlasCardName(card));
  if (!key) return null;
  const direct = guides.get(key);
  if (direct) return direct;
  for (const [name, guide] of guides) {
    if (preparationContains(key, name)) return guide;
  }
  return null;
}

function matchesGuideFilters<T extends AtlasCard>(
  card: T,
  guides: Map<string, PreparationGuide> | null | undefined,
  filters: AtlasFilters | undefined,
): boolean {
  if (!filters) return true;
  const active =
    Boolean(filters.structure || filters.organ || filters.tissue) ||
    Number(filters.difficulty || 0) > 0;
  if (!active) return true;

  const guide = guideForCard(card, guides);
  if (!guide) return false;

  if (filters.structure) {
    const structures = (guide.structures || []).map((value) => String(value));
    if (!structures.includes(filters.structure)) return false;
  }
  if (filters.organ && preparationKey(guide.organ) !== preparationKey(filters.organ)) return false;
  if (filters.tissue && preparationKey(guide.tissue) !== preparationKey(filters.tissue)) return false;
  if (Number(filters.difficulty || 0) > 0 && Number(guide.difficulty || 0) !== Number(filters.difficulty)) {
    return false;
  }
  return true;
}

/** Параметры фильтров для селектов атласа. */
export function guideFacets(guides: PreparationGuide[]): {
  organs: string[];
  tissues: string[];
  difficulties: number[];
} {
  const organs = new Set<string>();
  const tissues = new Set<string>();
  const difficulties = new Set<number>();
  for (const guide of guides) {
    const organ = String(guide.organ || "").trim();
    const tissue = String(guide.tissue || "").trim();
    const level = Number(guide.difficulty || 0);
    if (organ) organs.add(organ);
    if (tissue) tissues.add(tissue);
    if (level >= 1 && level <= 3) difficulties.add(level);
  }
  return {
    organs: Array.from(organs).sort((a, b) => a.localeCompare(b, "ru")),
    tissues: Array.from(tissues).sort((a, b) => a.localeCompare(b, "ru")),
    difficulties: Array.from(difficulties).sort(),
  };
}

/** Подписи сложности совпадают с программой диагностикума. */
export function difficultyLabel(level: number | null | undefined): string {
  if (level === 1) return "Начальный";
  if (level === 2) return "Средний";
  if (level === 3) return "Продвинутый";
  return "Без уровня";
}
