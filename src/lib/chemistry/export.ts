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

/*
 * Печать из выдвижной панели химического модуля.
 *
 * Панель — это portal поверх лекции, поэтому обычная печать выводила бы ещё и
 * текст лекции под ней. Помечаем <html> атрибутом, по которому print-стили
 * (globals.css) оставляют на листе только содержимое панели: всё остальное
 * в body скрывается, а сама панель из фиксированной рамки со скроллом
 * превращается в обычный блок на всю ширину — иначе напечаталась бы только
 * видимая часть с прокруткой.
 */
const PRINT_SCOPE_ATTR = "data-print-scope";
const PRINT_SCOPE_PANEL = "chem-panel";

/** Снять ограничение печати (например, панель закрыли). */
export function resetPrintScope(): void {
  if (typeof document === "undefined") return;
  document.documentElement.removeAttribute(PRINT_SCOPE_ATTR);
}

/** PDF-этап 1: печать текущего представления с print-стилями. */
export function printCurrentView(): boolean {
  if (typeof window === "undefined" || typeof window.print !== "function") return false;
  const panel = typeof document !== "undefined" ? document.querySelector("[data-chem-print-root]") : null;
  if (!panel) {
    window.print();
    return true;
  }

  const root = document.documentElement;
  const previous = root.getAttribute(PRINT_SCOPE_ATTR);
  root.setAttribute(PRINT_SCOPE_ATTR, PRINT_SCOPE_PANEL);

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    if (previous === null) root.removeAttribute(PRINT_SCOPE_ATTR);
    else root.setAttribute(PRINT_SCOPE_ATTR, previous);
    window.removeEventListener("afterprint", restore);
    window.removeEventListener("focus", restore);
  };
  // afterprint в части браузеров не приходит; focus срабатывает при возврате
  // в окно после закрытия диалога печати — этого достаточно, чтобы не оставить
  // ограничение висеть на следующих печатях.
  window.addEventListener("afterprint", restore);
  window.addEventListener("focus", restore);
  window.print();
  return true;
}
