// Тесты-контракты проверяют текст всех файлов домена src/routes/tests/:
// иначе проверка «роут отвечает ошибкой» видит пустой баррель.
import { readdir, readFile } from "node:fs/promises";

const DIR = new URL("../src/routes/tests/", import.meta.url);
const BARREL = new URL("../src/routes/tests.ts", import.meta.url);

export async function readTestsDomain() {
  const parts = [await readFile(BARREL, "utf8")];
  for (const name of (await readdir(DIR)).sort()) {
    if (name.endsWith(".ts")) parts.push(await readFile(new URL(name, DIR), "utf8"));
  }
  return parts.join("\n");
}
