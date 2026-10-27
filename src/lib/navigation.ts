/**
 * Возврат после входа должен оставаться внутри сайта: `next` приходит из адресной
 * строки, поэтому `https://…`, `//host` и `javascript:` недопустимы.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  const value = String(raw || "").trim();
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
