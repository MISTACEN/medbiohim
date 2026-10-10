const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCommand, getCommandResponse } = require("../lib/commands");

test("parses supported slash commands case-insensitively", () => {
  assert.equal(parseCommand("/START"), "start");
  assert.equal(parseCommand("/schedule"), "schedule");
  assert.equal(parseCommand("/help some text"), "help");
});

test("ignores ordinary text and commands addressed to another or unknown bot", () => {
  const previous = process.env.TELEGRAM_BOT_USERNAME;
  delete process.env.TELEGRAM_BOT_USERNAME;
  assert.equal(parseCommand("hello"), null);
  assert.equal(parseCommand("/start@some_bot"), null);
  process.env.TELEGRAM_BOT_USERNAME = "medbiohim_bot";
  assert.equal(parseCommand("/start@another_bot"), null);
  assert.equal(parseCommand("/start@MEDBIOHIM_BOT"), "start");
  if (previous === undefined) delete process.env.TELEGRAM_BOT_USERNAME;
  else process.env.TELEGRAM_BOT_USERNAME = previous;
});

test("creates canonical same-origin-independent platform links", () => {
  assert.equal(getCommandResponse("/schedule").url, "https://medbiohim.vercel.app/schedule");
  assert.equal(getCommandResponse("/tests").url, "https://medbiohim.vercel.app/tests");
  assert.equal(getCommandResponse("/subjects").url, "https://medbiohim.vercel.app/subjects");
});

test("unknown commands return help guidance without private data", () => {
  const result = getCommandResponse("/delete_my_account");
  assert.match(result.text, /\/help/);
  assert.equal(result.url, null);
});

test("privacy response explicitly avoids account-bound data", () => {
  const result = getCommandResponse("/privacy");
  assert.match(result.text, /не связывает Telegram с аккаунтом/);
  assert.equal(result.url, null);
});


test("/start and /app offer the Telegram Web App entry point", () => {
  const start = getCommandResponse("/start");
  const app = getCommandResponse("/app");
  assert.equal(start.webAppUrl, "https://medbiohim.vercel.app/");
  assert.equal(app.webAppUrl, "https://medbiohim.vercel.app/");
  assert.equal(start.url, null);
});
