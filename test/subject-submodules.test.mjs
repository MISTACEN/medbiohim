import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";

import {
  barrelSource,
  buildSubmodule,
  moduleSource,
  parseArgs,
  parseTab,
  pascalCase,
  validateSlug,
  withSubmodule,
} from "../scripts/new-module.mjs";

/**
 * Реестр подмодулей предметов (docs/architecture/MODULE-ARCHITECTURE.md, §4).
 *
 * Реестр — источник истины для разделов подмодуля: карточка предмета,
 * `ChemistryModule` и генератор читают его. Тесты держат два обязательства:
 * 1) данные реестра сами по себе корректны (слаги, вкладки, ссылки);
 * 2) реестр не разъезжается с UI химии и со страницами, на которые ссылается.
 */
const ROOT = path.resolve(import.meta.dirname, "..");
const REGISTRY = path.join(ROOT, "src/modules/subjects/registry.json");
const CHEMS_MODULE = path.join(
  ROOT,
  "src/modules/subjects/submodules/chemistry/ChemistryModule.tsx",
);
const BARREL = path.join(ROOT, "src/modules/subjects/index.ts");

const SLUG_RE = /^[a-z][a-z0-9-]*$/;

const registry = JSON.parse(await readFile(REGISTRY, "utf8"));
const submodules = registry.submodules ?? [];

/** Разделы химии из UI — единственное место, где они ещё объявлены кодом. */
function chemistrySections(source) {
  const block = source.match(/const SECTIONS[^=]*=\s*\[([\s\S]*?)\n\];/);
  assert.ok(block, "в ChemistryModule.tsx не найден массив SECTIONS");
  return [...block[1].matchAll(/id:\s*"([a-z0-9-]+)"/g)].map((match) => match[1]);
}

test("реестр: слаги уникальны и нормализованы", () => {
  assert.ok(submodules.length > 0, "реестр пуст");
  const seen = new Set();
  for (const item of submodules) {
    assert.match(item.slug, SLUG_RE, `слаг подмодуля: ${item.slug}`);
    assert.equal(seen.has(item.slug), false, `дубль подмодуля: ${item.slug}`);
    seen.add(item.slug);
    assert.ok(item.title?.trim(), `${item.slug}: пустой title`);
    assert.ok(item.summary?.trim(), `${item.slug}: пустой summary`);
    assert.ok(Array.isArray(item.subjectSlugs), `${item.slug}: subjectSlugs должен быть массивом`);
  }
  assert.equal(registry.version, 1);
});

test("реестр: у подмодуля есть вкладки с уникальными ключами и текстами", () => {
  for (const item of submodules) {
    assert.ok(item.tabs.length > 0, `${item.slug}: нет вкладок`);
    const keys = new Set();
    for (const tab of item.tabs) {
      assert.match(tab.key, SLUG_RE, `${item.slug}: ключ вкладки ${tab.key}`);
      assert.equal(keys.has(tab.key), false, `${item.slug}: дубль вкладки ${tab.key}`);
      keys.add(tab.key);
      assert.ok(tab.label?.trim(), `${item.slug}/${tab.key}: пустой label`);
      assert.ok(tab.hint?.trim(), `${item.slug}/${tab.key}: пустая подсказка`);
    }
  }
});

test("реестр: каждый предмет принадлежит не более чем одному подмодулю", () => {
  const owner = new Map();
  for (const item of submodules) {
    for (const subject of item.subjectSlugs) {
      assert.equal(subject, subject.toLowerCase().trim(), `${item.slug}: слаг предмета «${subject}» не нормализован`);
      const previous = owner.get(subject);
      assert.equal(previous, undefined, `предмет «${subject}» у двух подмодулей: ${previous} и ${item.slug}`);
      owner.set(subject, item.slug);
    }
  }
});

test("реестр: ссылки вкладок ведут на существующие страницы", async () => {
  for (const item of submodules) {
    for (const tab of item.tabs) {
      if (!tab.href) continue;
      assert.match(tab.href, /^\/[a-z0-9/-]*$/, `${item.slug}/${tab.key}: href без ведущего слеша`);
      const page = path.join(ROOT, "src/app", tab.href, "page.tsx");
      const exists = await access(page).then(() => true, () => false);
      assert.ok(exists, `${item.slug}/${tab.key}: нет страницы для ${tab.href}`);
    }
  }
});

test("химия: вкладки реестра совпадают с разделами ChemistryModule по порядку", async () => {
  const source = await readFile(CHEMS_MODULE, "utf8");
  const sectionKeys = chemistrySections(source);
  const chemistry = submodules.find((item) => item.slug === "chemistry");
  assert.ok(chemistry, "в реестре нет подмодуля chemistry");
  assert.deepEqual(
    chemistry.tabs.map((tab) => tab.key),
    sectionKeys,
    "порядок и набор разделов реестра и ChemistryModule разошлись",
  );
});

