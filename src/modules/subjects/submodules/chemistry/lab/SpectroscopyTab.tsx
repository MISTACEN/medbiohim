"use client";

/**
 * Вкладка «Спектроскопия»: закон Бугера—Ламберта—Бера (прямая и обратная
 * задачи), калибровочная прямая и границы применимости модели.
 */
import { useMemo, useState } from "react";

import { LAB_PROTOCOLS, beerLambert, concentrationFromAbsorbance } from "@/lib/chemistry/lab";
import { Chart, ExportRow, Field, Protocol } from "./ui";
import { download, fmt } from "./model";

export function SpectroscopyTab() {
  const [epsilon, setEpsilon] = useState(12000);
  const [pathCm, setPathCm] = useState(1);
  const [concentration, setConcentration] = useState(0.0001);
  const [absorbanceInput, setAbsorbanceInput] = useState(0.6);

  const result = useMemo(() => {
    try {
      return { ok: true as const, data: beerLambert({ epsilon, pathCm, concentration }) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Не удалось рассчитать поглощение" };
    }
  }, [epsilon, pathCm, concentration]);

  const inverse = useMemo(() => {
    try {
      return { ok: true as const, data: concentrationFromAbsorbance(absorbanceInput, epsilon, pathCm) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Не удалось рассчитать концентрацию" };
    }
  }, [absorbanceInput, epsilon, pathCm]);

  const curve = useMemo(() => {
    const max = Math.max(concentration * 2.5, 1e-6);
    const points: Array<{ x: number; y: number }> = [];
    for (let index = 0; index <= 40; index += 1) {
      const value = (max * index) / 40;
      points.push({ x: value * 1e6, y: epsilon * pathCm * value });
    }
    return { points, max: max * 1e6 };
  }, [concentration, epsilon, pathCm]);

  function exportCsv() {
    if (!result.ok) return;
    download("spectroscopy", [
      { "Параметр": "Молярный коэффициент ε", "Значение": fmt(epsilon, 0), "Единица": "л·моль⁻¹·см⁻¹" },
      { "Параметр": "Толщина кюветы l", "Значение": fmt(pathCm, 2), "Единица": "см" },
      { "Параметр": "Концентрация c", "Значение": fmt(concentration * 1e6, 2), "Единица": "мкмоль/л" },
      { "Параметр": "Оптическая плотность A", "Значение": fmt(result.data.absorbance, 4), "Единица": "" },
      { "Параметр": "Пропускание T", "Значение": fmt(result.data.transmittancePercent, 2), "Единица": "%" },
      { "Параметр": "Линейный участок", "Значение": result.data.linear ? "да" : "нет", "Единица": "" },
      ...result.data.warnings.map((warning) => ({ "Параметр": "Предупреждение", "Значение": warning, "Единица": "" })),
    ], [
      { key: "Параметр", label: "Параметр" },
      { key: "Значение", label: "Значение" },
      { key: "Единица", label: "Единица" },
    ]);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Молярный коэффициент ε" value={epsilon} onChange={setEpsilon} unit="л·моль⁻¹·см⁻¹" min="1" />
        <Field label="Толщина кюветы l" value={pathCm} onChange={setPathCm} unit="см" min="0.01" />
        <Field label="Концентрация c" value={concentration} onChange={setConcentration} unit="моль/л" />
      </div>

      {!result.ok ? (
        <p role="alert" className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-sm text-[var(--status-warn-fg)]">{result.message}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted)]">A = ε·l·c</div>
              <div className="text-xl font-bold tabular-nums">{fmt(result.data.absorbance, 3)}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted)]">Пропускание T = 10⁻ᴬ</div>
              <div className="text-xl font-bold tabular-nums">{fmt(result.data.transmittancePercent, 1)} %</div>
            </div>
            <div className={`rounded-xl border p-3 ${result.data.linear ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)]" : "border-[var(--status-warn-border)] bg-[var(--status-warn-bg)]"}`}>
              <div className="text-xs text-[var(--muted)]">Линейный участок</div>
              <div className="text-sm font-bold">{result.data.linear ? "0,05 ≤ A ≤ 1,5 — да" : "вне 0,05…1,5"}</div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-white p-2">
            <Chart
              points={curve.points}
              xLabel="c, мкмоль/л"
              yLabel="A"
              yMin={0}
              yMax={Math.min(3, Math.max(1.5, curve.points.at(-1)?.y ?? 1.5))}
              mark={concentration * 1e6}
            />
            <p className="px-2 pb-1 text-xs text-[var(--muted)]">
              Прямая построена по ε и l; оранжевая линия — текущая концентрация. За пределами 0,05–1,5 закон может не выполняться.
            </p>
          </div>

          <div className="grid gap-3 rounded-xl border border-[var(--border)] p-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <p className="text-sm font-semibold">Обратный расчёт: A → c</p>
              <Field label="Оптическая плотность A" value={absorbanceInput} onChange={setAbsorbanceInput} step="0.01" />
              {inverse.ok ? (
                <p className="text-sm">
                  c = A/(ε·l) = <strong className="tabular-nums">{fmt(inverse.data.concentration * 1e6, 2)} мкмоль/л</strong>
                  {inverse.data.warnings.map((warning) => <span key={warning} className="mt-1 block text-xs text-[var(--status-warn-fg)]">{warning}</span>)}
                </p>
              ) : (
                <p className="text-sm text-[var(--status-warn-fg)]">{inverse.message}</p>
              )}
            </div>
          </div>

          {result.data.warnings.map((warning) => (
            <p key={warning} className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-xs text-[var(--status-warn-fg)]">{warning}</p>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--muted)]">Модель не учитывает рассеяние, фоновое поглощение и ширину щели прибора.</p>
            <ExportRow onCsv={exportCsv} />
          </div>
        </>
      )}
      <Protocol steps={LAB_PROTOCOLS.spectroscopy} />
    </div>
  );
}
