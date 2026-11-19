// Тесты читают все файлы домена src/routes/homework/.
import { readdir, readFile } from "node:fs/promises";

const DIR = new URL("../src/routes/homework/", import.meta.url);
const BARREL = new URL("../src/routes/homework.ts", import.meta.url);

export async function readHomeworkDomain() {
  const parts = [await readFile(BARREL, "utf8")];
  for (const name of (await readdir(DIR)).sort()) {
    if (name.endsWith(".ts")) parts.push(await readFile(new URL(name, DIR), "utf8"));
  }
  return parts.join("\n");
}
