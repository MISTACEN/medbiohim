/**
 * CLI к Stitch MCP без MCP-клиента: работает от имени вошедшего аккаунта.
 *
 *   node scripts/stitch/mcp.mjs tools
 *   node scripts/stitch/mcp.mjs call list_projects '{"filter":"owned"}'
 *   node scripts/stitch/mcp.mjs call create_project '{"title":"MEDBIOHIM"}'
 *
 * Токен берётся у локального gcloud и обновляется сам, поэтому команда
 * работает и через час, и через неделю после входа.
 */
import { accessToken, mcp, textOf } from "./lib.mjs";

const [command, name, rawArgs] = process.argv.slice(2);

function usage() {
  console.error(
    [
      "Использование:",
      "  node scripts/stitch/mcp.mjs tools",
      "  node scripts/stitch/mcp.mjs call <tool> [json]",
    ].join("\n"),
  );
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
  if (command === "tools") {
    const result = await mcp("tools/list", {}, { token });
    for (const tool of result?.tools || []) {
      const firstLine = String(tool.description || "").split("\n")[0];
      console.log(`${tool.name} — ${firstLine}`);
    }
  } else if (command === "call") {
    if (!name) usage();
    const args = rawArgs ? JSON.parse(rawArgs) : {};
    const result = await mcp("tools/call", { name, arguments: args }, { token });
    const text = textOf(result);
    if (result?.isError) {
      console.error(text || "Stitch вернул ошибку.");
      process.exit(2);
    }
    if (text) console.log(text);
    const structured = result?.structuredContent;
    if (structured) console.log(JSON.stringify(structured, null, 2));
  } else {
    usage();
  }
} catch (cause) {
  console.error(String(cause.message || cause));
  process.exit(1);
}
