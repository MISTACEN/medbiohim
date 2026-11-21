import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/**
 * Функциональные кейсы guards живут в src/lib/__tests__/guards.test.ts (vitest).
 * Здесь только cross-слойный инвариант: guards обязаны быть включены в
 * payload-границы api.ts — единственное место приёма внешних данных.
 */

test("guards are wired into api.ts payload boundaries", async () => {
  const api = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");
  assert.match(api, /from "@\/lib\/guards"/, "guards не импортированы в api.ts");
});
