"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Scale, TriangleAlert } from "lucide-react";

import { balanceEquation, parseFormula, type BalanceResult } from "@/lib/chemistry/balance";

const EXAMPLES = [
  { label: "KMnO4 + HCl", equation: "KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2" },
  { label: "Fe2O3 + Al", equation: "Fe2O3 + Al -> Fe + Al2O3" },
  { label: "NH3 + O2", equation: "NH3 + O2 -> NO + H2O" },
  { label: "[Ag+] + [Cl-] -> AgCl", equation: "[Ag+] + [Cl-] -> AgCl" },
];

type Row = { label: string; left: number; right: number; equal: boolean };

/** Таблица «слева / справа»: атомы каждого элемента и суммарный заряд. */
function buildRows(result: BalanceResult): Row[] {
  const terms = [...result.reactants, ...result.products];
  const rows: Record<string, { left: number; right: number }> = {};
  const charge = { left: 0, right: 0 };
  let hasCharge = false;

  terms.forEach((term, index) => {
    const formula = parseFormula(term);
    if (!formula) return;
    const isReactant = index < result.reactants.length;
    const side = isReactant ? "left" : "right";
    const coefficient = result.coefficients[index] ?? 1;
    for (const [element, count] of Object.entries(formula.elements)) {
      const bucket = (rows[element] ??= { left: 0, right: 0 });
      bucket[side] += count * coefficient;
    }
    if (formula.charge !== 0) hasCharge = true;
    charge[side] += formula.charge * coefficient;
  });

  const elementRows = Object.keys(rows)
    .sort()
    .map<Row>((element) => ({
      label: element,
      left: rows[element].left,
      right: rows[element].right,
      equal: rows[element].left === rows[element].right,
    }));

  if (hasCharge) {
    elementRows.push({
      label: "Заряд",
      left: charge.left,
      right: charge.right,
      equal: charge.left === charge.right,
    });
  }
  return elementRows;
}

function sign(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

export function ReactionBalancer({ initialEquation }: { initialEquation?: string } = {}) {
  const [equation, setEquation] = useState(initialEquation ?? "");
  const [result, setResult] = useState<BalanceResult | null>(initialEquation ? balanceEquation(initialEquation) : null);

  const rows = useMemo(() => (result?.ok ? buildRows(result) : []), [result]);

  function submit() {
    setResult(balanceEquation(equation));
  }

  return (
    <div className="card space-y-4">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[var(--muted)]">
            Уравнение реакции (знак «-&gt;», «→» или «=», коэффициенты расставит решатель)
          </span>
          <input
            type="text"
            value={equation}
            onChange={(event) => setEquation(event.target.value)}
            placeholder="KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2"
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 font-mono text-sm"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-primary inline-flex items-center gap-1.5">
            <Scale className="h-4 w-4" /> Уравнять
          </button>
          <span className="text-xs text-[var(--muted)]">Примеры:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example.equation}
              type="button"
              onClick={() => {
                setEquation(example.equation);
                setResult(balanceEquation(example.equation));
              }}
              className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
            >
              {example.label}
            </button>
          ))}
        </div>
      </form>

      <div aria-live="polite">
        {result === null ? null : !result.ok ? (
          <p
            role="alert"
            className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-sm text-[var(--status-warn-fg)]"
          >
            {result.error}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--status-ok-fg)]">
                Сбалансированное уравнение
              </div>
              <p className="mt-1 font-mono text-sm font-bold text-[var(--status-ok-fg)] sm:text-base">
                {result.balanced}
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full min-w-[360px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Частица</th>
                    <th className="px-3 py-2 text-right">Слева</th>
                    <th className="px-3 py-2 text-right">Справа</th>
                    <th className="px-3 py-2 text-center">Сходится</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label} className={row.equal ? "" : "bg-[var(--status-warn-bg)]/40"}>
                      <td className="border-t border-[var(--border)] px-3 py-2 font-mono font-medium">{row.label}</td>
                      <td className="border-t border-[var(--border)] px-3 py-2 text-right tabular-nums">
                        {row.label === "Заряд" ? sign(row.left) : row.left}
                      </td>
                      <td className="border-t border-[var(--border)] px-3 py-2 text-right tabular-nums">
                        {row.label === "Заряд" ? sign(row.right) : row.right}
                      </td>
                      <td className="border-t border-[var(--border)] px-3 py-2 text-center">
                        {row.equal ? (
                          <span className="font-bold text-[var(--status-ok-fg)]">✓</span>
                        ) : (
                          <span className="font-bold text-[var(--status-warn-fg)]">✗</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="flex items-start gap-2 rounded-xl border border-[var(--border)] p-3 text-xs text-[var(--muted)]">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-warn-fg)]" />
              <span>
                Балансировка проверяет только сохранение атомов и заряда. Формально уравненная запись{" "}
                <strong>не доказывает, что реакция реально протекает</strong>: направление и скорость определяют
                термодинамика (ΔG) и кинетика, а не коэффициенты. Ионные реакции дополнительно требуют реальных
                условий (среда, растворимость).
              </span>
            </p>
          </div>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
        <ArrowRight className="h-3.5 w-3.5" />
        Ионы записываются в квадратных скобках: [Fe2+], [MnO4-], [SO4 2-]. Для молекулярных уравнений строка
        «Заряд» не показывается — все частицы нейтральны.
      </p>
    </div>
  );
}
