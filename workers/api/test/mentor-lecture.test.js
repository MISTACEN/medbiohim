/**
 * Встроенный режим: страница материала, единый SSO и отсутствие второго
 * просмотрщика документов.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const read = (relative) => readFile(path.join(ROOT, relative), "utf8");
const PAGE = "src/app/mentor/lecture/[materialId]/page.tsx";

test("страница материала ведёт в существующую читалку, а не в новый просмотрщик", async () => {
  await access(path.join(ROOT, PAGE));
  const page = await read(PAGE);
  assert.ok(page.includes("/reader?material="), "документ открывается в читалке MEDBIOHIM");
  assert.ok(!page.includes("<iframe"), "второй просмотрщик не появляется");
  assert.ok(!page.includes("PdfReader"), "страница не дублирует читалку");
});

test("встроенный режим использует общий SSO-модуль", async () => {
  const page = await read(PAGE);
  assert.ok(page.includes('from "@/lib/mentor-sso"'));
  assert.ok(page.includes("requestMentorSso("));
  assert.ok(page.includes("submitCodeToMentor("));

  const mentorPage = await read("src/app/mentor/page.tsx");
  assert.ok(mentorPage.includes('from "@/lib/mentor-sso"'), "страница /mentor переиспользует модуль");
  assert.ok(!mentorPage.includes("form.action = payload.form_action"), "форма больше не дублируется");
});

test("страница не обещает того, чего нет: мост документа ещё не подключён", async () => {
  const page = await read(PAGE);
  assert.ok(page.includes("Document Bridge"));
  assert.ok(page.includes("не умеет открывать"), "честное состояние вместо пустой кнопки");
});

test("до страниц PdfMentor можно дойти из интерфейса", async () => {
  const sidebar = await read("src/components/layout/Sidebar.tsx");
  assert.ok(sidebar.includes('href: "/mentor"'), "пункт PdfMentor есть в навигации");

  const material = await read("src/components/materials/MaterialBody.tsx");
  assert.ok(material.includes("/mentor/lecture/"), "материал ведёт на страницу PdfMentor");
  assert.ok(material.includes("/reader?material="), "читалка остаётся основным путём");
});

test("материал читается по одному id через реестр путей", async () => {
  const endpoints = await read("src/lib/endpoints.ts");
  assert.ok(endpoints.includes('material: (id: string): string => `/materials/${enc(id)}`'));

  const content = await read("src/lib/api/content.ts");
  assert.ok(content.includes("export async function getMaterial("));
  assert.ok(content.includes("endpoints.content.material(id)"));
});
