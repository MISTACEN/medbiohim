// AI-тьютор разнесён по домену src/routes/ai/: тесты проверяют текст всех
// файлов сразу, иначе проверка «все точки вызова пишут журнал» видит пустоту.
// Обход рекурсивный: часть хелперов живёт в ai/helpers/.
import { readdir, readFile } from "node:fs/promises";

const DIR = new URL("../src/routes/ai/", import.meta.url);
const BARREL = new URL("../src/routes/ai.ts", import.meta.url);

async function readTree(dir) {
  const parts = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const url = new URL(entry.name, dir);
    if (entry.isDirectory()) parts.push(...(await readTree(new URL(`${entry.name}/`, dir))));
    else if (entry.name.endsWith(".ts")) parts.push(await readFile(url, "utf8"));
  }
  return parts;
}

export async function readAiDomain() {
  return [await readFile(BARREL, "utf8"), ...(await readTree(DIR))].join("\n");
}
