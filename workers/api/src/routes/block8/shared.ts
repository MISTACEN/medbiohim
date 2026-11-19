import { fail } from "../../lib/response";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function err(c: any, rid: string, status: number, code: string, message: string) {
  const { body, status: s } = fail(code, message, status, rid);
  return c.json(body, s as any);
}

export function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
