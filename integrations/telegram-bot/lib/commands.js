const APP_ORIGIN = (process.env.MEDBIOHIM_APP_URL || "https://medbiohim.vercel.app").replace(/\/$/, "");

const COMMANDS = {
  start: {
    text: "Привет! Это бот быстрого доступа к MEDBIOHIM. Сейчас доступны только публичные команды и ссылки; личное расписание и оценки бот не запрашивает.",
  },
  help: {
    text: "Команды MEDBIOHIM:\n/start — приветствие\n/site — открыть платформу\n/schedule — открыть расписание на сайте\n/tests — открыть тесты\n/subjects — открыть предметы и атлас\n/materials — открыть материалы\n/privacy — правила приватности",
  },
  site: { text: "Открыть MEDBIOHIM", path: "/" },
  schedule: { text: "Открыть расписание MEDBIOHIM", path: "/schedule" },
  tests: { text: "Открыть тесты MEDBIOHIM", path: "/tests" },
  subjects: { text: "Открыть предметы и атлас MEDBIOHIM", path: "/subjects" },
  materials: { text: "Открыть материалы MEDBIOHIM", path: "/materials" },
  privacy: {
    text: "Бот пока не связывает Telegram с аккаунтом MEDBIOHIM и не получает личные данные. Не отправляйте сюда пароли, коды входа, токены или медицинские/учебные персональные данные. Приватные функции появятся только после отдельной безопасной привязки аккаунта.",
  },
};

function parseCommand(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const first = trimmed.split(/\s+/, 1)[0];
  const withoutSlash = first.slice(1);
  const [name, botName] = withoutSlash.split("@", 2);
  const configuredBotName = (process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "").toLowerCase();
  if (botName && configuredBotName && botName.toLowerCase() !== configuredBotName) {
    return null;
  }
  return name.toLowerCase();
}

function getCommandResponse(text) {
  const command = parseCommand(text);
  if (!command) return null;
  const result = COMMANDS[command] || {
    text: "Не знаю эту команду. Напишите /help, чтобы увидеть список доступных команд.",
  };
  return {
    text: result.text,
    url: result.path ? new URL(result.path, APP_ORIGIN).toString() : null,
  };
}

module.exports = { parseCommand, getCommandResponse };