test("химия: тексты вкладок реестра не разъехались с UI", async () => {
  const source = await readFile(CHEMS_MODULE, "utf8");
  const chemistry = submodules.find((item) => item.slug === "chemistry");
  for (const tab of chemistry.tabs) {
    assert.ok(source.includes(`label: "${tab.label}"`), `в UI нет подписи «${tab.label}»`);
    assert.ok(source.includes(tab.hint), `в UI нет подсказки вкладки «${tab.key}»`);
  }
});

test("баррель модуля отдаёт наружу доступ к реестру", async () => {
  const source = await readFile(BARREL, "utf8");
  for (const name of ["SUBJECT_SUBMODULES", "getSubmodule", "requireSubmodule", "submoduleForSubject"]) {
    assert.ok(source.includes(name), `баррель не реэкспортирует ${name}`);
  }
});

test("генератор: слаг проверяется до записи", () => {
  assert.equal(validateSlug("math"), null);
  assert.equal(validateSlug("lab-tech"), null);
  assert.equal(validateSlug(""), "нужен слаг подмодуля");
  assert.ok(validateSlug("Math"), "заглавные буквы запрещены");
  assert.ok(validateSlug("1chem"), "слаг не может начинаться с цифры");
  assert.ok(validateSlug("a"), "слишком короткий слаг");
  assert.ok(validateSlug("registry"), "зарезервированный слаг");
  assert.equal(pascalCase("lab-tech"), "LabTech");
});

test("генератор: запись реестра собирается из аргументов", () => {
  assert.deepEqual(parseTab("lab:Лаборатория:Опыты"), {
    key: "lab",
    label: "Лаборатория",
    hint: "Опыты",
  });
  // parseTab — сырой парсер аргумента; дефолтную подсказку подставляет
  // normalizeTab внутри buildSubmodule (см. проверку entry.tabs ниже).
  assert.deepEqual(parseTab("lab:Лаборатория"), { key: "lab", label: "Лаборатория" });

  const options = parseArgs([
    "math",
    "--title",
    "Математика",
    "--subject",
    "math_analysis",
    "--tab",
    "limits:Пределы",
    "--dry-run",
  ]);
  assert.equal(options.slug, "math");
  assert.equal(options.title, "Математика");
  assert.deepEqual(options.subjectSlugs, ["math_analysis"]);
  assert.equal(options.dryRun, true);

  const entry = buildSubmodule(options);
  assert.deepEqual(entry.subjectSlugs, ["math_analysis"]);
  assert.deepEqual(entry.tabs, [
    { key: "limits", label: "Пределы", hint: "Раздел «Пределы» подмодуля." },
  ]);

  const empty = buildSubmodule({ slug: "math", title: "Математика" });
  assert.deepEqual(empty.tabs.map((tab) => tab.key), ["overview"], "по умолчанию один раздел «Обзор»");
  assert.throws(() => buildSubmodule({ slug: "math" }), /--title/);
  assert.throws(() => buildSubmodule({ slug: "math", title: "M", tabs: [{ key: "a", label: "A" }, { key: "a", label: "B" }] }), /дубль/);
});

test("генератор: занятый слаг или предмет не перезаписываются", () => {
  const registryStub = { submodules: [{ slug: "chemistry", subjectSlugs: ["chem"] }] };
  assert.throws(
    () => withSubmodule(registryStub, { slug: "chemistry", subjectSlugs: [] }),
    /уже в реестре/,
  );
  assert.throws(
    () => withSubmodule(registryStub, { slug: "chem2", subjectSlugs: ["chem"] }),
    /уже заняты/,
  );
  const next = withSubmodule(registryStub, { slug: "math", subjectSlugs: ["math"] });
  assert.equal(next.submodules.length, 2);
  assert.equal(registryStub.submodules.length, 1, "исходный реестр не мутируется");
});

test("генератор: скелет модуля читает вкладки из реестра", () => {
  const submodule = buildSubmodule({
    slug: "lab-tech",
    title: "Лабораторная техника",
    subjectSlugs: ["lab_tech"],
  });
  const pascal = pascalCase(submodule.slug);
  const source = moduleSource({ submodule, pascal });
  assert.ok(source.includes(`requireSubmodule("lab-tech")`), "скелет должен брать разделы из реестра");
  assert.ok(source.includes(`export function ${pascal}Module`), "имя компонента из слага");
  assert.ok(source.includes('from "../../registry"'), "импорт реестра относительный, без alias");
  assert.ok(barrelSource({ submodule, pascal }).includes(`${pascal}Module`));
});
