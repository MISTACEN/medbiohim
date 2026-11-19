// Тесты читают все файлы домена src/routes/community/ вместе с баррелем.
import { readdir, readFile } from "node:fs/promises";

const DIR = new URL("../src/routes/community/", import.meta.url);
const BARREL = new URL("../src/routes/community.ts", import.meta.url);

export async function readCommunityDomain() {
  const parts = [await readFile(BARREL, "utf8")];
  for (const file of (await readdir(DIR)).sort()) {
    if (file.endsWith(".ts")) parts.push(await readFile(new URL(file, DIR), "utf8"));
  }
  return parts.join("\n");
}
