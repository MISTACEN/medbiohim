/**
 * MEDBIOHIM API — Cloudflare Workers + Hono
 * Clean student-facing API for frontend /api/v1 contract.
 *
 * Secrets (Cloudflare Dashboard → Worker → Settings → Variables):
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 *   OPENAI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY (AI providers)
 *   UPSTASH_BLOB_TOKEN (private histology media and user uploads)
 *   APP_ORIGIN, CORS_ORIGINS
 */
import { Hono } from "hono";
import type { Env } from "./env";
import { corsMiddleware } from "./middleware/cors";
import { securityHeaders } from "./middleware/security";
import { fail, requestId } from "./lib/response";

import health from "./routes/health";
import auth from "./routes/auth";
import me from "./routes/me";
import dashboard from "./routes/dashboard";
import subjects from "./routes/subjects";
import groups from "./routes/groups";
import schedule from "./routes/schedule";
import curriculum from "./routes/curriculum";
import homework from "./routes/homework";
import submissions from "./routes/submissions";
import planner from "./routes/planner";
import academic from "./routes/academic";
import attendance from "./routes/attendance";
import lectures from "./routes/lectures";
import materials from "./routes/materials";
import tests from "./routes/tests";
import preparation from "./routes/preparation";
import tickets from "./routes/tickets";
import my from "./routes/my";
import questions from "./routes/questions";
import search from "./routes/search";
import trainings from "./routes/trainings";
import trainers from "./routes/trainers";
import progress from "./routes/progress";
import srs from "./routes/srs";
import sessions from "./routes/sessions";
import settings from "./routes/settings";
import presence from "./routes/presence";
import community from "./routes/community";
import calculators from "./routes/calculators";
import ai from "./routes/ai";
import chemistry from "./routes/chemistry";
import plans from "./routes/plans";
import storage from "./routes/storage";

const app = new Hono<{ Bindings: Env }>();

app.use("*", corsMiddleware);
app.use("*", securityHeaders);
app.use("*", async (c, next) => {
  const rid = requestId();
  c.header("x-request-id", rid);
  c.header("x-mbh-api-source", "cloudflare");
  await next();
});

app.route("/", health);

const v1 = new Hono<{ Bindings: Env }>();

// Run canonical Hono handlers first; if a handler explicitly returns 501, try the
// legacy compatibility Worker with a cloned request. This keeps the public API
// unified while missing route contracts are ported. Never retry ordinary 4xx/5xx.
v1.use("*", async (c, next) => {
  const legacyRequest = c.req.raw.clone();
  await next();
  if (c.res.status !== 501 || !c.env.MEDBIOHIM_UPSTREAM) return;
  try {
    return await c.env.MEDBIOHIM_UPSTREAM.fetch(legacyRequest);
  } catch (error) {
    console.error("[medbiohim-api:legacy-fallback]", error);
    const { body, status } = fail("LEGACY_UPSTREAM_UNAVAILABLE", "Совместимый API временно недоступен", 502);
    return c.json(body, status as 502);
  }
});

// Compatibility aliases from the archived PHP/legacy Cloudflare API.
// Keep these aliases in the same Worker so the frontend has one canonical API origin.
function rewriteRequest(req: Request, pathname: string): Request {
  const url = new URL(req.url);
  url.pathname = pathname;
  const init: RequestInit = { method: req.method, headers: req.headers, redirect: req.redirect };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = req.body;
  return new Request(url.toString(), init);
}

v1.get("/auth/me", (c) => me.fetch(rewriteRequest(c.req.raw, "/"), c.env));
v1.post("/files/upload", (c) => storage.fetch(rewriteRequest(c.req.raw, "/upload"), c.env));

v1.route("/auth", auth);
v1.route("/me", me);
v1.route("/dashboard", dashboard);
v1.route("/subjects", subjects);
v1.route("/groups", groups);
v1.route("/schedule", schedule);
v1.route("/curriculum", curriculum);
v1.route("/homeworks", homework);
v1.route("/submissions", submissions);
v1.route("/planner", planner);
v1.route("/academic", academic);
v1.route("/attendance", attendance);
v1.route("/lectures", lectures);
v1.route("/materials", materials);
v1.route("/tests", preparation);
v1.route("/tests", tests);
v1.route("/tickets", tickets);
v1.route("/my", my);
v1.route("/questions", questions);
v1.route("/search", search);
v1.route("/trainings", trainings);
v1.route("/trainers", trainers);
v1.route("/progress", progress);
v1.route("/srs", srs);
v1.route("/sessions", sessions);
v1.route("/settings", settings);
v1.route("/presence", presence);
v1.route("/community", community);
v1.route("/calculators", calculators);
v1.route("/ai", ai);
v1.route("/chemistry", chemistry);
v1.route("/storage", storage);

// Flat catalog/plan aliases used by frontend
v1.get("/subjects-catalog", (c) => plans.fetch(rewriteRequest(c.req.raw, "/subjects-catalog"), c.env));
v1.route("/", plans);

v1.all("*", (c) => {
  const { body, status } = fail(
    "ROUTE_NOT_IMPLEMENTED",
    `Route not implemented: ${c.req.method} ${c.req.path}`,
    501
  );
  return c.json(body, status as 501);
});

app.route("/api/v1", v1);

app.notFound((c) => {
  const { body, status } = fail("NOT_FOUND", "Not found", 404);
  return c.json(body, status as 404);
});

app.onError((err, c) => {
  console.error("[medbiohim-api]", err);
  const { body, status } = fail("INTERNAL", "Внутренняя ошибка", 500);
  return c.json(body, status as 500);
});

export default app;
