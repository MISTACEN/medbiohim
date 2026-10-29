// SA5 (PRODUCT-AUDIT-PLAN-2026-10-27, п. 5.3): «пустышка хуже отсутствия».
// В настройках были чекбоксы notify_homework / notify_lectures / notify_email /
// media_prefer_ru, которые только писались в preferences: ни в src, ни в workers
// не было потребителя, то есть переключатели врали пользователю.
// Тест фиксирует: переключателей-обманок нет, вместо них — честное состояние,
// а значения в хранилище остаются совместимыми (их мог сохранить старый клиент).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relative) {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

test("§SA5 настройки не показывают переключатели уведомлений без движка доставки", () => {
  const page = read("../src/app/settings/page.tsx");

  for (const key of ["notify_homework", "notify_lectures", "notify_email", "media_prefer_ru"]) {
    assert.equal(page.includes(`"${key}"`), false, `чекбокс-пустышка ${key} не должен остаться в UI`);
  }
  assert.equal(/togglePref/.test(page), false, "хелпер пустышки удалён вместе с чекбоксами");

  // Честное состояние объясняет, почему настроек нет.
  assert.match(page, /Пока уведомления не отправляются/);
  assert.match(page, /движок доставки/);
  assert.match(page, /они бы ни на что не влияли/);
});

test("§SA5 реальные настройки не пострадали", () => {
  const page = read("../src/app/settings/page.tsx");
  // Формат тестов и тема остаются рабочими переключателями.
  assert.match(page, /saveAccountPreferences\(\{ trainer_layout: id \}\)/);
  assert.match(page, /useTheme\(\)/);
  // Язык интерфейса — статичная подпись, без ложного выбора.
  assert.match(page, /Язык интерфейса: русский/);
});

test("§SA5 сервер по-прежнему принимает старые ключи ради совместимости", () => {
  // Worker хранит preferences как JSONB-блоб и ничего не отбрасывает, поэтому
  // старые ключи не ломают сохранение. PHP-слой (легаси) держит их в allowlist —
  // фиксируем, чтобы их не «почистили» и не сломали совместимость.
  const legacy = read("../backend/src/Services/AccountSettingsService.php");
  for (const key of ["notify_homework", "notify_lectures", "notify_email", "media_prefer_ru"]) {
    assert.match(legacy, new RegExp(key), `легаси-allowlist сохраняет ${key}`);
  }
  const cloudflare = read("../integrations/cloudflare-api/src/settings.js");
  assert.match(cloudflare, /notify_homework: true/);
});
