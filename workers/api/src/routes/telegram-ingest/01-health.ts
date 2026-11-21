import { ok, requestId } from "../../lib/response";

import type { TelegramIngestRouter } from "./types";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout";

export function registerHealthRoutes(telegramIngest: TelegramIngestRouter) {
telegramIngest.get("/ingest/health", async (c) => {
  const rid = requestId();
  const verifier = String(c.env.TELEGRAM_BOT_VERIFY_INGEST_URL || "").trim();
  if (!verifier) return c.json(ok({ configured: false, verifier: "none" }, rid));
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(verifier, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    return c.json(ok({
      configured: true,
      verifier: "bot",
      reachable: response.status === 401,
      botStatus: response.status,
      latencyMs: Date.now() - started,
    }, rid));
  } catch (error) {
    return c.json(ok({
      configured: true,
      verifier: "bot",
      reachable: false,
      error: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
      latencyMs: Date.now() - started,
    }, rid));
  }
});
}
