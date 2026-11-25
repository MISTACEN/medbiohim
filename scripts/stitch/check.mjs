/**
 * Проверка подключения к Stitch MCP: инициализация, список инструментов
 * и реальный вызов list_projects. Ничего не создаёт и не меняет.
 */
import { accessToken, isGcloudInstalled, mcp, textOf } from "./lib.mjs";

if (!isGcloudInstalled()) {
  console.error("gcloud не установлен: npm run stitch:install");
  process.exit(1);
}

let token;
try {
  token = accessToken();
} catch (cause) {
  console.error(String(cause.message || cause));
  process.exit(1);
}

try {
  const init = await mcp("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "medbiohim", version: "0.1" },
  }, { token });
  console.log(`Сервер: ${init?.serverInfo?.name || "Stitch"} ${init?.serverInfo?.version || ""}`.trim());

  const tools = await mcp("tools/list", {}, { token });
  const names = (tools?.tools || []).map((tool) => tool.name);
  console.log(`Инструментов: ${names.length}`);
  console.log(names.join(", "));

  const projects = await mcp("tools/call", {
    name: "list_projects",
    arguments: { filter: "owned" },
  }, { token });
  if (projects?.isError) {
    console.error(`Stitch ответил ошибкой:\n${textOf(projects)}`);
    process.exit(2);
  }
  console.log(`Доступ к проектам есть:\n${textOf(projects).slice(0, 600)}`);
} catch (cause) {
  console.error(String(cause.message || cause));
  process.exit(1);
}
