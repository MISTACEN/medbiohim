import { Hono } from "hono";
import type { Env } from "../env";
import { ok, requestId } from "../lib/response";
import { gigachatConfigured, gigachatTransport } from "../lib/gigachat";
import { workersAiConfigured, workersAiModel } from "../lib/workers-ai";
import { storageProviderName } from "../lib/b2";

const health = new Hono<{ Bindings: Env }>();

/** Маркер сборки: по нему видно, доехал ли конкретный коммит до прода. */
export const API_REVISION = "2026-11-26-split";

function payload(env: Env) {
  const rid = requestId();
  return ok(
    {
      status: "ok",
      service: "medbiohim-api",
      revision: API_REVISION,
      mode: "production",
      env: env.APP_ENV || "production",
      time: new Date().toISOString(),
      supabaseConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
      redisConfigured: Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
      openaiConfigured: Boolean(env.OPENAI_API_KEY),
      // Хранилище снимков: без него загрузка «Своих препаратов» не работает.
      // Имя провайдера, а не ключи — секретов не раскрывает.
      storageProvider: storageProviderName(env),
      cloudflareAiConfigured: workersAiConfigured(env),
      cloudflareAiModel: workersAiModel(env),
      gigachatConfigured: gigachatConfigured(env),
      gigachatTransport: gigachatTransport(env),
      telegramIngestConfigured: Boolean(
        env.TELEGRAM_INGEST_SECRET || env.TELEGRAM_WEBHOOK_SECRET || env.TELEGRAM_BOT_VERIFY_INGEST_URL
      ),
      telegramIngestVerifier: env.TELEGRAM_INGEST_SECRET || env.TELEGRAM_WEBHOOK_SECRET
        ? "local"
        : env.TELEGRAM_BOT_VERIFY_INGEST_URL
          ? "bot"
          : "none",
    },
    rid
  );
}

health.get("/health", (c) => c.json(payload(c.env)));
health.get("/api/v1/health", (c) => c.json(payload(c.env)));
health.get("/api/v1", (c) =>
  c.json(
    ok({
      name: "medbiohim-api",
      version: "1.0.0",
      docs: "workers/api/README.md",
    })
  )
);
health.get("/api/v1/ping", (c) =>
  c.json(
    ok({
      pong: true,
      time: new Date().toISOString(),
      env: c.env.APP_ENV || "production",
    })
  )
);

export default health;
