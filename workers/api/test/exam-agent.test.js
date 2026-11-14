import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AGENT_PLAN_KIND,
  agentDay,
  isValidEventDate,
  pickAgentQuestions,
} from "../src/lib/exam-agent.ts";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

const bank = [
  { id: "q1", text: "Что такое гемолиз?", answer: "Разрушение эритроцитов", topic: "Кровь" },
  { id: "q2", text: "Функции тромбоцитов?", answer: "", topic: "Кровь" },
  { id: "q3", text: "  Что такое гемолиз?  ", answer: "дубль", topic: "Кровь" },
  { id: "q4", text: "Этапы гемостаза?", answer: "Сосудисто-тромбоцитарный и коагуляционный", topic: "Гемостаз" },
  { id: "q5", text: "", answer: "пустой вопрос", topic: "Гемостаз" },
];

test("agent picks deterministic, deduplicated questions and skips taken ones", () => {
  const picked = pickAgentQuestions(bank, ["Этапы гемостаза?"], 5);
  assert.deepEqual(
    picked.map((item) => item.text),
    ["Что такое гемолиз?", "Функции тромбоцитов?"],
  );
  // Пустой ответ остаётся null — «ответ готовится», а не выдумка.
  assert.equal(picked[1].answer, null);
  assert.equal(picked[0].topic, "Кровь");
  // Повторный вызов с уже взятыми ничего не добавляет.
  const again = pickAgentQuestions(bank, picked.map((item) => item.text).concat("Этапы гемостаза?"), 5);
  assert.equal(again.length, 0);
});

test("agent respects the per-day quota", () => {
  const many = Array.from({ length: 20 }, (_, index) => ({
    id: `q${index}`,
    text: `Вопрос ${index}`,
    answer: "Ответ",
    topic: "Тема",
  }));
  assert.equal(pickAgentQuestions(many, [], 8).length, 8);
  assert.equal(pickAgentQuestions(many, [], 0).length, 0);
});

test("agent day is the UTC date, tomorrow is one day later", () => {
  const now = new Date("2026-11-14T23:30:00Z");
  assert.equal(agentDay(now), "2026-11-14");
  assert.equal(agentDay(now, 1), "2026-11-15");
  // Переход через месяц не ломается.
  assert.equal(agentDay(new Date("2026-11-30T10:00:00Z"), 1), "2026-12-01");
});

test("exam date must be today..+180 days", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  assert.equal(isValidEventDate("2026-11-14", now), true);
  assert.equal(isValidEventDate("2026-11-13", now), false);
  assert.equal(isValidEventDate("2027-05-13", now), true); // 180 дней
  assert.equal(isValidEventDate("2027-05-14", now), false); // 181
  assert.equal(isValidEventDate("14.11.2026", now), false);
});

test("agent routes are owner-scoped and write only through the service client", async () => {
  const route = await source("../src/routes/study-prep.ts");
  assert.match(route, /studyPrep\.post\("\/agent", requireAuth/);
  assert.match(route, /studyPrep\.get\("\/agent", requireAuth/);
  assert.match(route, /studyPrep\.patch\("\/agent\/items\/:id", requireAuth/);
  // Отметка только своих пунктов и только done.
  assert.match(route, /\.update\(\{ done \}\)[\s\S]{0,160}\.eq\("user_id", user\.id\)/);
  assert.match(route, /const done = body\?\.done !== false;/);
  // Создание разборов — служебным клиентом, не пользовательским.
  assert.match(route, /createServiceClient\(c\.env\)/);
  // Вид плана объявлен в lib и используется маршрутом, а не дублируется строкой.
  assert.match(route, /AGENT_PLAN_KIND/);
  const lib = await source("../src/lib/exam-agent.ts");
  assert.match(lib, new RegExp(`AGENT_PLAN_KIND = "${AGENT_PLAN_KIND}"`));
});

test("migration locks writes and nightly job is idempotent", async () => {
  const sql = await source("../../../database/migrations/20261114_study_agent_items.sql");
  assert.match(sql, /grant update \(done\) on public\.study_agent_items to authenticated/i);
  assert.doesNotMatch(sql, /for insert to authenticated/);
  assert.match(sql, /study_agent_items_plan_day_question_idx/);

  const job = await source("../src/jobs/exam-agent.ts");
  assert.match(job, /if \(\(count \|\| 0\) > 0\) continue;/);
  assert.match(job, /skipped: "no_service_role"/);
  const index = await source("../src/index.ts");
  assert.match(index, /runExamAgentNightly/);
});
