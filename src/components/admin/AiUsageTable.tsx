"use client";

/** Таблица разреза журнала AI-вызовов: день, функция, провайдер, модель. */
type SplitRow = { key: string; calls: number; ok: number; errors: number; rate_limited: number; avg_latency_ms: number; p95_latency_ms: number };

export function pct(ok: number, calls: number): string {
  if (!calls) return "—";
  return Math.round((ok / calls) * 100) + "%";
}

export function ms(value: number): string {
  if (!value) return "—";
  return value >= 1000 ? (value / 1000).toFixed(1) + " с" : value + " мс";
}

export function SplitTable({ title, rows, labels, formatters }: { title: string; rows: SplitRow[]; labels?: Record<string, string>; formatters?: Record<string, (key: string) => string> }) {
  if (!rows.length) return null;
  const label = (key: string) => formatters?.[title]?.(key) ?? labels?.[key] ?? key;
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm font-bold">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-400">
              {["", "Вызовов", "OK", "Ошибки", "Лимит", "Средняя", "p95"].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 font-semibold">{label(row.key)}</td>
                <td className="px-3 py-2 tabular-nums">{row.calls}</td>
                <td className="px-3 py-2 tabular-nums text-[var(--status-ok-fg)]">{pct(row.ok, row.calls)}</td>
                <td className="px-3 py-2 tabular-nums">{row.errors ? <span className="text-[var(--status-critical-fg)]">{row.errors}</span> : "0"}</td>
                <td className="px-3 py-2 tabular-nums">{row.rate_limited || "0"}</td>
                <td className="px-3 py-2 tabular-nums">{ms(row.avg_latency_ms)}</td>
                <td className="px-3 py-2 tabular-nums">{ms(row.p95_latency_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export type { SplitRow };
