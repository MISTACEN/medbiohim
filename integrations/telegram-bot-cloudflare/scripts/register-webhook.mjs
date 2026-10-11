import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

const WEBHOOK_URL = "https://medbiohim-telegram.ryazansevegor.workers.dev/api/webhook";
const HEALTH_URL = "https://medbiohim-telegram.ryazansevegor.workers.dev/health";

function readSecret(label) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
      reject(new Error("Run this script in an interactive Windows Terminal / PowerShell window."));
      return;
    }
    stdout.write(label);
    let value = "";
    const onData = (chunk) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Cancelled."));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (char >= " " && char !== "\u007f") value += char;
      }
    };
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function telegram(token, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    const description = typeof result?.description === "string" ? result.description : `HTTP ${response.status}`;
    throw new Error(`Telegram ${method} failed: ${description}`);
  }
  return result.result;
}

const rl = createInterface({ input: stdin, output: stdout });
try {
  stdout.write("MEDBIOHIM — безопасная настройка Telegram webhook\n");
  stdout.write("Это переключит ОСНОВНОГО бота на Cloudflare. Старый webhook перестанет получать обновления.\n");
  stdout.write(`Worker: ${WEBHOOK_URL}\n\n`);
  const confirmation = (await rl.question("Чтобы продолжить, напишите SWITCH-MAIN: ")).trim();
  if (confirmation !== "SWITCH-MAIN") {
    stdout.write("Отменено; webhook не менялся.\n");
    process.exitCode = 1;
  } else {
    rl.close();
    const token = await readSecret("Вставьте актуальный TELEGRAM_BOT_TOKEN (ввод скрыт): ");
    const secret = await readSecret("Вставьте TELEGRAM_WEBHOOK_SECRET (ввод скрыт): ");
    if (!token.trim() || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
      throw new Error("Токен пустой или secret не соответствует требованиям Telegram (A-Z, a-z, 0-9, _ и -, до 256 символов).");
    }

    const healthResponse = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(10000) });
    const health = await healthResponse.json().catch(() => null);
    if (!healthResponse.ok || health?.ok !== true || health?.configured !== true) {
      throw new Error("Worker health check не пройден. Webhook не менялся.");
    }
    stdout.write("Worker доступен; обязательные секреты на стороне Worker настроены.\n");

    const me = await telegram(token, "getMe");
    stdout.write(`Токен проверен для бота @${me.username || "(username не указан)"}; значение токена не выводится.\n`);
    const before = await telegram(token, "getWebhookInfo");
    if (before.url && before.url !== WEBHOOK_URL) {
      stdout.write(`Текущий webhook: ${before.url}\n`);
      stdout.write("Вы заранее подтвердили SWITCH-MAIN; сейчас он будет заменён адресом Cloudflare.\n");
    }
    await telegram(token, "setWebhook", {
      url: WEBHOOK_URL,
      secret_token: secret,
      allowed_updates: ["message", "edited_message"],
      drop_pending_updates: false,
    });
    const after = await telegram(token, "getWebhookInfo");
    if (after.url !== WEBHOOK_URL) throw new Error("Telegram не подтвердил ожидаемый webhook URL.");
    stdout.write("\nУСПЕХ: Telegram подтвердил новый webhook.\n");
    stdout.write(`URL: ${after.url}\nОжидающих обновлений: ${after.pending_update_count ?? "не сообщено"}\n`);
    if (after.last_error_message) stdout.write(`Последняя ошибка доставки: ${after.last_error_message}\n`);
    stdout.write("Теперь откройте чат с этим ботом и отправьте /start, затем /help.\n");
  }
} catch (error) {
  stdout.write(`\nОШИБКА: ${error instanceof Error ? error.message : "неизвестная ошибка"}\n`);
  process.exitCode = 1;
} finally {
  rl.close();
}
