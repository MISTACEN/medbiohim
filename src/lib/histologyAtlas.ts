import { compareLessons, emPlanRank, isElectronogramCard, lessonKeyOf } from "@/lib/histologyOrder";

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
      matchesQuery(card, String(options.query || "")),
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
