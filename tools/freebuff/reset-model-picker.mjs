#!/usr/bin/env node
/**
 * Сброс локального состояния выбора модели в Freebuff Desktop.
 *
 * Зачем: в %APPDATA%\Freebuff нашлись два подозрительных состояния —
 *  1) orchestrator-bundles/state.json: {"current":null,"bad":[3 версии]} —
 *     приложение трижды не смогло поставить бандл оркестратора и осталось без
 *     «текущего» бандла;
 *  2) в localStorage hosted-приложения лежит выбор модели
 *     workspace:harness-picks:v1 = {"model":"m-8db1ccbba6"}, которого нет
 *     в модели-каталоге установленной сборки (там m-61c26317cc и m-79293c5b7d).
 *
 * Скрипт ничего не удаляет без копии: сначала делает .bak рядом, потом пишет
 * чистое состояние бандлов и (по флагу --clear-ui-storage) убирает localStorage
 * hosted-приложения, чтобы выбор модели пересоздался с сервера.
 *
 * Запускать при ЗАКРЫТОМ Freebuff: иначе Chromium перезапишет изменения.
 *
 *   node tools/freebuff/reset-model-picker.mjs --dry-run
 *   node tools/freebuff/reset-model-picker.mjs
 *   node tools/freebuff/reset-model-picker.mjs --clear-ui-storage
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const APPDATA = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
const ROOT = path.join(APPDATA, "Freebuff");
const BUNDLES = path.join(ROOT, "orchestrator-bundles");
const PARTITIONS = path.join(ROOT, "Partitions");

const dryRun = process.argv.includes("--dry-run");
const clearUi = process.argv.includes("--clear-ui-storage");

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function isRunning() {
  try {
    const out = execFileSync("tasklist", ["/FI", "IMAGENAME eq Freebuff.exe"], { encoding: "utf8" });
    return /Freebuff\.exe/i.test(out);
  } catch {
    return false;
  }
}

if (!fs.existsSync(ROOT)) {
  console.error(`Не найден каталог Freebuff: ${ROOT}`);
  process.exit(2);
}

if (isRunning() && !dryRun) {
  console.error("Freebuff запущен. Закройте приложение (иначе localStorage вернётся из памяти) и запустите снова.");
  process.exit(3);
}

const backupSuffix = `.bak-${stamp()}`;
const plan = [];

const statePath = path.join(BUNDLES, "state.json");
if (fs.existsSync(statePath)) plan.push({ kind: "bundles", from: statePath });

const hosted = fs.existsSync(PARTITIONS)
  ? fs.readdirSync(PARTITIONS).filter((name) => name.startsWith("freebuff-hosted-"))
  : [];
for (const partition of hosted) {
  const storage = path.join(PARTITIONS, partition, "Local Storage");
  if (fs.existsSync(storage)) plan.push({ kind: "ui-storage", from: storage, partition });
}

console.log(`Профиль: ${ROOT}`);
console.log(`Freebuff запущен: ${isRunning() ? "да" : "нет"}`);
for (const item of plan) {
  console.log(item.kind === "bundles" ? `  бандлы: ${item.from}` : `  localStorage: ${item.partition}`);
}

if (dryRun) {
  console.log("\n--dry-run: ничего не изменено.");
  process.exit(0);
}

// 1. Состояние бандлов: чистим список «плохих», оставляем current пустым,
//    чтобы приложение заново выбрало/скачало здоровый бандл.
if (fs.existsSync(statePath)) {
  fs.copyFileSync(statePath, `${statePath}${backupSuffix}`);
  fs.writeFileSync(statePath, `${JSON.stringify({ current: null, bad: [] }, null, 0)}\n`);
  console.log(`бандлы: ${path.basename(statePath)}${backupSuffix} (бэкап), список bad очищен`);
}

// 2. localStorage hosted-приложения: убираем целиком в бэкап, Chromium создаст новый.
if (clearUi) {
  for (const item of plan.filter((entry) => entry.kind === "ui-storage")) {
    const backup = `${item.from}${backupSuffix}`;
    fs.renameSync(item.from, backup);
    console.log(`localStorage: ${item.partition} → ${path.basename(backup)}`);
  }
} else {
  console.log("localStorage не тронут (добавьте --clear-ui-storage, чтобы сбросить выбор модели)");
}

console.log("\nГотово. Запустите Freebuff и попробуйте переключить модель.");
console.log(`Откат: верните файлы с суффиксом ${backupSuffix} на прежние места.`);
