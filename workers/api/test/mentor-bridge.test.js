// Bridge MEDBIOHIM → PdfMentor: тест держит контракт безопасности бриджа.
// Проверяем именно те свойства, которые нельзя увидеть в UI: одноразовость
// кода, отсутствие кода в URL, HMAC-подпись обмена и закрытость без секрета.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relative) {
  return readFile(new URL(relative, import.meta.url), "utf8");
}

async function mentorDomain() {
  const parts = await Promise.all([
    source("../src/routes/mentor.ts"),
    source("../src/routes/mentor/index.ts"),
    source("../src/routes/mentor/model.ts"),
    source("../src/routes/mentor/store.ts"),
  ]);
  return parts.join("\n");
}

test("SSO-код одноразовый и хранится в Redis, а не в памяти изолята", async () => {
  const store = await source("../src/routes/mentor/store.ts");
  assert.match(store, /getdel<MentorCodePayload>/, "обмен обязан атомарно удалять код");
  assert.match(store, /KEY_PREFIX \+ code, payload, \{ ex: ttlSeconds \}/, "TTL кода задаётся в Redis");

  const domain = await mentorDomain();
  assert.doesNotMatch(domain, /const tokenCache = new Map/, "память изолята не может быть основным хранилищем кодов");
  assert.match(domain, /storeMentorCode\(/);
  assert.match(domain, /consumeMentorCode\(/);
});

test("обмен кода требует HMAC-подпись, свежую метку времени и секрет", async () => {
  const model = await source("../src/routes/mentor/model.ts");
  assert.match(model, /verifyBridgeSignature/);
  assert.match(model, /BRIDGE_CLOCK_SKEW_SECONDS/);
  assert.match(model, /if \(!secret\) return \{ ok: false, reason: "unconfigured" \}/, "без BRIDGE_SECRET бридж закрыт");
  assert.match(model, /constantTimeEqual/, "сравнение подписи без раннего выхода");
  assert.match(model, /crypto\.subtle\.sign\(\s*"HMAC"/);

  const index = await source("../src/routes/mentor/index.ts");
  assert.match(index, /secret: c\.env\.BRIDGE_SECRET/);
  assert.match(index, /BRIDGE_SIGNATURE_HEADER/);
  assert.match(index, /BRIDGE_TIMESTAMP_HEADER/);
  const exchange = index.slice(index.indexOf('mentor.post("/sso/exchange"'));
  assert.match(exchange, /if \(!verification\.ok\)/, "неподписанный обмен не доходит до хранилища кода");
  assert.ok(
    exchange.indexOf("verifyBridgeSignature") < exchange.indexOf("consumeMentorCode"),
    "подпись проверяется до расходования кода",
  );
});

test("код не уходит в URL: PdfMentor получает его POST-формой", async () => {
  // Отправка формы живёт в общем модуле: им пользуются /mentor и /mentor/lecture.
  const form = await source("../../../src/lib/mentor-sso.ts");
  assert.match(form, /form\.method = "POST"/);
  assert.match(form, /input\.name = name/);
  assert.doesNotMatch(form, /medbiohim_sso/, "код не передаётся query-параметром");
  assert.doesNotMatch(form, /localhost:3002/, "адрес PdfMentor не захардкожен");

  const page = await source("../../../src/app/mentor/page.tsx");
  assert.match(page, /from "@\/lib\/mentor-sso"/, "страница использует общий SSO-модуль");
  assert.doesNotMatch(page, /localhost:3002/, "адрес PdfMentor не захардкожен");

  const index = await source("../src/routes/mentor/index.ts");
  assert.match(index, /form_action: `\$\{mentorUrl\}\/login\/sso`/);
  assert.match(index, /normalizeMentorUrl\(c\.env\.PDFMENTOR_URL\)/, "адрес берётся только из env");
});

test("адрес PdfMentor нормализуется: https или loopback, без учётных данных", async () => {
  const model = await source("../src/routes/mentor/model.ts");
  assert.match(model, /url\.protocol !== "https:"/);
  assert.match(model, /url\.hostname === "localhost"/);
  assert.match(model, /if \(url\.username \|\| url\.password\) return null/);
});

test("обмен и выдача кода ограничены rate-limit, код не пишется в лог", async () => {
  const index = await source("../src/routes/mentor/index.ts");
  assert.match(index, /rateLimit\(c\.env, `mentor:sso:\$\{user\.id\}`/);
  assert.match(index, /rateLimit\(c\.env, `mentor:exchange:\$\{clientIp\(c\)\}`/);
  assert.doesNotMatch(index, /console\.\w+\([^)]*\bcode\b/, "одноразовый код не должен попадать в логи");
});

test("маршрут /mentor смонтирован и остаётся тонкой оболочкой", async () => {
  const index = await source("../src/index.ts");
  assert.match(index, /import mentor from "\.\/routes\/mentor"/);
  assert.match(index, /v1\.route\("\/mentor", mentor\)/);

  const barrel = await source("../src/routes/mentor.ts");
  assert.match(barrel, /export \{ default \} from "\.\/mentor\/index"/);
});
