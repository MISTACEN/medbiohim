#!/usr/bin/env node
/**
 * Регенерирует workers/api/src/generated/migrations.ts из supabase/migrations.
 * Запуск из корня репозитория: node tools/generate-migrations-ts.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const files = {
  TEACHER_ASSIGNMENTS_SQL: "supabase/migrations/20261105090000_teacher_assignments.sql",
  MODULE_ACCESS_SQL: "supabase/migrations/20261106100000_module_access.sql",
  TEST_ASSIGNMENTS_SQL: "supabase/migrations/20261107090000_test_assignments.sql",
  TEACHER_CATALOG_SQL: "supabase/migrations/20261106120000_teacher_catalog.sql",
};
const escape = (s) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

let out = "/**\n * СГЕНЕРИРОВАНО: tools/generate-migrations-ts.mjs — не править вручную.\n";
out += " * Источник: supabase/migrations. Регенерировать после изменения миграций:\n";
out += " * node tools/generate-migrations-ts.mjs\n */\n\n";
for (const [name, rel] of Object.entries(files)) {
  const sql = readFileSync(resolve(root, rel), "utf8");
  out += `export const ${name} = \`${escape(sql)}\`;\n\n`;
}
const target = resolve(root, "workers/api/src/generated/migrations.ts");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, out);
console.log("generated:", target);
