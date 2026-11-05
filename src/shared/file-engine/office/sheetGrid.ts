/**
 * Сетка листа таблицы с объединёнными ячейками.
 *
 * Чистая функция: принимает строки и объединения, возвращает сетку, которую
 * можно отрисовать с rowSpan/colSpan. Здесь же применяются пределы по строкам
 * и столбцам, чтобы огромный лист не попал в DOM целиком.
 */
import { DEFAULT_LIMITS } from "../limits";
import type { PreviewLimits } from "../types";

export type SheetMerge = {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
};

export type GridCell = {
  value: string;
  rowSpan: number;
  colSpan: number;
  /** Ячейка закрыта объединением слева/сверху: рисовать её не нужно. */
  covered: boolean;
};

export type SheetGrid = {
  rows: GridCell[][];
  colCount: number;
  truncated: boolean;
};

function cell(value = ""): GridCell {
  return { value, rowSpan: 1, colSpan: 1, covered: false };
}

export function buildSheetGrid(
  rows: readonly (readonly string[])[],
  merges: readonly SheetMerge[] = [],
  limits: PreviewLimits = DEFAULT_LIMITS,
): SheetGrid {
  const maxRows = Math.min(rows.length, limits.maxSheetRows);
  let colCount = 0;
  for (const row of rows.slice(0, maxRows)) {
    if (row.length > colCount) colCount = row.length;
  }
  colCount = Math.min(colCount, limits.maxSheetCols);

  const grid: GridCell[][] = [];
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const source = rows[rowIndex] ?? [];
    const row: GridCell[] = [];
    for (let colIndex = 0; colIndex < colCount; colIndex += 1) {
      row.push(cell(String(source[colIndex] ?? "")));
    }
    grid.push(row);
  }

  for (const merge of merges) {
    const startRow = Math.max(0, Math.min(merge.startRow, maxRows - 1));
    const startCol = Math.max(0, Math.min(merge.startCol, colCount - 1));
    const endRow = Math.max(0, Math.min(merge.endRow, maxRows - 1));
    const endCol = Math.max(0, Math.min(merge.endCol, colCount - 1));
    if (endRow <= startRow && endCol <= startCol) continue;
    if (maxRows === 0 || colCount === 0) continue;

    grid[startRow][startCol] = {
      value: grid[startRow][startCol].value,
      rowSpan: endRow - startRow + 1,
      colSpan: endCol - startCol + 1,
      covered: false,
    };

    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
      for (let colIndex = startCol; colIndex <= endCol; colIndex += 1) {
        if (rowIndex === startRow && colIndex === startCol) continue;
        grid[rowIndex][colIndex].covered = true;
        grid[rowIndex][colIndex].rowSpan = 1;
        grid[rowIndex][colIndex].colSpan = 1;
      }
    }
  }

  return {
    rows: grid,
    colCount,
    truncated: rows.length > maxRows || colCount >= limits.maxSheetCols,
  };
}
