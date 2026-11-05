"use client";

/**
 * Просмотр XLSX: листы, таблица, объединённые ячейки.
 * Значения показываются как их посчитал Excel; формулы заново не вычисляются.
 */
import { useEffect, useState } from "react";
import { DEFAULT_LIMITS } from "../limits";
import { parseWorkbook, type Workbook } from "../office/workbook";
import { ViewerError, ViewerLoading, ViewerNotice } from "./parts";
import { useFileBytes } from "./useFileBytes";

export function SheetViewer({ url }: { url: string }) {
  const { status, bytes, error, reload } = useFileBytes(url, DEFAULT_LIMITS.maxOfficeBytes);
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);

  useEffect(() => {
    if (status !== "ready" || !bytes) return;
    let active = true;
    setParseError(null);
    parseWorkbook(bytes)
      .then((result) => {
        if (active) setWorkbook(result);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setWorkbook(null);
        setParseError(reason instanceof Error ? reason.message : "Не удалось разобрать таблицу.");
      });
    return () => {
      active = false;
    };
  }, [status, bytes]);

  if (status === "loading") return <ViewerLoading label="Разбираем таблицу…" />;
  if (status === "error") return <ViewerError message={error ?? ""} onRetry={reload} />;
  if (parseError) return <ViewerError message={parseError} onRetry={reload} />;
  if (!workbook) return <ViewerLoading label="Разбираем таблицу…" />;
  if (!workbook.sheets.length) return <ViewerNotice tone="info">В книге нет листов с данными.</ViewerNotice>;

  const sheet = workbook.sheets[Math.min(sheetIndex, workbook.sheets.length - 1)];

  return (
    <div className="space-y-2">
      {workbook.warnings.map((warning) => (
        <ViewerNotice key={warning}>{warning}</ViewerNotice>
      ))}

      {workbook.sheets.length > 1 ? (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Листы книги">
          {workbook.sheets.map((item, index) => (
            <button
              key={item.name}
              type="button"
              role="tab"
              aria-selected={index === sheetIndex}
              className={
                index === sheetIndex
                  ? "rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white"
                  : "rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-medium text-slate-600 hover:border-indigo-300"
              }
              onClick={() => setSheetIndex(index)}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="max-h-[65vh] overflow-auto rounded-xl border border-[var(--border)] bg-white dark:bg-slate-900">
        <table className="w-full border-collapse text-xs">
          <tbody>
            {sheet.grid.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={rowIndex === 0 ? "bg-slate-100 dark:bg-slate-800" : ""}>
                {row.map((cell, cellIndex) => {
                  if (cell.covered) return null;
                  return (
                    <td
                      key={cellIndex}
                      rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                      colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                      className="min-w-[80px] whitespace-pre-wrap border border-[var(--border)] px-2 py-1 align-top"
                    >
                      {cell.value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sheet.truncated ? (
        <ViewerNotice tone="info">Лист показан не полностью: сработали пределы просмотра.</ViewerNotice>
      ) : null}
    </div>
  );
}
