/**
 * MEDBIOHIM API — Cloudflare Workers + Hono
 * SINGLE canonical production Worker (medbiohim-api).
 *
 * Do not maintain a parallel student API in integrations/cloudflare-api or artifacts.
 * Shadow (medbiohim-api-shadow) remains only as MEDBIOHIM_UPSTREAM fallback for true 501s.
 * Telegram account-link confirmation is secret-checked and delegates atomic writes to a service-only RPC.
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
import scheduleIcal from "./routes/schedule-ical";
import scheduleFeed from "./routes/schedule-feed";
import lessonPlan from "./routes/lesson-plan";
import curriculum from "./routes/curriculum";
import homework from "./routes/homework";
import assignments from "./routes/assignments";
import topics from "./routes/topics";
import submissions from "./routes/submissions";
import planner from "./routes/planner";
import academic from "./routes/academic";
import attendance from "./routes/attendance";
import lectures from "./routes/lectures";
import materials from "./routes/materials";
import tests from "./routes/tests";
import preparation from "./routes/preparation";
import tickets from "./routes/tickets";
import examQuestions from "./routes/exam-questions";
import my from "./routes/my";
import questions from "./routes/questions";
import favorites from "./routes/favorites";
import notes from "./routes/notes";
import search from "./routes/search";
import trainings from "./routes/trainings";
import trainers from "./routes/trainers";
import progress from "./routes/progress";
import srs from "./routes/srs";
import sessions from "./routes/sessions";
import settings from "./routes/settings";
import accountData from "./routes/export";
import presence from "./routes/presence";
import community from "./routes/community";
import calculators from "./routes/calculators";
import ai from "./routes/ai";
import chemistry from "./routes/chemistry";
import plans from "./routes/plans";
import storage from "./routes/storage";
import adminRoutes from "./routes/admin";
import adminSchedule from "./routes/admin-schedule";
import histology from "./routes/histology";
import files from "./routes/files";
import telegram from "./routes/telegram";
import telegramIngest from "./routes/telegram-ingest";
import telegramDigest from "./routes/telegram-digest";
import labs from "./routes/labs";
import attestations from "./routes/attestations";
import adminAttestations from "./routes/admin-attestations";
import adminAccount from "./routes/admin-account";
import integrations from "./routes/integrations";
import externalPlatforms from "./routes/external-platforms";
import questionComments from "./routes/question-comments";
import workshop from "./routes/workshop";
import adminWorkshopConvert from "./routes/admin-workshop-convert";
import staff from "./routes/staff";

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

v1.use("*", async (c, next) => {
  const legacyRequest = c.req.raw.clone();
  await next();
  if (c.res.status !== 501 || !c.env.MEDBIOHIM_UPSTREAM) return;
  try {
    // Hono has already finalized the downstream response after `next()`.
    // Assign the fallback response to c.res so it actually replaces the 501.
    c.res = await c.env.MEDBIOHIM_UPSTREAM.fetch(legacyRequest);
    return c.res;
  } catch (error) {
    console.error("[medbiohim-api:legacy-fallback]", error);
    const { body, status } = fail(
      "LEGACY_UPSTREAM_UNAVAILABLE",
      "Совместимый API временно недоступен",
      502
    );
    c.res = c.json(body, status as 502);
    return c.res;
  }
});

function rewriteRequest(req: Request, pathname: string): Request {
  const url = new URL(req.url);
  url.pathname = pathname;
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers: req.headers,
    redirect: req.redirect,
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
    init.duplex = "half";
  }
  return new Request(url.toString(), init);
}

v1.get("/auth/me", (c) => me.fetch(rewriteRequest(c.req.raw, "/"), c.env));
v1.post("/files/upload", (c) =>
  storage.fetch(rewriteRequest(c.req.raw, "/upload"), c.env)
);

v1.route("/auth", auth);
v1.route("/me", me);
v1.route("/dashboard", dashboard);
v1.route("/subjects", subjects);
v1.route("/groups", groups);
v1.route("/schedule", schedule);
v1.route("/schedule", scheduleIcal);
v1.route("/schedule", scheduleFeed);
v1.route("/lesson-plan", lessonPlan);
v1.route("/curriculum", curriculum);
// Alias: some clients call /plans — map to curriculum (avoid 501)
v1.get("/plans", (c) => curriculum.fetch(rewriteRequest(c.req.raw, "/"), c.env));
v1.route("/homeworks", homework);
v1.route("/assignments", assignments);
v1.route("/topics", topics);
v1.route("/homework", homework);
v1.route("/submissions", submissions);
v1.route("/planner", planner);
v1.route("/academic", academic);
v1.route("/attendance", attendance);
v1.route("/lectures", lectures);
v1.route("/materials", materials);
v1.route("/tests", preparation);
v1.route("/tests", tests);
v1.route("/tickets", tickets);
v1.route("/exam-questions", examQuestions);
v1.route("/my", my);
v1.route("/questions", questions);
v1.route("/favorites", favorites);
v1.route("/notes", notes);
v1.route("/search", search);
v1.route("/trainings", trainings);
v1.route("/trainers", trainers);
v1.route("/progress", progress);
v1.route("/srs", srs);
v1.route("/sessions", sessions);
v1.route("/settings", settings);
// SA6: экспорт данных аккаунта и удаление с grace-периодом (/account/export, /account/deletion).
v1.route("/account", accountData);
v1.route("/telegram", telegramIngest);
v1.route("/telegram", telegramDigest);
v1.route("/telegram", telegram);
v1.route("/presence", presence);
v1.route("/community", community);
v1.route("/workshop", workshop);
v1.route("/staff", staff);
v1.route("/calculators", calculators);
v1.route("/ai", ai);
v1.route("/chemistry", chemistry);
v1.route("/storage", storage);
v1.route("/files", files);
v1.route("/admin", adminRoutes);
// admin-schedule declares its own "/schedule/..." paths, so it mounts on /admin.
v1.route("/admin", adminSchedule);
v1.route("/admin", adminAttestations);
// Блок 1 бэклога: Workshop → банк вопросов (draft/convert/reject).
v1.route("/admin", adminWorkshopConvert);
// SA6: ручной запуск исполнения запросов на удаление аккаунта (только админ).
v1.route("/admin", adminAccount);
v1.route("/histology", histology);
v1.route("/labs", labs);
v1.route("/attestations", attestations);
v1.route("/integrations", integrations);
v1.route("/external-platforms", externalPlatforms);
v1.route("/questions", questionComments);

v1.get("/subjects-catalog", (c) =>
  plans.fetch(rewriteRequest(c.req.raw, "/subjects-catalog"), c.env)
);
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

// SA6: cron-исполнение запросов на удаление аккаунта.
//
// Cloudflare вызывает `scheduled` на default-экспорте модуля, а приложение Hono
// уже умеет fetch. Поэтому scheduled вешается на тот же объект через
// Object.assign: `export default app` остаётся рабочим (тесты и рантайм Hono
// продолжают видеть приложение), а воркер получает ещё и cron-обработчик.
const appWithCron = Object.assign(app, {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(
      (async () => {
        // Импорт внутри обработчика: код удаления не грузится на каждый запрос.
        const { runAccountDeletionSweep } = await import("./jobs/account-deletion");
        const result = await runAccountDeletionSweep(env);
        console.log("[account-deletion-sweep] результат", JSON.stringify(result));
      })()
    );
    ctx.waitUntil(
      (async () => {
        // Курс группы: 1 сентября пересчитывается сам, id и история не меняются.
        const { runCourseRollover } = await import("./jobs/course-rollover");
        const result = await runCourseRollover(env);
        console.log("[course-rollover] результат", JSON.stringify(result));
      })()
    );
  },
});

export default appWithCron;
