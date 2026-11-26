import { readFile } from "node:fs/promises";

/**
 * Исходник админ-маршрутов, собранный из доменных файлов.
 *
 * Контрактные тесты проверяют наличие маршрутов и проверок по тексту. После
 * разнесения монолита routes/admin.ts на домены они читают ту же сборку,
 * которую монтирует routes/admin/index.ts — без ослабления проверок.
 */
export const ADMIN_SOURCE_FILES = [
  "shared.ts",
  "overview.ts",
  "questions.ts",
  "tests.ts",
  "lectures.ts",
  "users.ts",
  "telegram.ts",
  "content.ts",
  "files.ts",
  "schedule.ts",
  "announcements.ts",
  "presence.ts",
  "preparation-guides.ts",
  "trainer-cards.ts",
  "index.ts",
];

export async function adminRoutesSource() {
  const parts = await Promise.all(
    ADMIN_SOURCE_FILES.map((file) =>
      readFile(new URL(`../../src/routes/admin/${file}`, import.meta.url), "utf8"),
    ),
  );
  return parts.join("\n");
}
