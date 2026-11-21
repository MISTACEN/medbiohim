import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Одноразовый bootstrap-маршрут миграций удалён по своему же жизненному
 * циклу (см. шапку бывшего routes/bootstrap-migrate.ts): SQL-фильтр
 * «SELECT/WITH only» обходился data-modifying CTE через service-role.
 * Тест не даёт маршруту вернуться и ограничивает прямое admin_exec_sql
 * единственной легитимной точкой (SQL-консоль админки с allowlist таблиц).
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const WORKER = path.join(ROOT, "workers", "api", "src");

test("bootstrap-маршрут миграций отсутствует и не монтируется", async () => {
  await assert.rejects(() => access(path.join(WORKER, "routes", "bootstrap-migrate.ts")), {
    code: "ENOENT",
  });
  const index = await readFile(path.join(WORKER, "index.ts"), "utf8");
  assert.ok(!/routes\/bootstrap-migrate/.test(index), "импорт bootstrap-маршрута удалён");
  assert.ok(!/route\("\/bootstrap"/.test(index), "маунт /bootstrap удалён");
  assert.ok(!index.includes("MIGRATION_BOOTSTRAP_SECRET"), "секрет bootstrap не упоминается в коде");
});

test("admin_exec_sql доступен только из SQL-консоли админки", async () => {
  const routesDir = path.join(WORKER, "routes");
  const offenders = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (full.endsWith(".ts")) {
        const text = await readFile(full, "utf8");
        if (text.includes("admin_exec_sql")) offenders.push(path.relative(WORKER, full));
      }
    }
  };
  await walk(routesDir);
  assert.deepEqual(
    offenders.map((file) => file.split(/[\\/]/).pop()),
    ["admin-database.ts"],
    "admin_exec_sql живёт только в SQL-консоли админки",
  );
});
