/**
 * Оси задания: «препарат / структуры / утверждения» вместо выбора режима.
 *
 * Чистый модуль без Supabase и Hono: его импортируют и роуты, и тесты, поэтому
 * здесь только сопоставление осей с существующими режимами сборки.
 */
import type { DiagnosticumMode } from "./model";

export const PART_IDS = ["preparation", "structures", "statements", "differential"] as const;
export type PartId = (typeof PART_IDS)[number];

/**
 * Переводит выбранные оси в существующий режим сборки.
 *
 * Режимы (`identify`/`structures`/`schema`/`complex`) остаются в API и базе ради
 * старых попыток и статистики, но UI больше не заставляет выбирать «режим»:
 * студент отмечает оси, а сервер сводит их к той же сборке. Неизвестный набор —
 * `null`, вызывающий код отвечает 422, а не собирает что попало.
 */
export function modeForParts(parts: unknown): DiagnosticumMode | null {
  if (!Array.isArray(parts) || !parts.length) return null;
  const set = new Set(
    parts
      .map((value) => String(value ?? "").trim())
      .filter((value): value is PartId => (PART_IDS as readonly string[]).includes(value)),
  );
  if (!set.size) return null;
  const has = (part: PartId) => set.has(part);
  if (set.size === 1 && has("differential")) return "differential";
  if (set.size === 1 && has("structures")) return "structures";
  if (has("statements") && has("preparation") && !has("structures")) return "schema";
  if (has("preparation") && !has("structures") && !has("statements")) return "identify";
  if (has("preparation") && has("structures") && has("statements")) return "complex";
  return null;
}
