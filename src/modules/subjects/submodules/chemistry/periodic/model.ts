/**
 * Модель и оформление периодической таблицы: цветовые метки категорий,
 * размеры сетки, плейсхолдеры f-блоков и направления клавиатурной навигации.
 * Классификация элементов берётся из `@/lib/elements`; здесь только константы.
 */

/** Цветовая метка категории — только оформление, классификация берётся из источника. */
const CATEGORY_COLORS: Record<string, string> = {
  "alkali metal": "#f97316",
  "alkaline earth metal": "#f59e0b",
  "transition metal": "#6366f1",
  "post-transition metal": "#0ea5e9",
  lanthanide: "#14b8a6",
  actinide: "#10b981",
  metalloid: "#a855f7",
  "diatomic nonmetal": "#84cc16",
  "polyatomic nonmetal": "#22c55e",
  "noble gas": "#ec4899",
  "unknown, probably transition metal": "#94a3b8",
  "unknown, probably post-transition metal": "#94a3b8",
  "unknown, probably metalloid": "#94a3b8",
  "unknown, predicted to be noble gas": "#94a3b8",
};

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? "#64748b";
}

export function categoryCellStyle(category: string): { backgroundColor: string; borderColor: string } {
  const color = categoryColor(category);
  return {
    backgroundColor: `color-mix(in srgb, ${color} 20%, var(--card))`,
    borderColor: `color-mix(in srgb, ${color} 55%, var(--border))`,
  };
}

export const GROUP_NUMBERS = Array.from({ length: 18 }, (_, index) => index + 1);
export const PERIOD_NUMBERS = Array.from({ length: 7 }, (_, index) => index + 1);

/** Плейсхолдеры f-блоков в основной сетке: лантаноиды и актиноиды вынесены отдельными рядами. */
export const F_BLOCK_PLACEHOLDERS: Array<{ period: number; range: string; series: string }> = [
  { period: 6, range: "57–71", series: "La–Lu" },
  { period: 7, range: "89–103", series: "Ac–Lr" },
];

/** Направления стрелочной навигации по сетке таблицы. */
export const KEYBOARD_DELTAS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
