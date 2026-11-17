"use client";

import { useMemo, useState } from "react";
import { Download, Plus, Printer, RotateCcw, Trash2 } from "lucide-react";

import {
  DEFAULT_CELL_CONSTANT,
  DEFAULT_LIMIT_CONDUCTIVITY,
  buildSeries,
  computeRows,
  exampleRows,
  fitOstwald,
  linearFit,
  summarize,
  type ConductometryRow,
} from "@/lib/chemistry/conductometry";
import { csvFilename, downloadCsv, printCurrentView, toCsv } from "@/lib/chemistry/export";

function fmt(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value !== 0 && Math.abs(value) < 1e-3) return value.toExponential(2).replace(".", ",");
  return Number(value.toFixed(digits)).toString().replace(".", ",");
}

function SeriesChart({
  points,
  xLabel,
  yLabel,
  fit,
}: {
  points: Array<{ x: number; y: number }>;
  xLabel: string;
  yLabel: string;
  fit?: { slope: number; intercept: number };
}) {
  const width = 420;
  const height = 220;
  const pad = { left: 58, right: 14, top: 14, bottom: 38 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs, 0);
  const xMax = Math.max(...xs, 1e-9) || 1;
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, 1e-9) || 1;
  const sx = (x: number) => pad.left + ((x - xMin) / (xMax - xMin || 1)) * (width - pad.left - pad.right);
  const sy = (y: number) => height - pad.bottom - ((y - yMin) / (yMax - yMin || 1)) * (height - pad.top - pad.bottom);
  const ticks = (min: number, max: number) => [0, 0.5, 1].map((f) => min + (max - min) * f);
  const path = points.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${yLabel} от ${xLabel}`} className="w-full">
      <rect x={pad.left} y={pad.top} width={width - pad.left - pad.right} height={height - pad.top - pad.bottom} fill="#fff" stroke="#e2e8f0" />
      {ticks(xMin, xMax).map((tick, index) => (
        <text key={`x${index}`} x={sx(tick)} y={height - pad.bottom + 14} textAnchor="middle" fontSize="9" fill="#64748b">
          {fmt(tick, 2)}
        </text>
      ))}
      {ticks(yMin, yMax).map((tick, index) => (
        <g key={`y${index}`}>
          <line x1={pad.left} x2={width - pad.right} y1={sy(tick)} y2={sy(tick)} stroke="#f1f5f9" />
          <text x={pad.left - 5} y={sy(tick) + 3} textAnchor="end" fontSize="9" fill="#64748b">{fmt(tick, 2)}</text>
        </g>
      ))}
      {fit && points.length > 1 && (
        <line
          x1={sx(xMin)}
          y1={sy(fit.slope * xMin + fit.intercept)}
          x2={sx(xMax)}
          y2={sy(fit.slope * xMax + fit.intercept)}
          stroke="#f59e0b"
          strokeDasharray="5 4"
          strokeWidth="1.5"
        />
      )}
      {points.map((point, index) => (
        <circle key={index} cx={sx(point.x)} cy={sy(point.y)} r="3" fill="#4f46e5" />
      ))}
      {points.length > 1 && <polyline points={path} fill="none" stroke="#4f46e5" strokeWidth="1.5" opacity="0.55" />}
      <text x={(width + pad.left) / 2} y={height - 4} textAnchor="middle" fontSize="10" fill="#475569">{xLabel}</text>
      <text x={12} y={pad.top + 6} fontSize="10" fill="#475569" transform={`rotate(-90 12 ${pad.top + 6})`} textAnchor="end">{yLabel}</text>
    </svg>
  );
}

const PROTOCOL = [
  "Готовят серию растворов слабого электролита с известными концентрациями C (моль/м³).",
  "Измеряют сопротивление каждого раствора R (кОм) кондуктометром с известной постоянной ячейки φ.",
  "Считают проводимость L = 1/R, удельную проводимость æ = φ·L и молярную λ = æ/C.",
  "Находят степень диссоциации α = λ/λ∞ и константу K = α²C/(1−α) для каждой концентрации.",
  "Проверяют постоянство K и уточняют её по линейной форме Оствальда: 1/λ от λ·C.",
];

export default function ConductometryLab() {
  const [cellConstant, setCellConstant] = useState(DEFAULT_CELL_CONSTANT);
  const [limitConductivity, setLimitConductivity] = useState(DEFAULT_LIMIT_CONDUCTIVITY);
  const [rows, setRows] = useState<ConductometryRow[]>(() => exampleRows());
  const [nextId, setNextId] = useState(100);

  const computed = useMemo(
    () => computeRows(rows, { cellConstant, limitConductivity }),
    [rows, cellConstant, limitConductivity],
  );
  const summary = useMemo(() => summarize(computed), [computed]);
  const series = useMemo(() => buildSeries(computed), [computed]);
  const ostwald = useMemo(() => fitOstwald(computed), [computed]);
  const ostwaldFit = useMemo(() => {
    const target = series.find((item) => item.id === "ostwald");
    return target ? linearFit(target.points) : null;
  }, [series]);

  function updateRow(id: number, patch: Partial<ConductometryRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addRow() {
    const last = rows[rows.length - 1];
    setRows((prev) => [...prev, { id: nextId, concentration: last?.concentration ?? 1, resistanceKOhm: last?.resistanceKOhm ?? 10 }]);
    setNextId((id) => id + 1);
  }

  function removeRow(id: number) {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  function exportCsv() {
    const columns = ["C, моль/м³", "R, кОм", "æ, См/м", "λ, См·м²/моль", "α", "K, моль/м³"];
    const table = computed.map((row) => ({
      "C, моль/м³": fmt(row.concentration, 3),
      "R, кОм": fmt(row.resistanceKOhm, 3),
      "æ, См/м": fmt(row.conductivity, 5),
      "λ, См·м²/моль": fmt(row.molarConductivity, 5),
      "α": fmt(row.degree, 4),
      "K, моль/м³": fmt(row.constant, 5),
    }));
    downloadCsv(
      csvFilename("medbiohim", "conductometry"),
      toCsv(table, columns.map((key) => ({ key, label: key }))),
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-[var(--muted)]">Постоянная ячейки φ, 1/м</span>
          <input
            type="number"
            inputMode="decimal"
            step="1"
            min="0"
            value={cellConstant}
            onChange={(event) => setCellConstant(Number(event.target.value))}
            className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-[var(--muted)]">λ∞, См·м²/моль</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.0001"
            min="0"
            value={limitConductivity}
            onChange={(event) => setLimitConductivity(Number(event.target.value))}
            className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2"
          />
          <span className="mt-1 block text-xs text-[var(--muted)]">Уксусная кислота, 25 °C: 0,03906</span>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <caption className="px-3 pt-3 text-left text-xs text-[var(--muted)]">
            Введите концентрации и измеренные сопротивления — æ, λ, α и K считаются сразу
          </caption>
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th scope="col" className="px-2 py-2 text-left font-semibold">C, моль/м³</th>
              <th scope="col" className="px-2 py-2 text-left font-semibold">R, кОм</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">æ, См/м</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">λ, См·м²/моль</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">α</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">K, моль/м³</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold"><span className="sr-only">Удалить</span></th>
            </tr>
          </thead>
          <tbody>
            {computed.map((row) => (
              <tr key={row.id} className="border-t border-[var(--border)]">
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    aria-label={`Концентрация строки ${row.id}, моль/м³`}
                    value={row.concentration}
                    onChange={(event) => updateRow(row.id, { concentration: Number(event.target.value) })}
                    className="w-24 rounded-lg border border-[var(--border)] px-2 py-1"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    aria-label={`Сопротивление строки ${row.id}, кОм`}
                    value={row.resistanceKOhm}
                    onChange={(event) => updateRow(row.id, { resistanceKOhm: Number(event.target.value) })}
                    className="w-24 rounded-lg border border-[var(--border)] px-2 py-1"
                  />
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(row.conductivity, 5)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(row.molarConductivity, 5)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(row.degree, 4)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmt(row.constant, 5)}</td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    aria-label={`Удалить строку ${row.id}`}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold">
          <Plus className="h-3.5 w-3.5" /> Строка
        </button>
        <button type="button" onClick={() => setRows(exampleRows())} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold">
          <RotateCcw className="h-3.5 w-3.5" /> Пример
        </button>
        <button type="button" onClick={() => setRows([])} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold">
          Очистить
        </button>
        <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold">
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
        <button type="button" onClick={() => printCurrentView()} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold">
          <Printer className="h-3.5 w-3.5" /> Печать / PDF
        </button>
      </div>

      <div role="status" className="rounded-xl border border-[var(--border)] p-3 text-sm">
        {summary.validRows === 0 ? (
          <span className="text-[var(--muted)]">Добавьте корректные строки — средняя K появится здесь.</span>
        ) : (
          <div className="space-y-1">
            <p>
              <strong>K = {fmt(summary.meanConstant, 5)} моль/м³</strong> ({(summary.meanConstant ?? 0) / 1000 > 0 ? `${fmt((summary.meanConstant ?? 0) / 1000, 6)} моль/л` : "—"})
              {" · "}по {summary.validRows} из {summary.totalRows} строк
            </p>
            {summary.deviation != null && (
              <p className="text-[var(--muted)]">
                Стандартное отклонение {fmt(summary.deviation, 5)} моль/м³
                {summary.spread != null ? ` · разброс ${fmt((summary.spread ?? 0) * 100, 1)} %` : ""}
              </p>
            )}
            {ostwald && (
              <p className="text-[var(--muted)]">
                По графику Оствальда: λ∞ = {fmt(ostwald.lambdaInfinity, 5)} См·м²/моль, K = {fmt(ostwald.constant, 5)} моль/м³, R² = {fmt(ostwald.r2, 4)}
              </p>
            )}
          </div>
        )}
      </div>

      {computed.some((row) => row.error) && (
        <ul className="space-y-1 text-xs text-[var(--status-warn-fg)]">
          {computed.filter((row) => row.error).map((row) => (
            <li key={row.id}>Строка {row.id}: {row.error}</li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {series.map((item) => (
          <figure key={item.id} className="rounded-xl border border-[var(--border)] p-2">
            <figcaption className="mb-1 text-xs font-semibold text-slate-600">{item.title}</figcaption>
            {item.points.length ? (
              <SeriesChart
                points={item.points}
                xLabel={item.xLabel}
                yLabel={item.yLabel}
                fit={item.id === "ostwald" && ostwaldFit ? { slope: ostwaldFit.slope, intercept: ostwaldFit.intercept } : undefined}
              />
            ) : (
              <p className="p-6 text-center text-xs text-[var(--muted)]">Нет данных для графика</p>
            )}
          </figure>
        ))}
      </div>

      <details className="rounded-xl border border-[var(--border)] p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Протокол опыта</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--muted)]">
          {PROTOCOL.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </details>
    </div>
  );
}
