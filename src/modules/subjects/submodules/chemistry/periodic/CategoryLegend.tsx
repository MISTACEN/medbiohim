/**
 * Легенда категорий: цветовая шкала и счётчики по классификации источника.
 */
import { categoryColor } from "./model";

interface CategoryLegendProps {
  categories: Array<{ category: string; label: string; count: number }>;
}

export function CategoryLegend({ categories }: CategoryLegendProps) {
  return (
    <section aria-labelledby="elements-legend" className="card space-y-3">
      <h2 id="elements-legend" className="text-lg font-bold">
        Категории
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map(({ category: value, label, count }) => (
          <li key={value} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ background: categoryColor(value), border: "1px solid var(--border)" }}
            />
            <span>{label}</span>
            <span className="ml-auto tabular-nums text-xs" style={{ color: "var(--muted)" }}>
              {count}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Названия категорий — перевод классификации источника; для сверхтяжёлых элементов источник помечает
        принадлежность как неизвестную или предсказанную.
      </p>
    </section>
  );
}
