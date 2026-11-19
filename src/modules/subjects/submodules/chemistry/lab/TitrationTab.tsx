"use client";

/**
 * Вкладка «Титрование»: кривая титрования сильных и слабых электролитов,
 * точка эквивалентности, подбор индикатора и предупреждения модели.
 */
import { useMemo, useState } from "react";

import {
  ANALYTE_LABEL,
  LAB_PROTOCOLS,
  WEAK_ACIDS,
  WEAK_BASES,
  titrate,
  type AnalyteKind,
  type TitrationResult,
} from "@/lib/chemistry/lab";
import { Chart, ExportRow, Field, Protocol } from "./ui";
import { download, fmt } from "./model";

export function TitrationTab() {
  const [analyte, setAnalyte] = useState<AnalyteKind>("strong_acid");
  const [weakId, setWeakId] = useState<string>("acetic");
  const [analyteConcentration, setAnalyteConcentration] = useState(0.1);
  const [analyteVolumeMl, setAnalyteVolumeMl] = useState(20);
  const [titrantConcentration, setTitrantConcentration] = useState(0.1);

  const result = useMemo(() => {
    try {
      const weakAcid = WEAK_ACIDS.find((item) => item.id === weakId) ?? WEAK_ACIDS[0];
      const weakBase = WEAK_BASES[0];
      const ka = analyte === "weak_acid" ? weakAcid.ka : analyte === "weak_base" ? weakBase.kaConjugate : undefined;
      return { ok: true as const, data: titrate({ analyte, analyteConcentration, analyteVolumeMl, titrantConcentration, ka }) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Не удалось рассчитать кривую" };
    }
  }, [analyte, weakId, analyteConcentration, analyteVolumeMl, titrantConcentration]);

  function exportCsv(data: TitrationResult) {
    download("titration", data.points.map((point) => ({
      "Объём титранта, мл": fmt(point.volumeMl, 2),
      "pH": fmt(point.ph, 3),
    })), [
      { key: "Объём титранта, мл", label: "Объём титранта, мл" },
      { key: "pH", label: "pH" },
    ]);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-[var(--muted)]">Что титруем</span>
          <select
            value={analyte}
            onChange={(event) => setAnalyte(event.target.value as AnalyteKind)}
            className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2"
          >
            {(Object.keys(ANALYTE_LABEL) as AnalyteKind[]).map((kind) => (
              <option key={kind} value={kind}>{ANALYTE_LABEL[kind]}</option>
            ))}
          </select>
        </label>
        {(analyte === "weak_acid" || analyte === "weak_base") && (
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-[var(--muted)]">Слабый электролит</span>
            <select
              value={weakId}
              onChange={(event) => setWeakId(event.target.value)}
              disabled={analyte === "weak_base"}
              className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 disabled:opacity-60"
            >
              {analyte === "weak_acid"
                ? WEAK_ACIDS.map((item) => <option key={item.id} value={item.id}>{item.label} · pKa {fmt(item.pka, 2)}</option>)
                : WEAK_BASES.map((item) => <option key={item.id} value={item.id}>{item.label} · pKa(NH₄⁺) {fmt(item.pkaConjugate, 2)}</option>)}
            </select>
          </label>
        )}
        <Field label="Концентрация аликвоты" value={analyteConcentration} onChange={setAnalyteConcentration} unit="моль/л" />
        <Field label="Объём аликвоты" value={analyteVolumeMl} onChange={setAnalyteVolumeMl} unit="мл" />
        <Field label="Концентрация титранта" value={titrantConcentration} onChange={setTitrantConcentration} unit="моль/л" />
      </div>

      {!result.ok ? (
        <p role="alert" className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-sm text-[var(--status-warn-fg)]">{result.message}</p>
      ) : (
        <>
          <div className="rounded-xl border border-[var(--border)] bg-white p-2">
            <Chart
              points={result.data.points.map((point) => ({ x: point.volumeMl, y: point.ph }))}
              xLabel="V титранта, мл"
              yLabel="pH"
              yMin={0}
              yMax={14}
              mark={result.data.equivalenceVolumeMl}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted)]">V эквивалентности</div>
              <div className="text-xl font-bold tabular-nums">{fmt(result.data.equivalenceVolumeMl, 2)} мл</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted)]">pH эквивалентности</div>
              <div className="text-xl font-bold tabular-nums">{fmt(result.data.equivalencePh, 2)}</div>
            </div>
            <div className="rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] p-3">
              <div className="text-xs text-[var(--status-ok-fg)]">Индикатор</div>
              <div className="text-sm font-bold text-[var(--status-ok-fg)]">
                {result.data.indicators.find((item) => item.recommended)?.name}
              </div>
              <div className="text-xs text-[var(--status-ok-fg)]">{result.data.indicators.find((item) => item.recommended)?.range}</div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-3 py-2">Индикатор</th><th className="px-3 py-2">Интервал</th><th className="px-3 py-2">Почему</th></tr>
              </thead>
              <tbody>
                {result.data.indicators.map((indicator) => (
                  <tr key={indicator.name} className={indicator.recommended ? "bg-[var(--status-ok-bg)]/40" : ""}>
                    <td className="border-t border-[var(--border)] px-3 py-2 font-medium">{indicator.name}</td>
                    <td className="border-t border-[var(--border)] px-3 py-2 tabular-nums">{indicator.range}</td>
                    <td className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">{indicator.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.data.warnings.map((warning) => (
            <p key={warning} className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-xs text-[var(--status-warn-fg)]">{warning}</p>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ul className="space-y-1 text-xs text-[var(--muted)]">
              {result.data.notes.map((note) => <li key={note}>· {note}</li>)}
            </ul>
            <ExportRow onCsv={() => exportCsv(result.data)} />
          </div>
        </>
      )}
      <Protocol steps={LAB_PROTOCOLS.titration} />
    </div>
  );
}
