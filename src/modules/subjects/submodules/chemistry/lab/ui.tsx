/**
 * Общие UI-примитивы лабораторной скамьи: числовое поле, SVG-график,
 * раскрывающийся протокол опыта и строка экспорта (CSV / печать).
 */
import { Download, Printer } from "lucide-react";

import { printCurrentView } from "@/lib/chemistry/export";
import { fmt } from "./model";

export function Field({ label, value, onChange, unit, step = "any", min = "0" }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  step?: string;
  min?: string;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium text-[var(--muted)]">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ""}
          step={step}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2"
        />
        {unit && <span className="w-16 shrink-0 text-xs text-[var(--muted)]">{unit}</span>}
      </span>
    </label>
  );
}

export function Chart({
  points,
  xLabel,
  yLabel,
  yMin,
  yMax,
  mark,
}: {
  points: Array<{ x: number; y: number }>;
  xLabel: string;
  yLabel: string;
  yMin: number;
  yMax: number;
  mark?: number;
}) {
  const width = 640;
  const height = 260;
  const pad = { left: 46, right: 16, top: 16, bottom: 36 };
  const xMax = Math.max(...points.map((point) => point.x), 1);
  const sx = (x: number) => pad.left + ((x - 0) / xMax) * (width - pad.left - pad.right);
  const sy = (y: number) => height - pad.bottom - ((y - yMin) / (yMax - yMin)) * (height - pad.top - pad.bottom);
  const path = points.map((point) => `${sx(point.x).toFixed(1)},${sy(point.y).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => yMin + (yMax - yMin) * fraction);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${yLabel} от ${xLabel}`} className="w-full">
      <rect x={pad.left} y={pad.top} width={width - pad.left - pad.right} height={height - pad.top - pad.bottom} fill="#fff" stroke="#e2e8f0" />
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={sy(tick)} y2={sy(tick)} stroke="#f1f5f9" />
          <text x={pad.left - 6} y={sy(tick) + 4} textAnchor="end" fontSize="10" fill="#64748b">{fmt(tick, 1)}</text>
        </g>
      ))}
      <polyline points={path} fill="none" stroke="#4f46e5" strokeWidth="2" />
      {mark != null && (
        <line x1={sx(mark)} x2={sx(mark)} y1={pad.top} y2={height - pad.bottom} stroke="#f59e0b" strokeDasharray="4 4" />
      )}
      <text x={(width + pad.left) / 2} y={height - 6} textAnchor="middle" fontSize="11" fill="#64748b">{xLabel}</text>
      <text x={12} y={pad.top + 4} fontSize="11" fill="#64748b" transform={`rotate(-90 12 ${pad.top + 4})`} textAnchor="end">{yLabel}</text>
    </svg>
  );
}

export function Protocol({ steps }: { steps: string[] }) {
  return (
    <details className="rounded-xl border border-[var(--border)] p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Протокол опыта</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--muted)]">
        {steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
    </details>
  );
}

export function ExportRow({ onCsv }: { onCsv: () => void }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button type="button" onClick={onCsv} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold">
        <Download className="h-3.5 w-3.5" /> CSV
      </button>
      <button type="button" onClick={() => printCurrentView()} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold">
        <Printer className="h-3.5 w-3.5" /> Печать / PDF
      </button>
    </div>
  );
}
