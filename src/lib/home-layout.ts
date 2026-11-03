/**
 * Раскладка главной страницы: какие блоки показывать, в каком порядке и какой ширины.
 *
 * Хранится в двух местах:
 * - localStorage — мгновенно, работает даже при недоступном API;
 * - user_preferences (`home_layout`, `home_note`) — чтобы раскладка ехала за аккаунтом.
 *
 * Значения из хранилища всегда проходят sanitizeLayout: неизвестные id и ширины
 * отбрасываются, дубликаты схлопываются, пустая раскладка заменяется стандартной.
 */

export const HOME_WIDGET_IDS = [
  "today",
  "academic",
  "tests",
  "subjects",
  "homeworkList",
  "announcements",
  "debts",
  "note",
] as const;

export type HomeWidgetId = (typeof HOME_WIDGET_IDS)[number];

export type HomeSpan = "third" | "half" | "full";

export type HomeWidget = {
  id: HomeWidgetId;
  span: HomeSpan;
};

export type HomeLayout = HomeWidget[];

export type HomePreferences = {
  layout: HomeLayout;
  note: string;
};

export type HomeSyncState = "idle" | "saving" | "saved" | "local" | "error";

export const HOME_WIDGET_LABELS: Record<HomeWidgetId, string> = {
  today: "Сегодня / Завтра",
  academic: "Учебный прогресс",
  tests: "Тесты",
  subjects: "Мои предметы",
  homeworkList: "Список заданий",
  announcements: "Объявления",
  debts: "Академические долги",
  note: "Моя заметка",
};

export const HOME_WIDGET_HINTS: Record<HomeWidgetId, string> = {
  today: "Пары, темы, задания и аттестации ближайшего учебного дня",
  academic: "Метрики и план подготовки",
  tests: "Доступные тесты и быстрый переход",
  subjects: "Предметы курса и быстрые ссылки",
  homeworkList: "Последние задания со сроками",
  announcements: "Объявления группы",
  debts: "Долги, которые видит академический модуль",
  note: "Свободный текст: что не забыть сегодня",
};

// Адаптивная сетка: одна колонка на телефоне, две на планшете (sm),
// шесть на десктопе (lg+). Половина на планшете — во всю ширину,
// чтобы карточки не сжимались в нечитаемую полосу.
export const HOME_SPAN_CLASS: Record<HomeSpan, string> = {
  third: "sm:col-span-1 lg:col-span-2",
  half: "sm:col-span-2 lg:col-span-3",
  full: "sm:col-span-2 lg:col-span-6",
};

export const HOME_SPAN_LABELS: Record<HomeSpan, string> = {
  third: "Узкий",
  half: "Половина",
  full: "Весь",
};

/** Стандартный вид: сводка дня во всю ширину, дальше — прогресс, тесты/задания в строку. */
export const DEFAULT_LAYOUT: HomeLayout = [
  { id: "today", span: "full" },
  { id: "academic", span: "full" },
  { id: "tests", span: "half" },
  { id: "homeworkList", span: "half" },
  { id: "subjects", span: "full" },
  { id: "announcements", span: "full" },
  { id: "debts", span: "full" },
];

const SPANS: HomeSpan[] = ["third", "half", "full"];

export function defaultHomeLayout(): HomeLayout {
  return DEFAULT_LAYOUT.map((widget) => ({ ...widget }));
}

export function defaultSpanFor(id: HomeWidgetId): HomeSpan {
  return DEFAULT_LAYOUT.find((widget) => widget.id === id)?.span ?? "half";
}

function isWidgetId(value: unknown): value is HomeWidgetId {
  return typeof value === "string" && (HOME_WIDGET_IDS as readonly string[]).includes(value);
}

function isSpan(value: unknown): value is HomeSpan {
  return typeof value === "string" && (SPANS as string[]).includes(value);
}

/**
 * Приводит произвольное значение к безопасной раскладке.
 * `null` — данных нет; массив с мусором — валидные блоки без мусора.
 */
export function parseLayout(value: unknown): HomeLayout | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<HomeWidgetId>();
  const layout: HomeLayout = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const id = raw.id;
    if (!isWidgetId(id) || seen.has(id)) continue;
    seen.add(id);
    layout.push({ id, span: isSpan(raw.span) ? raw.span : defaultSpanFor(id) });
  }
  return layout.length ? layout : null;
}

