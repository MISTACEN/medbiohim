/**
 * Общие форматтеры для учебного контура (/study ↔ /schedule ↔ карточки).
 */
export function fmtDate(value?: string | null): string {
  if (!value) return "без срока";
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join(".") : value;
}

export function isoToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
