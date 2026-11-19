// Страницы разнесены по доменам: тест читает саму страницу и те файлы
// components/*, которые она импортирует. Иначе проверки, привязанные к тексту
// страницы, «проходят» по пустому месту после переноса кода.
import { existsSync, readFileSync } from "node:fs";

const SRC = new URL("../../../src/", import.meta.url);

export function readPageWithDomain(relative, depth = 3) {
  const page = readFileSync(new URL(relative, SRC), "utf8");
  const parts = [page];
  const seen = new Set();
  let frontier = [page];
  for (let level = 0; level < depth && frontier.length; level += 1) {
    const next = [];
    for (const text of frontier) {
      for (const match of text.matchAll(/@\/components\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_/-]+)/g)) {
        const key = match[1] + "/" + match[2];
        if (seen.has(key)) continue;
        seen.add(key);
        for (const candidate of [key + ".tsx", key + ".ts", key + "/index.tsx", key + "/index.ts"]) {
          const url = new URL("components/" + candidate, SRC);
          if (!existsSync(url)) continue;
          const content = readFileSync(url, "utf8");
          parts.push(content);
          next.push(content);
          break;
        }
      }
    }
    frontier = next;
  }
  return parts.join("\n");
}
