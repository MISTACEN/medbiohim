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

test("srs: конкретную ошибку можно отправить в повторение точечно", async () => {
  const cards = await read("workers/api/src/routes/srs/02-cards.ts");
  assert.ok(cards.includes("const requestedKeys:"), "маршрут принимает список ключей препаратов");
  assert.ok(cards.includes("requestedKeys.includes(String(row.key"), "ключи фильтруют методички");
  assert.ok(cards.includes("limitRows"), "точечное добавление не режется пачкой из десяти");

  const api = await read("src/lib/features-api.ts");
  assert.ok(api.includes("srsAddTrainerCard"), "у клиента есть точечное добавление");

  const runner = await read("src/components/trainers/use-diagnosticum-actions.ts");
  assert.ok(runner.includes("srsAddTrainerCard(guideKey)"), "разбор ошибки отправляет препарат в повторение");
  // Кнопка живёт в панели разбора: интерфейс разнесён по компонентам ради
  // бюджета 600 строк, поэтому проверяем владельца разметки, а не родителя.
  const resultPanel = await read("src/components/trainers/DiagnosticumResultPanel.tsx");
  assert.ok(resultPanel.includes("!result.correct"), "кнопка только для ошибки, а не для верного ответа");

  // Атлас/тренировка пользуются той же панелью методички — кнопка нужна там.
  const panel = await read("src/components/trainers/PreparationGuidePanel.tsx");
  assert.ok(panel.includes("srsAddTrainerCard(guideKey)"), "из методички препарат уходит в повторение");
  assert.ok(panel.includes('repeat === "exists"'), "повторное добавление не выдаётся за новое");
});
