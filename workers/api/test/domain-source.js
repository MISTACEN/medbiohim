// Роут разнесён на домен src/routes/<name>/: тест читает баррель и все файлы
// домена (рекурсивно — домены бывают вложенными), иначе проверки по тексту
// «проходят» по опустевшему баррелю.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = new URL("../", import.meta.url);

function collect(dir, parts) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = dir + "/" + entry.name;
    if (entry.isDirectory()) collect(full, parts);
    else if (entry.name.endsWith(".ts")) parts.push(readFileSync(full, "utf8"));
  }
}

export function readDomain(relative) {
  const file = fileURLToPath(new URL(relative, BASE));
  const parts = [readFileSync(file, "utf8")];
  const dir = file.replace(/\.ts$/, "");
  if (existsSync(dir)) collect(dir, parts);
  return parts.join("\n");
}
