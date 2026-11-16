"use client";

/**
 * Таблица растворимости: матрица катионов и анионов.
 * Клик по иону подсвечивает его строку/столбец — так проще отвечать на
 * «растворим ли сульфат бария», чем водить пальцем по большой таблице.
 */
import { useState } from "react";
import {
  ANIONS,
  CATIONS,
  SOLUBILITY_LEGEND,
  SOLUBILITY_MATRIX,
  type SolubilityCode,
} from "@/lib/chemistry/solubility";

// Статусные цвета — только токены темы (test/status-tokens), чтобы тёмная
// тема не получала светлые пятна.
const CELL_STYLE: Record<SolubilityCode, string> = {
  р: "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]",
  м: "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]",
  н: "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]",
  "—": "bg-transparent text-[var(--muted)]",
};

export function SolubilityTableView() {
  const [cation, setCation] = useState<number | null>(null);
  const [anion, setAnion] = useState<number | null>(null);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-bold">Таблица растворимости</h2>
        <p className="text-sm text-[var(--muted)]">
          Нажмите на катион или анион, чтобы подсветить строку или столбец. Значения ориентировочные — для точных
          цифр смотрите справочник при нужной температуре.
        </p>
      </header>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
        {SOLUBILITY_LEGEND.map((item) => (
          <span key={item.code} className="inline-flex items-center gap-1.5">
            <span className={`inline-flex h-4 w-4 items-center justify-center rounded text-[11px] font-bold ${CELL_STYLE[item.code]}`}>
              {item.code}
            </span>
            {item.label}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
        <table className="w-full min-w-[820px] border-collapse text-center text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[var(--card)] p-1 text-left text-[11px] font-semibold text-[var(--muted)]">
                катион \ анион
              </th>
              {ANIONS.map((item, index) => (
                <th key={item.formula} className="p-1">
                  <button
                    type="button"
                    onClick={() => setAnion(anion === index ? null : index)}
                    className={
                      "w-full rounded-md px-1 py-1 text-[11px] font-bold transition " +
                      (anion === index ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "hover:bg-slate-100")
                    }
                    title={item.name}
                  >
                    {item.formula}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATIONS.map((row, rowIndex) => (
              <tr key={row.formula}>
                <th className="sticky left-0 z-10 bg-[var(--card)] p-1 text-left">
                  <button
                    type="button"
                    onClick={() => setCation(cation === rowIndex ? null : rowIndex)}
                    className={
                      "rounded-md px-1.5 py-1 text-[11px] font-bold transition " +
                      (cation === rowIndex ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "hover:bg-slate-100")
                    }
                    title={row.name}
                  >
                    {row.formula}
                  </button>
                </th>
                {ANIONS.map((column, colIndex) => {
                  const code = SOLUBILITY_MATRIX[rowIndex][colIndex];
                  const active = cation === rowIndex || anion === colIndex;
                  return (
                    <td key={column.formula} className="p-0.5">
                      <span
                        className={
                          "flex h-7 items-center justify-center rounded font-semibold " +
                          CELL_STYLE[code] +
                          (active ? " ring-1 ring-[var(--primary)]/40" : "")
                        }
                      >
                        {code}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cation != null || anion != null ? (
        <p className="text-xs text-[var(--muted)]">
          {cation != null ? `Катион: ${CATIONS[cation].formula} (${CATIONS[cation].name})` : ""}
          {cation != null && anion != null ? " · " : ""}
          {anion != null ? `Анион: ${ANIONS[anion].formula} (${ANIONS[anion].name})` : ""}
        </p>
      ) : null}
    </section>
  );
}
