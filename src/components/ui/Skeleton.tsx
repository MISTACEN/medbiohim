export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-3">
          <div className="skeleton h-4 w-1/3" />
          <div className="skeleton h-8 w-2/3" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

/** F12: скелетон вертикального списка (ленты, результаты поиска, ДЗ). */
export function SkeletonList({ count = 4, rows = 2 }: { count?: number; rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-2 p-4">
          <div className="skeleton h-4 w-2/5" />
          {Array.from({ length: rows }).map((__, j) => (
            <div key={j} className="skeleton h-3 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** F12: скелетон строк таблицы (админка, зачётка). */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((__, j) => (
            <div key={j} className="skeleton h-8 flex-1" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** F12: пара строк текста (шапки, описания). */
export function SkeletonText({ lines = 2, width = "100%" }: { lines?: number; width?: string }) {
  return (
    <div className="space-y-2" aria-busy="true" style={{ width }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-3" style={{ width: `${100 - i * 15}%` }} />
      ))}
    </div>
  );
}

/** F12: одна карточка-скелетон (шапки разделов). */
export function SkeletonCard({ height = 96 }: { height?: number }) {
  return (
    <div className="card p-5" aria-busy="true" style={{ minHeight: height }}>
      <div className="skeleton h-4 w-1/3" />
      <div className="skeleton mt-3 h-3 w-3/5" />
    </div>
  );
}
