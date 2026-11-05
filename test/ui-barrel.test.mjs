/**
 * Контракт барреля общего UI-слоя (этап D).
 *
 * `src/components/ui/index.ts` — единственная точка входа для новых экранов.
 * Если файл компонента появился, но не попал в баррель, его начнут импортировать
 * глубокой ссылкой и он выпадет из реестра общего слоя. Обратная ошибка — импорт
 * из барреля файла, который уже удалён, — ломает сборку только у потребителя.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uiDir = path.join(root, "src", "components", "ui");
const barrelPath = path.join(uiDir, "index.ts");

async function loadBarrel() {
  return readFile(barrelPath, "utf8");
}

test("баррель экспортирует каждый компонент каталога", async () => {
  const files = await readdir(uiDir, { withFileTypes: true });
  const components = files
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => entry.name.slice(0, -".tsx".length));
  const barrel = await loadBarrel();

  assert.ok(components.length > 0, "в src/components/ui нет компонентов");
  for (const name of components) {
    assert.match(
      barrel,
      new RegExp(`from "\\./${name}"`),
      `${name}.tsx не экспортируется из src/components/ui/index.ts`,
    );
  }
});

test("баррель не ссылается на удалённые файлы", async () => {
  const barrel = await loadBarrel();
  const imports = [...barrel.matchAll(/from "(\.\/[^"]+)"/g)].map((match) => match[1]);

  assert.ok(imports.length > 0, "баррель не содержит относительных импортов");
  for (const specifier of imports) {
    const base = path.join(uiDir, specifier);
    const found = await Promise.all(
      [base, `${base}.ts`, `${base}.tsx`].map((candidate) => stat(candidate).then(() => true, () => false)),
    );
    assert.ok(found.some(Boolean), `баррель ссылается на удалённый файл: ${specifier}`);
  }
});
