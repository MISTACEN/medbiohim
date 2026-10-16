import { Hono } from "hono";
import type { Env } from "../env";
import { ok, requestId } from "../lib/response";

const health = new Hono<{ Bindings: Env }>();

function payload(env: Env) {
  const rid = requestId();
  return ok(
    {
      status: "ok",
      service: "medbiohim-api",
      mode: "production",
      env: env.APP_ENV || "production",
      time: new Date().toISOString(),
      supabaseConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
      redisConfigured: Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
      openaiConfigured: Boolean(env.OPENAI_API_KEY),
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
