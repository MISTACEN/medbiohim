"use client";

import { useMemo, useState } from "react";
import { Beaker, Download, FlaskConical, Printer, Zap } from "lucide-react";

import {
  ANALYTE_LABEL,
  LAB_PROTOCOLS,
  STANDARD_POTENTIALS,
  WEAK_ACIDS,
  WEAK_BASES,
  beerLambert,
  cellPotential,
  concentrationFromAbsorbance,
  titrate,
  type AnalyteKind,
  type TitrationResult,
} from "@/lib/chemistry/lab";
import { csvFilename, downloadCsv, printCurrentView, toCsv } from "@/lib/chemistry/export";

type Tab = "titration" | "electrochemistry" | "spectroscopy";

const TABS: Array<{ id: Tab; label: string; Icon: typeof Beaker }> = [
  { id: "titration", label: "Титрование", Icon: Beaker },
  { id: "electrochemistry", label: "Электрохимия", Icon: Zap },
  { id: "spectroscopy", label: "Спектроскопия", Icon: FlaskConical },
];

function fmt(value: number, digits = 2): string {
  return Number(value.toFixed(digits)).toString().replace(".", ",");
}

function Field({ label, value, onChange, unit, step = "any", min = "0" }: {
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

function Chart({
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

function Protocol({ steps }: { steps: string[] }) {
  return (
    <details className="rounded-xl border border-[var(--border)] p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Протокол опыта</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--muted)]">
        {steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
    </details>
  );
}

function ExportRow({ onCsv }: { onCsv: () => void }) {
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

function download(prefix: string, rows: Array<Record<string, unknown>>, columns: Array<{ key: string; label: string }>) {
  downloadCsv(csvFilename("medbiohim", prefix), toCsv(rows, columns));
}

/* -------------------------------------------------------------------------- */

function TitrationTab() {
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
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{result.message}</p>
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
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-xs text-emerald-700">Индикатор</div>
              <div className="text-sm font-bold text-emerald-900">
                {result.data.indicators.find((item) => item.recommended)?.name}
              </div>
              <div className="text-xs text-emerald-800">{result.data.indicators.find((item) => item.recommended)?.range}</div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-3 py-2">Индикатор</th><th className="px-3 py-2">Интервал</th><th className="px-3 py-2">Почему</th></tr>
              </thead>
              <tbody>
                {result.data.indicators.map((indicator) => (
                  <tr key={indicator.name} className={indicator.recommended ? "bg-emerald-50/40" : ""}>
                    <td className="border-t border-[var(--border)] px-3 py-2 font-medium">{indicator.name}</td>
                    <td className="border-t border-[var(--border)] px-3 py-2 tabular-nums">{indicator.range}</td>
                    <td className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">{indicator.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.data.warnings.map((warning) => (
            <p key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{warning}</p>
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

/* -------------------------------------------------------------------------- */

function ElectrochemistryTab() {
  const [cathodeId, setCathodeId] = useState("cu");
  const [anodeId, setAnodeId] = useState("zn");
  const [temperatureK, setTemperatureK] = useState(298.15);
  const [quotient, setQuotient] = useState(1);

  const result = useMemo(() => {
    try {
      return { ok: true as const, data: cellPotential({ cathodeId, anodeId, temperatureK, reactionQuotient: quotient }) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Не удалось рассчитать элемент" };
    }
  }, [cathodeId, anodeId, temperatureK, quotient]);

  function exportCsv() {
    if (!result.ok) return;
    const data = result.data;
    download("galvanic-cell", [
      { "Параметр": "Катод", "Значение": data.cathode.label, "Единица": "", "Комментарий": "восстановление" },
      { "Параметр": "Анод", "Значение": data.anode.label, "Единица": "", "Комментарий": "окисление" },
      { "Параметр": "E° элемента", "Значение": fmt(data.e0Cell, 4), "Единица": "В", "Комментарий": "" },
      { "Параметр": "E (Нернст)", "Значение": fmt(data.eCell, 4), "Единица": "В", "Комментарий": `T=${fmt(temperatureK, 2)} K, Q=${fmt(quotient, 4)}` },
      { "Параметр": "n", "Значение": data.electrons, "Единица": "e⁻", "Комментарий": "" },
      { "Параметр": "ΔG°", "Значение": fmt(data.deltaG0Kj, 2), "Единица": "кДж/моль", "Комментарий": "" },
      { "Параметр": "ΔG", "Значение": fmt(data.deltaGKj, 2), "Единица": "кДж/моль", "Комментарий": data.spontaneous ? "самопроизвольная" : "несамопроизвольная" },
    ], [
      { key: "Параметр", label: "Параметр" },
      { key: "Значение", label: "Значение" },
      { key: "Единица", label: "Единица" },
      { key: "Комментарий", label: "Комментарий" },
    ]);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-[var(--muted)]">Катод (восстановление)</span>
          <select value={cathodeId} onChange={(event) => setCathodeId(event.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2">
            {STANDARD_POTENTIALS.map((item) => <option key={item.id} value={item.id}>{item.label} · {fmt(item.e0, 4)} В</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-[var(--muted)]">Анод (окисление)</span>
          <select value={anodeId} onChange={(event) => setAnodeId(event.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2">
            {STANDARD_POTENTIALS.map((item) => <option key={item.id} value={item.id}>{item.label} · {fmt(item.e0, 4)} В</option>)}
          </select>
        </label>
        <Field label="Температура" value={temperatureK} onChange={setTemperatureK} unit="К" />
        <Field label="Q (активности)" value={quotient} onChange={setQuotient} unit="" />
      </div>

      {!result.ok ? (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{result.message}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted)]">E° элемента</div>
              <div className="text-xl font-bold tabular-nums">{fmt(result.data.e0Cell, 3)} В</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted)]">E по Нернсту</div>
              <div className="text-xl font-bold tabular-nums">{fmt(result.data.eCell, 3)} В</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted)]">ΔG°</div>
              <div className="text-xl font-bold tabular-nums">{fmt(result.data.deltaG0Kj, 1)} кДж/моль</div>
            </div>
            <div className={`rounded-xl border p-3 ${result.data.spontaneous ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
              <div className="text-xs text-[var(--muted)]">Направление</div>
              <div className={`text-sm font-bold ${result.data.spontaneous ? "text-emerald-800" : "text-rose-800"}`}>
                {result.data.spontaneous ? "реакция идёт сама" : "нужен внешний источник тока"}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-3 text-sm">
            <p>
              Катод: <strong>{result.data.cathode.label}</strong> ({result.data.cathode.e0 > 0 ? "+" : ""}{fmt(result.data.cathode.e0, 4)} В), n = {result.data.electrons}.
              Анод: <strong>{result.data.anode.label}</strong> ({fmt(result.data.anode.e0, 4)} В).
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              E = E° − (RT/nF)·ln Q = {fmt(result.data.e0Cell, 4)} − (8,314·{fmt(temperatureK, 2)}/({result.data.electrons}·96 485))·ln({fmt(quotient, 4)}) = {fmt(result.data.eCell, 4)} В.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ul className="space-y-1 text-xs text-[var(--muted)]">
              {result.data.notes.map((note) => <li key={note}>· {note}</li>)}
            </ul>
            <ExportRow onCsv={exportCsv} />
          </div>
        </>
      )}
      <Protocol steps={LAB_PROTOCOLS.electrochemistry} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function SpectroscopyTab() {
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
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{result.message}</p>
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
            <div className={`rounded-xl border p-3 ${result.data.linear ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
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
                  {inverse.data.warnings.map((warning) => <span key={warning} className="mt-1 block text-xs text-amber-700">{warning}</span>)}
                </p>
              ) : (
                <p className="text-sm text-amber-800">{inverse.message}</p>
              )}
            </div>
          </div>

          {result.data.warnings.map((warning) => (
            <p key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{warning}</p>
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

/* -------------------------------------------------------------------------- */

export function LabBench() {
  const [tab, setTab] = useState<Tab>("titration");
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2 print:hidden" role="tablist" aria-label="Опыты">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm " +
              (tab === id ? "border-indigo-600 bg-indigo-600 font-semibold text-white" : "border-[var(--border)] hover:border-indigo-300")
            }
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div className="card p-4 sm:p-5">
        {tab === "titration" && <TitrationTab />}
        {tab === "electrochemistry" && <ElectrochemistryTab />}
        {tab === "spectroscopy" && <SpectroscopyTab />}
      </div>

      <p className="text-xs text-[var(--muted)]">
        Это расчётная симуляция, а не запись реального эксперимента: результаты показывают, что должно получиться при
        указанных параметрах. Вводя другие значения, проверяйте, что они физически возможны.
      </p>
    </section>
  );
}

export default LabBench;
