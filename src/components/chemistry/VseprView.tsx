"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChemicalMolecule } from "@/lib/chemistry/types";
import { analyzeVsepr, type VseprReport } from "@/lib/chemistry/vsepr";
import { moleculeStructure, smilesToSvg } from "@/lib/chemistry/rdkitClient";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; report: VseprReport };

/**
 * H4: VSEPR/гибридизация по SMILES. Считает RDKit в браузере (как 2D/3D),
 * поэтому при недоступном CDN честно говорит об этом, а не рисует таблицу
 * из догадок.
 */
export function VseprView({ molecule }: { molecule: ChemicalMolecule }) {
  const smiles = molecule.isomericSmiles || molecule.canonicalSmiles || "";
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selected, setSelected] = useState<number | null>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    setSelected(null);
    if (!smiles) {
      setState({ status: "error", message: "Для этой записи нет SMILES — стереохимию не посчитать." });
      return;
    }
    (async () => {
      const raw = await moleculeStructure(smiles);
      if (cancelled) return;
      if (!raw) {
        setState({ status: "error", message: "Не удалось разобрать структуру: RDKit недоступен или SMILES не поддержан." });
        return;
      }
      try {
        const parsed = JSON.parse(raw) as { json: string; aromatic: number[] };
        setState({ status: "ready", report: analyzeVsepr(parsed.json, parsed.aromatic) });
      } catch {
        setState({ status: "error", message: "Не удалось посчитать геометрию по этой структуре." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [smiles]);

  const atoms = state.status === "ready" ? state.report.atoms : [];
  const highlighted = useMemo(
    () => (selected == null ? [] : atoms.filter((atom) => atom.index === selected).map((atom) => atom.index)),
    [atoms, selected],
  );

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    if (!smiles || !highlighted.length) return;
    (async () => {
      const next = await smilesToSvg(smiles, 420, 300, highlighted);
      if (!cancelled) setSvg(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [smiles, highlighted]);

  if (state.status === "loading") {
    return <p className="text-sm text-slate-500">Считаем стереохимию…</p>;
  }
  if (state.status === "error") {
    return <p role="alert" className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-4 text-sm text-[var(--status-warn-fg)]">{state.message}</p>;
  }
  if (!atoms.length) {
    return <p className="text-sm text-slate-500">В этой структуре нет атомов-центров, для которых VSEPR даёт геометрию.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">Атом</th>
              <th className="px-3 py-2">Соседи</th>
              <th className="px-3 py-2">σ-связей</th>
              <th className="px-3 py-2">Непод. пар</th>
              <th className="px-3 py-2">Стер. число</th>
              <th className="px-3 py-2">Геометрия</th>
              <th className="px-3 py-2">Углы</th>
              <th className="px-3 py-2">Гибридизация</th>
            </tr>
          </thead>
          <tbody>
            {atoms.map((atom) => {
              const active = atom.index === selected;
              return (
                <tr
                  key={atom.index}
                  onClick={() => setSelected(active ? null : atom.index)}
                  className={`cursor-pointer border-t border-[var(--border)] transition ${active ? "bg-[var(--status-warn-bg)]" : "hover:bg-slate-50"}`}
                >
                  <td className="px-3 py-2 font-semibold">{atom.symbol}<span className="ml-1 text-[11px] font-normal text-slate-400">#{atom.index + 1}</span></td>
                  <td className="px-3 py-2 text-slate-600">{atom.neighbors}</td>
                  <td className="px-3 py-2 tabular-nums">{atom.sigmaBonds}</td>
                  <td className="px-3 py-2 tabular-nums">{atom.lonePairs ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{atom.stericNumber}</td>
                  <td className="px-3 py-2">{atom.geometry}</td>
                  <td className="px-3 py-2 tabular-nums">{atom.angles}</td>
                  <td className="px-3 py-2 font-semibold">{atom.hybridization}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-[var(--border)] bg-white p-3">
          {svg ? (
            <div
              className="mx-auto max-h-64 max-w-full [&_svg]:h-auto [&_svg]:max-h-64 [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <p className="py-8 text-center text-xs text-slate-400">
              {selected == null ? "Нажмите строку, чтобы подсветить атом" : "Подсветка недоступна"}
            </p>
          )}
        </div>
        <ul className="space-y-1 text-xs leading-5 text-slate-500">
          {state.report.notes.map((note) => <li key={note}>· {note}</li>)}
          <li>· Источник структуры: {molecule.provenance.label || molecule.provenance.source}. Расчёт: RDKit + VSEPR.</li>
        </ul>
      </div>
    </div>
  );
}

export default VseprView;
