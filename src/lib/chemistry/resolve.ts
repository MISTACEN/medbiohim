import type { ChemicalMolecule } from "./types";

/**
 * Ответ Worker'а `/chemistry/resolve` приходит в общем конверте
 * `{ok, data:{molecule}, requestId}` (см. `workers/api/src/lib/response.ts`),
 * а ошибка — в `{ok:false, error:{code,message}}`. Ранние обработчики отдавали
 * «плоское» `{molecule}` / `{error}`, поэтому принимаем оба вида.
 */
export type ChemistryResolvePayload = {
  ok?: boolean;
  data?: { molecule?: ChemicalMolecule | null } | null;
  molecule?: ChemicalMolecule | null;
  error?: unknown;
};

export type ChemistryResolveResult =
  | { ok: true; molecule: ChemicalMolecule }
  | { ok: false; message: string };

export function readChemistryResolve(httpOk: boolean, payload: unknown): ChemistryResolveResult {
  const body = (payload ?? {}) as ChemistryResolvePayload;
  if (typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Пустой ответ сервиса структур" };
  }
  const molecule = body.data?.molecule ?? body.molecule ?? null;
  if (!httpOk || body.ok === false || !molecule || typeof molecule !== "object") {
    const message = errorMessage(body.error);
    if (message) return { ok: false, message };
    return { ok: false, message: httpOk ? "Вещество не найдено" : "Сервис структур недоступен" };
  }
  return { ok: true, molecule };
}

function errorMessage(error: unknown): string {
  if (typeof error === "string") return error.trim();
  if (error && typeof error === "object") {
    const { message, code } = error as { message?: unknown; code?: unknown };
    if (typeof message === "string" && message.trim()) return message.trim();
    if (typeof code === "string" && code.trim()) return code.trim();
  }
  return "";
}
