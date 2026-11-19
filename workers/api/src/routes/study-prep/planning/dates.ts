

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const at = Date.parse(iso + "T00:00:00Z");
  if (!Number.isFinite(at)) return iso;
  return new Date(at + days * 86400000).toISOString().slice(0, 10);
}

export function diffDays(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso + "T00:00:00Z");
  const b = Date.parse(toIso + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export function fmtDay(iso: string): string {
  return iso.split("-").reverse().join(".");
}

export function clampPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Почему шаг стоит в плане — правило по освоенности темы. */
