import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  DEFAULT_ERROR_TEXT,
  describeApiError,
  isTechnicalMessage,
} from "../src/lib/errors.ts";

test("machine text is recognised as technical", () => {
  for (const text of ["HTTP 500", "HTTP 503", "not found", "undefined", "BAD_RESPONSE", "fetch failed"]) {
    assert.equal(isTechnicalMessage(text), true, text);
  }
  assert.equal(isTechnicalMessage(""), true);
});

test("a Russian sentence written for people is not technical", () => {
  for (const text of ["Вещество не найдено", "Нужны права преподавателя.", "Проверьте заполненные поля."]) {
    assert.equal(isTechnicalMessage(text), false, text);
  }
});

test("a human message passes through unchanged", () => {
  assert.equal(describeApiError({ code: "NOT_FOUND", message: "Билет не найден" }), "Билет не найден");
});

test("HTTP status codes never reach the UI", () => {
  const text = describeApiError({ code: "BAD_RESPONSE", message: "HTTP 500" }, 500);
  assert.doesNotMatch(text, /HTTP|500/);
  assert.equal(text, "Сервер вернул неожиданный ответ. Попробуйте ещё раз.");
});

test("known codes get a Russian description with an action", () => {
  assert.match(describeApiError({ code: "NETWORK" }), /интернет/i);
  assert.match(describeApiError({ code: "DB_UNAVAILABLE" }), /позже/i);
  assert.match(describeApiError({ code: "FORBIDDEN" }), /прав/i);
});

test("an unknown code falls back to the HTTP status description", () => {
  assert.equal(describeApiError({ code: "SOMETHING_NEW" }, 503), "Сервис временно недоступен. Попробуйте позже.");
});

test("a completely unknown failure still answers in Russian", () => {
  assert.equal(describeApiError(null), DEFAULT_ERROR_TEXT);
  assert.equal(describeApiError({ code: "WAT" }, 418), DEFAULT_ERROR_TEXT);
});

test("no English failure wording is left in the student-facing dialogs", async () => {
  const files = [
    "../src/lib/api.ts",
    "../src/app/materials/page.tsx",
    "../src/app/register/page.tsx",
    "../src/app/auth/callback/page.tsx",
    "../src/components/chemistry/ChemicalFigure.tsx",
  ];
  for (const file of files) {
    const source = await fs.readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /compound not found|query must contain|resolve failed/, file);
  }
  const materials = await fs.readFile(new URL("../src/app/materials/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(materials, /Supabase/);
  const api = await fs.readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");
  assert.doesNotMatch(api, /HTTP \$\{res\.status\}|Сервер вернул не JSON/);
});
