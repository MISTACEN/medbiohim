// Тесты читают все файлы домена src/routes/teacher/assigned-tests/.
import { readdir, readFile } from "node:fs/promises";

const DIR = new URL("../src/routes/teacher/assigned-tests/", import.meta.url);
const BARREL = new URL("../src/routes/teacher/assigned-tests.ts", import.meta.url);

export async function readAssignedTestsDomain() {
  const parts = [await readFile(BARREL, "utf8")];
  for (const name of (await readdir(DIR)).sort()) {
    if (name.endsWith(".ts")) parts.push(await readFile(new URL(name, DIR), "utf8"));
  }
  return parts.join("\n");
}
