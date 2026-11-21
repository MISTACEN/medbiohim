import type { Env } from "../../env";
import { ok } from "../../lib/response";
import { isHttpsUrl } from "../../env";
import { classificationProviderLabel } from "../../lib/telegram-classify";
import type { Classification, LevelBuckets } from "../../lib/telegram-classify";

import { constantTimeEqual } from "../../lib/timing";
import { escapeHtml } from "../../lib/html-escape";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout";

export { constantTimeEqual, escapeHtml };
export const MAX_BODY_BYTES = 256 * 1024;
export const HOMEWORK_THRESHOLD = 0.65;

export function ingestSecret(env: Env): string {
  // Приоритет: выделенный ingest-секрет, затем webhook-секрет, затем общий
  // внутренний (тот же на API и боте) — без него приём из групп всегда 503.
  return String(env.TELEGRAM_INGEST_SECRET || env.TELEGRAM_WEBHOOK_SECRET || env.TELEGRAM_INTERNAL_SECRET || "").trim();
}

// Per-isolate guard for the delegated verifier. The secret is high entropy, but
// an online oracle should still be expensive to probe.
const verifyAttempts = new Map<string, { start: number; count: number }>();
export const VERIFY_WINDOW_MS = 60_000;
export const VERIFY_LIMIT = 60;

export function verifyRateLimited(c: any): boolean {
  const key = String(c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown");
  const now = Date.now();
  const current = verifyAttempts.get(key);
  if (!current || now - current.start > VERIFY_WINDOW_MS) {
    verifyAttempts.set(key, { start: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > VERIFY_LIMIT;
}

export type IngestVerification = "ok" | "unauthorized" | "unavailable" | "unconfigured" | "rate_limited";

export async function verifyIngestRequest(c: any): Promise<IngestVerification> {
  const provided = String(c.req.header("x-telegram-bot-api-secret-token") || c.req.header("x-medbiohim-internal") || "");
  const expected = ingestSecret(c.env);
  if (expected) {
    return constantTimeEqual(provided, expected) ? "ok" : "unauthorized";
  }

  // No local copy: ask the bot Worker, which owns the secret. This is the same
  // delegation model as /auth/telegram/webapp and keeps the API stateless.
  const verifier = String(c.env.TELEGRAM_BOT_VERIFY_INGEST_URL || "").trim();
  if (!verifier || !isHttpsUrl(verifier)) return "unconfigured";
  if (verifyRateLimited(c)) return "rate_limited";

  try {
    const response = await fetchWithTimeout(verifier, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": provided,
      },
      body: "{}",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401) return "unauthorized";
    if (!response.ok) return "unavailable";
    const body: any = await response.json().catch(() => null);
    return body?.ok === true ? "ok" : "unavailable";
  } catch {
    return "unavailable";
  }
}

export function formatDue(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Asia/Vladivostok",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function replyForCreated(result: {
  title: string;
  subject_name: string | null;
  due_at: string | null;
  levels?: LevelBuckets;
}): { text: string; path: string } {
  const due = formatDue(result.due_at);
  const subject = result.subject_name ? result.subject_name + " · " : "";
  const lines = ["✅ Задание добавлено в MEDBIOHIM", subject + result.title];
  if (due) lines.push("Срок: " + due);
  const levels = result.levels;
  if (levels) {
    const base = levels.base?.length || 0;
    const main = levels.main?.length || 0;
    const deep = levels.deep?.length || 0;
    if (base + main + deep > 0) {
      lines.push("База: " + base + " · Основной: " + main + " · Углубление: " + deep);
    }
  }
  return { text: lines.join("\n"), path: "/homework" };
}

export function replyForContinued(title: string): { text: string; path: string } {
  return { text: "➕ Дополнено задание: " + title, path: "/homework" };
}

export function replyForCandidate(classification: Classification): { text: string; path: string } {
  const provider = classificationProviderLabel(classification.provider);
  const material = classification.category === "material_candidate";
  return {
    text: (material
      ? "📎 Материал сохранён для проверки администратором"
      : "❓ Похоже на учебное задание, но уверенность низкая") +
      " (" + Math.round(classification.confidence * 100) + "%, " + provider + ").",
    path: "/admin/telegram",
  };
}

/**
 * Публичная проверка связки «API → бот»: отправляет заведомо пустой секрет и
 * ждёт 401. Никаких секретов и текстов сообщений здесь нет, поэтому маршрут
 * безопасен и не является оракулом для подбора.
 */
