/**
 * Заливает .stitch/DESIGN.md в проект Stitch.
 *
 *   node scripts/stitch/upload-design.mjs [projectId]
 *
 * projectId по умолчанию — проект MEDBIOHIM из `.stitch/project.json`;
 * если файла нет, берётся единственный проект аккаунта.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ROOT, mcp, textOf } from "./lib.mjs";

const designPath = resolve(ROOT, ".stitch/DESIGN.md");

function savedProjectId() {
  try {
    const raw = JSON.parse(readFileSync(resolve(ROOT, ".stitch/project.json"), "utf8"));
    return String(raw.projectId || "").replace(/^projects\//, "");
  } catch {
    return "";
  }
}

async function resolveProjectId() {
  const fromArg = process.argv[2];
  if (fromArg) return String(fromArg).replace(/^projects\//, "");
  const saved = savedProjectId();
  if (saved) return saved;
  const list = await mcp("tools/call", { name: "list_projects", arguments: { filter: "owned" } });
  const projects = JSON.parse(textOf(list) || "{}").projects || [];
  if (projects.length !== 1) {
    throw new Error("Укажите projectId: node scripts/stitch/upload-design.mjs <projectId>");
  }
  return String(projects[0].name).replace(/^projects\//, "");
}

const projectId = await resolveProjectId();
const designMdBase64 = readFileSync(designPath).toString("base64");

const result = await mcp("tools/call", {
  name: "upload_design_md",
  arguments: { projectId, designMdBase64 },
});
const text = textOf(result);
if (result?.isError) {
  console.error(text || "Stitch вернул ошибку.");
  process.exit(2);
}
console.log(`DESIGN.md загружен в проект ${projectId}.`);
if (text) console.log(text);