export function sanitizeLayout(value: unknown): HomeLayout {
  return parseLayout(value) ?? defaultHomeLayout();
}

/**
 * Миграция старой раскладки (до совмещённого блока «Сегодня / Завтра»):
 * «Ближайшее занятие» (schedule) заменяется на сводку дня во всю ширину,
 * «Домашние задания» (homework) поглощаются сводкой. Раскладки, где старых
 * блоков уже нет, не трогаем — пользователь сам решил, что показывать.
 *
 * Разбор сырого значения здесь свой, а не через parseLayout: тот отбрасывает
 * неизвестные id до миграции, и устаревшие блоки дошли бы уже отфильтрованные.
 */
export function migrateLayout(value: unknown): HomeLayout | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<HomeWidgetId>();
  const layout: HomeLayout = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const id = raw.id;
    if (typeof id !== "string") continue;
    // Устаревшие блоки v1: «schedule» становится сводкой дня, «homework» — её частью.
    if (id === "schedule" || id === "homework") {
      if (!seen.has("today")) {
        seen.add("today");
        layout.push({ id: "today", span: "full" });
      }
      continue;
    }
    if (!isWidgetId(id) || seen.has(id)) continue;
    seen.add(id);
    layout.push({ id, span: isSpan(raw.span) ? raw.span : defaultSpanFor(id) });
  }
  return layout.length ? layout : null;
}

export function moveWidget(layout: HomeLayout, from: number, to: number): HomeLayout {
  if (from === to || from < 0 || to < 0 || from >= layout.length || to >= layout.length) {
    return layout;
  }
  const next = [...layout];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function isDefaultLayout(layout: HomeLayout, note = ""): boolean {
  if (note.trim() !== "") return false;
  if (layout.length !== DEFAULT_LAYOUT.length) return false;
  return layout.every((widget, index) => {
    const base = DEFAULT_LAYOUT[index];
    return widget.id === base.id && widget.span === base.span;
  });
}

export function visibleWidgetIds(layout: HomeLayout): HomeWidgetId[] {
  return layout.map((widget) => widget.id);
}

export function hiddenWidgetIds(layout: HomeLayout): HomeWidgetId[] {
  const shown = new Set(visibleWidgetIds(layout));
  return HOME_WIDGET_IDS.filter((id) => !shown.has(id));
}

// --- localStorage -----------------------------------------------------------

const STORAGE_PREFIX = "mb_home_prefs_v1";

function storageKey(userId?: string): string {
  return `${STORAGE_PREFIX}:${userId || "anon"}`;
}

export function loadLocalHome(userId?: string): HomePreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const layout = migrateLayout(parsed.layout);
    if (!layout) return null;
    return { layout, note: typeof parsed.note === "string" ? parsed.note.slice(0, 4000) : "" };
  } catch {
    return null;
  }
}

export function saveLocalHome(prefs: HomePreferences, userId?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
  } catch {
    // Переполненное или запрещённое хранилище не должно ломать главную.
  }
}

// --- аккаунт ----------------------------------------------------------------

let cachedPreferences: Record<string, unknown> | null = null;

export async function loadRemoteHome(): Promise<HomePreferences | null> {
  const { getAccountSettings } = await import("@/lib/settings-api");
  const result = await getAccountSettings();
  if (!result.ok) return null;
  const preferences = (result.data.preferences || {}) as Record<string, unknown>;
  cachedPreferences = preferences;
  const layout = migrateLayout(preferences.home_layout);
  if (!layout) return null;
  const note = typeof preferences.home_note === "string" ? preferences.home_note.slice(0, 4000) : "";
  return { layout, note };
}

export async function saveRemoteHome(prefs: HomePreferences): Promise<boolean> {
  const { getAccountSettings, saveAccountPreferences } = await import("@/lib/settings-api");
  let base = cachedPreferences;
  if (!base) {
    const current = await getAccountSettings();
    if (!current.ok) return false;
    base = (current.data.preferences || {}) as Record<string, unknown>;
  }
  const merged = { ...base, home_layout: prefs.layout, home_note: prefs.note };
  const saved = await saveAccountPreferences(merged);
  if (!saved.ok) return false;
  cachedPreferences = merged;
  return true;
}
