/**
 * SRS микропрепаратов: карточки из методичек, без смешивания с вопросами.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const read = (relative) => readFile(path.join(ROOT, relative), "utf8");

test("srs: микропрепараты добавляются отдельным источником trainer_card", async () => {
  const cards = await read("workers/api/src/routes/srs/02-cards.ts");
  assert.ok(cards.includes('srs.post("/trainer", requireAuth'), "есть маршрут добавления препаратов");
  assert.ok(cards.includes('source_type: "trainer_card"'), "источник помечен trainer_card");
  assert.ok(cards.includes("source_key: key"), "ключ гида хранится в source_key");
  assert.ok(cards.includes("covered.has(key)"), "повторный вызов не создаёт дублей");

  const shared = await read("workers/api/src/routes/srs/shared.ts");
  assert.ok(shared.includes('row.source_type === "trainer_card"'), "клиент видит источник trainer");

  const migration = await read("database/migrations/20261126_srs_trainer_cards.sql");
  assert.ok(migration.includes("add column if not exists source_key text"));
  assert.ok(migration.includes("'trainer_card'"), "ограничение разрешает trainer_card");
  assert.ok(migration.includes("srs_cards_user_trainer_uidx"), "есть уникальный индекс по ключу гида");

  const client = await read("src/components/cards/SrsReview.tsx");
  assert.ok(client.includes("+10 микропрепаратов"), "в колоде есть кнопка добавления препаратов");
});
