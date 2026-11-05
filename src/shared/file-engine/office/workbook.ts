/**
 * Встроенный просмотр XLSX.
 *
 * Библиотека xlsx уже есть в проекте, поэтому второй парсер не создаётся.
 * Читаются значения листов (рассчитанные значения формул, а не формулы),
 * объединения ячеек и имена листов. Макросы не исполняются, формулы не
 * пересчитываются.
 */
import { DEFAULT_LIMITS } from "../limits";
import type { PreviewLimits } from "../types";
import { buildSheetGrid, type SheetGrid, type SheetMerge } from "./sheetGrid";

export type WorkbookSheet = {
  name: string;
  rows: string[][];
  merges: SheetMerge[];
  grid: SheetGrid;
  truncated: boolean;
};

export type Workbook = {
  sheets: WorkbookSheet[];
  warnings: string[];
  truncated: boolean;
};

type RawMerge = { s: { r: number; c: number }; e: { r: number; c: number } };

type XlsxModule = {
  read: (
    data: Uint8Array,
    options: { type: "array"; cellDates?: boolean; sheetRows?: number },
  ) => {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json: <T>(
      sheet: unknown,
      options: { header: 1; raw: false; defval: string; blankrows: boolean },
    ) => T[];
  };
};

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export async function parseWorkbook(
  data: ArrayBuffer | Uint8Array,
  limits: PreviewLimits = DEFAULT_LIMITS,
): Promise<Workbook> {
  const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
  const imported = (await import("xlsx")) as unknown as XlsxModule | { default: XlsxModule };
  const lib: XlsxModule = "read" in imported ? imported : imported.default;

  const book = lib.read(buffer, {
    type: "array",
    cellDates: false,
    sheetRows: limits.maxSheetRows + 1,
  });

  const names = Array.isArray(book.SheetNames) ? book.SheetNames : [];
  const warnings: string[] = [];
  const sheets: WorkbookSheet[] = [];
  const truncatedSheets = names.length > limits.maxSheets;

  for (const name of names.slice(0, limits.maxSheets)) {
    const worksheet = book.Sheets[name];
    if (!worksheet) continue;

    const rawRows = lib.utils.sheet_to_json<string[]>(worksheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });

    let truncatedRows = false;
    let truncatedCols = false;
    const rows: string[][] = [];

    for (const rawRow of rawRows) {
      if (rows.length >= limits.maxSheetRows) {
        truncatedRows = true;
        break;
      }
      const values = Array.isArray(rawRow) ? rawRow : [];
      if (values.length > limits.maxSheetCols) truncatedCols = true;
      const cells = values
        .slice(0, limits.maxSheetCols)
        .map((cell) => toText(cell).replace(/\r?\n/g, " ").slice(0, 500));
      rows.push(cells);
    }

    const rawMerges = (worksheet as { "!merges"?: RawMerge[] })["!merges"];
    const merges: SheetMerge[] = Array.isArray(rawMerges)
      ? rawMerges
          .filter((merge) => merge && merge.s && merge.e)
          .map((merge) => ({
            startRow: merge.s.r,
            startCol: merge.s.c,
            endRow: merge.e.r,
            endCol: merge.e.c,
          }))
      : [];

    const grid = buildSheetGrid(rows, merges, limits);

    if (truncatedRows) warnings.push(`Лист «${name}»: показаны первые ${limits.maxSheetRows} строк.`);
    if (truncatedCols) warnings.push(`Лист «${name}»: показаны первые ${limits.maxSheetCols} столбцов.`);

    sheets.push({ name, rows, merges, grid, truncated: truncatedRows || truncatedCols });
  }

  if (truncatedSheets) warnings.push(`Показаны первые ${limits.maxSheets} листов.`);
  if (!sheets.length) warnings.push("В книге нет листов с данными.");

  return { sheets, warnings, truncated: truncatedSheets || sheets.some((sheet) => sheet.truncated) };
}
