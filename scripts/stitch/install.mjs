/**
 * Локальная установка Google Cloud CLI без прав администратора.
 *
 * Скачивает официальный zip в `.stitch/cache` и распаковывает в
 * `.stitch/gcloud`. Ничего не прописывает в PATH и не трогает системные
 * настройки: всё живёт внутри проекта и не коммитится.
 */
import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  CACHE_DIR,
  DOWNLOAD_URL,
  ROOT,
  gcloudPath,
  isGcloudInstalled,
  runGcloud,
} from "./lib.mjs";

const zipPath = `${CACHE_DIR}/gcloud.zip`;
const destDir = `${ROOT}/.stitch/gcloud`;

async function download() {
  mkdirSync(CACHE_DIR, { recursive: true });
  console.log("Скачиваю Google Cloud CLI (~106 МБ)…");
  const response = await fetch(DOWNLOAD_URL);
  if (!response.ok || !response.body) {
    throw new Error(`Не удалось скачать gcloud: HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(zipPath));
}

function extract() {
  if (process.platform === "win32") {
    // 7-Zip распаковывает 34 тысячи файлов за секунды; Expand-Archive на таком
    // архиве может тянуться минутами и молча оставить SDK неполным.
    const sevenZip = "C:\\Program Files\\7-Zip\\7z.exe";
    if (existsSync(sevenZip)) {
      const result = spawnSync(sevenZip, ["x", zipPath, `-o${destDir}`, "-y"], {
        stdio: "inherit",
        windowsHide: true,
      });
      // Код 1 — только предупреждения (симлинки в platform/gsutil), это нормально.
      if (result.status !== 0 && result.status !== 1) {
        throw new Error(`7z завершился с кодом ${result.status}.`);
      }
      return;
    }
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`,
      ],
      { stdio: "inherit", windowsHide: true },
    );
    if (result.status !== 0) throw new Error("Expand-Archive завершился с ошибкой.");
    return;
  }
  const result = spawnSync("unzip", ["-oq", zipPath, "-d", destDir], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("unzip завершился с ошибкой.");
}

if (isGcloudInstalled()) {
  const { stdout } = runGcloud(["--version"]);
  console.log(`gcloud уже установлен:\n${stdout.split("\n")[0]}`);
  process.exit(0);
}

await download();
extract();
if (existsSync(zipPath)) rmSync(zipPath, { force: true });

if (!existsSync(gcloudPath())) {
  throw new Error(`Не нашёл ${gcloudPath()} после распаковки.`);
}
const { stdout, stderr } = runGcloud(["--version"]);
console.log(stdout.split("\n")[0] || stderr);
console.log("Готово. Дальше: npm run stitch:login");
