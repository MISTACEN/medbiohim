/**
 * Один вход в Google — дальше токен обновляется автоматически.
 *
 * `gcloud auth application-default login` открывает браузер. Выбираете тот же
 * аккаунт, под которым заходите в Stitch, и разрешаете доступ. Креды лежат в
 * `.stitch/adc` (gitignored), сам токен нигде не печатается.
 *
 * Если у аккаунта есть проект Google Cloud, можно сразу включить Stitch API:
 *   STITCH_GCP_PROJECT=my-project npm run stitch:login
 */
import { accessToken, isGcloudInstalled, runGcloud } from "./lib.mjs";

if (!isGcloudInstalled()) {
  console.error("Сначала установите gcloud: npm run stitch:install");
  process.exit(1);
}

console.log("Открываю браузер для входа в Google…");
const login = runGcloud(["auth", "application-default", "login"], {
  capture: false,
  timeout: 0, // вход ждёт, пока вы подтвердите в браузере
});
if (login.status !== 0) {
  console.error("Вход не завершён. Повторите: npm run stitch:login");
  process.exit(login.status);
}

try {
  accessToken();
} catch (cause) {
  console.error(String(cause.message || cause));
  process.exit(1);
}

const account = runGcloud(["auth", "list", "--filter=status:ACTIVE", "--format=value(account)"]);
console.log(account.stdout ? `Вошли как ${account.stdout}` : "Вход выполнен.");

const project = String(process.env.STITCH_GCP_PROJECT || "").trim();
if (project) {
  console.log(`Включаю Stitch API в проекте ${project}…`);
  const enable = runGcloud([
    "beta",
    "services",
    "mcp",
    "enable",
    "stitch.googleapis.com",
    `--project=${project}`,
  ]);
  console.log(enable.status === 0 ? "Stitch API включён." : enable.stderr);
}

console.log("Проверка: npm run stitch:check");
