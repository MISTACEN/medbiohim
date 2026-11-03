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
  "academic",
  "schedule",
  "homework",
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
  academic: "Учебный прогресс",
  schedule: "Ближайшее занятие",
  homework: "Домашние задания",
  tests: "Тесты",
  subjects: "Мои предметы",
  homeworkList: "Список заданий",
  announcements: "Объявления",
  debts: "Академические долги",
  note: "Моя заметка",
};

export const HOME_WIDGET_HINTS: Record<HomeWidgetId, string> = {
  academic: "Метрики, план подготовки и рекомендации",
  schedule: "Что сегодня и когда следующая пара",
  homework: "Сколько заданий ждёт сдачи",
  tests: "Доступные тесты и быстрый переход",
  subjects: "Предметы курса и быстрые ссылки",
  homeworkList: "Последние задания со сроками",
  announcements: "Объявления группы",
  debts: "Долги, которые видит академический модуль",
  note: "Свободный текст: что не забыть сегодня",
};

export const HOME_SPAN_CLASS: Record<HomeSpan, string> = {
  third: "lg:col-span-2",
  half: "lg:col-span-3",
  full: "lg:col-span-6",
};

export const HOME_SPAN_LABELS: Record<HomeSpan, string> = {
  third: "Узкий",
  half: "Половина",
  full: "Весь",
};

/** Стандартный вид: тот же порядок и состав, что был на главной до настройки. */
export const DEFAULT_LAYOUT: HomeLayout = [
  { id: "academic", span: "full" },
  { id: "schedule", span: "third" },
  { id: "homework", span: "third" },
  { id: "tests", span: "third" },
  { id: "subjects", span: "full" },
  { id: "homeworkList", span: "half" },
  { id: "announcements", span: "half" },
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
    const layout = parseLayout(parsed.layout);
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
  const layout = parseLayout(preferences.home_layout);
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
