/**
 * H8: экспорт расчётов и протоколов.
 *
 * CSV собирается как строка (её можно проверить тестом), скачивание —
 * отдельная браузерная функция. PDF на этом этапе — печать страницы с
 * print-стилями: без внешнего рендера и без обещаний «настоящего» PDF.
 */

export type CsvColumn<Row extends Record<string, unknown> = Record<string, unknown>> = {
  key: keyof Row & string;
  label: string;
};

const BOM = "\uFEFF";

function escapeCell(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  // Excel понимает кавычки; внутренние кавычки удваиваются.
  if (/[",\r\n;]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** CSV с BOM (Excel открывает кириллицу без кракозябр), CRLF и экранированием. */
export function toCsv(
  rows: ReadonlyArray<Record<string, unknown>>,
  columns: ReadonlyArray<{ key: string; label: string }>,
): string {
  const header = columns.map((column) => escapeCell(column.label)).join(",");
  const body = rows.map((row) => columns.map((column) => escapeCell(row[column.key])).join(","));
  return `${BOM}${[header, ...body].join("\r\n")}`;
}

/** Имя файла без пробелов и подозрительных символов. */
export function csvFilename(prefix: string, suffix: string, date = new Date()): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const safe = `${prefix}-${suffix}`.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/-+/g, "-");
  return `${safe}-${stamp}.csv`;
}

/** Скачивание CSV в браузере. Возвращает false, если среда не браузерная. */
export function downloadCsv(filename: string, csv: string): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") {
    return false;
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Освобождаем blob чуть позже: Safari не успевает начать скачивание сразу.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** PDF-этап 1: печать текущего представления с print-стилями. */
export function printCurrentView(): boolean {
  if (typeof window === "undefined" || typeof window.print !== "function") return false;
  window.print();
  return true;
}
