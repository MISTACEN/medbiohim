import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");
const workshopLib = await import(new URL("../src/lib/workshop.ts", import.meta.url).href);

test("Workshop: десять фото собираются в одну фотолекцию", () => {
  const files = Array.from({ length: 10 }, (_, index) => ({ name: `${index + 1}.jpg`, mime: "image/jpeg" }));
  assert.equal(workshopLib.detectKind(files, false), "photo_lecture");
  assert.equal(workshopLib.detectKind([{ name: "lecture.pdf", mime: "application/pdf" }], false), "pdf");
  assert.equal(workshopLib.detectKind([{ name: "questions.txt", mime: "text/plain" }], true), "test_questions");
  assert.equal(workshopLib.detectKind([{ name: "notes.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }], false), "other");
});

test("Workshop: PDF/нумерованный текст делится на отдельные вопросы", () => {
  const text = "1. Как называется?\n2) Где находится?\nВопрос 3: Что вырабатывает?\n\n4. Итог?";
  const questions = workshopLib.splitQuestions(text);
  assert.equal(questions.length, 4);
  assert.equal(questions[0], "Как называется?");
  assert.equal(questions[2], "Что вырабатывает?");
  // Без нумерации режим «абзацы» сохраняет вопросы, но не режет по строкам.
  assert.deepEqual(workshopLib.splitQuestions("Первый вопрос\n\nВторой вопрос"), ["Первый вопрос", "Второй вопрос"]);
});

test("Workshop: предупреждение о чужих персональных данных", () => {
  const flags = workshopLib.personalDataFlags({ title: "Журнал группы 12", fileNames: ["ведомость.jpg"] });
  assert.ok(flags.length >= 1);
  assert.equal(workshopLib.personalDataFlags({ title: "Конспект по гистологии", text: "Кровь и лимфа" }).length, 0);
});

test("Workshop: теги нормализуются, файлы сортируются натурально", () => {
  assert.deepEqual(workshopLib.normalizeTags(["#Гистология", "конспект", "конспект", "плохой тег!"]), ["гистология", "конспект"]);
  const sorted = workshopLib.sortFilesForBatch([{ original_name: "10.jpg" }, { original_name: "2.jpg" }, { original_name: "1.jpg" }]);
  assert.deepEqual(sorted.map((file) => file.original_name), ["1.jpg", "2.jpg", "10.jpg"]);
});

test("Workshop routes: режим, версии, авторский контроль и модерация", async () => {
  const routes = await source("../src/routes/workshop.ts");
  for (const contract of [
    'workshop.get("/items"',
    'workshop.post("/items"',
    'workshop.patch("/items/:id"',
    'workshop.delete("/items/:id"',
    'workshop.post("/items/:id/visibility"',
    'workshop.get("/items/:id/versions"',
    'workshop.post("/items/:id/versions/:versionNo/restore"',
    'workshop.post("/items/:id/report"',
    'workshop.patch("/settings"',
    'workshop.get("/moderation/queue"',
    'workshop.post("/moderation/items/:id"',
  ]) assert.ok(routes.includes(contract), "missing route: " + contract);
  assert.match(routes, /moderation_mode === "manual"/);
  assert.match(routes, /PERSONAL_DATA_CONFIRMATION_REQUIRED/);
  assert.match(routes, /personal_data_confirmed/);
  assert.match(routes, /workshop_item_versions/);
  assert.match(routes, /requireAuth/);
});

test("Workshop migration: таблицы, RLS и 24-часовой откат в governance", async () => {
  const migration = await source("../../../database/migrations/20261031_workshop_and_governance.sql");
  for (const table of [
    "public.workshop_settings",
    "public.workshop_items",
    "public.workshop_item_files",
    "public.workshop_item_questions",
    "public.workshop_item_versions",
    "public.workshop_reports",
    "public.group_join_requests",
    "public.staff_requests",
    "public.moderation_actions",
    "public.notifications",
  ]) assert.match(migration, new RegExp("create table if not exists " + table.replace(/\./g, "\\.")));
  assert.match(migration, /moderation_mode in \('open', 'manual'\)/);
  assert.match(migration, /interval '24 hours'/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /private\.has_app_role/);
});
