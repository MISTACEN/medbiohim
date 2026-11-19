"use client";

/**
 * Вкладка «Электрохимия»: гальванический элемент по стандартным потенциалам,
 * уравнение Нернста, ΔG и направление реакции.
 */
import { useMemo, useState } from "react";

import { LAB_PROTOCOLS, STANDARD_POTENTIALS, cellPotential } from "@/lib/chemistry/lab";
import { ExportRow, Field, Protocol } from "./ui";
import { download, fmt } from "./model";

export function ElectrochemistryTab() {
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
        <p role="alert" className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-sm text-[var(--status-warn-fg)]">{result.message}</p>
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
            <div className={`rounded-xl border p-3 ${result.data.spontaneous ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)]" : "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)]"}`}>
              <div className="text-xs text-[var(--muted)]">Направление</div>
              <div className={`text-sm font-bold ${result.data.spontaneous ? "text-[var(--status-ok-fg)]" : "text-[var(--status-critical-fg)]"}`}>
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
