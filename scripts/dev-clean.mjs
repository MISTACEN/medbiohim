/**
 * `npm run dev:clean` — холодный старт dev-сервера.
 *
 * Next dev на этом проекте периодически отдаёт старые модули после правок
 * (HMR не подхватывает изменённый компонент, и страница продолжает работать
 * прошлой сборкой). Чистка `.next` лечит это надёжнее перезапуска: сервер
 * компилирует страницу заново.
 *
 * Аргументы передаются дальше: `npm run dev:clean -- -p 56787`.
 */
import { rmSync } from "node:fs";
import { spawn } from "node:child_process";

rmSync(".next", { recursive: true, force: true });
console.log("[dev:clean] кеш .next удалён — запускаю next dev");

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(command, ["next", "dev", ...process.argv.slice(2)], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (error) => {
  console.error("[dev:clean] не удалось запустить next dev:", error.message);
  process.exit(1);
});
