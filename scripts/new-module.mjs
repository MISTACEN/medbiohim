#!/usr/bin/env node
/**
 * Генератор подмодуля предмета.
 *
 *   node scripts/new-module.mjs <slug> --title "Название" [--summary "…"] \
 *     [--subject <slug-предмета>]... [--tab key:Label[:подсказка]]... [--dry-run]
 *
 * Что делает: создаёт `src/modules/subjects/submodules/<slug>/` (баррель,
 * скелет модуля) и дописывает подмодуль в `src/modules/subjects/registry.json`.
 * Ничего не перезаписывает: существующий слаг или каталог — ошибка.
 *
 * Скелет читает вкладки из реестра, поэтому после правки `registry.json`
 * (добавили раздел) код модуля менять не нужно.
 *
 * Скрипт ничего не деплоит и не трогает БД. С --dry-run только печатает план.
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const REGISTRY_FILE = "src/modules/subjects/registry.json";
export const SUBMODULES_DIR = "src/modules/subjects/submodules";

const SLUG_RE = /^[a-z][a-z0-9-]{1,30}$/;
const RESERVED = new Set(["index", "registry", "shared", "submodules"]);

export function validateSlug(slug) {
  const value = String(slug ?? "").trim();
  if (!value) return "нужен слаг подмодуля";
  if (!SLUG_RE.test(value)) {
    return "слаг: строчные латинские буквы, цифры и дефис, 2–31 символ, начинается с буквы";
  }
  if (RESERVED.has(value)) return `слаг «${value}» зарезервирован`;
  return null;
}

export function pascalCase(slug) {
  return String(slug)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

export function defaultTab() {
  return { key: "overview", label: "Обзор", hint: "Стартовый раздел подмодуля." };
}

function normalizeTab(tab) {
  const entry = { key: String(tab.key ?? "").trim(), label: String(tab.label ?? "").trim() };
  if (!entry.key || !entry.label) throw new Error("у вкладки нужны key и label");
  // Инвариант реестра: подсказка обязательна (subject-submodules.test.mjs).
  // Без явной --tab-hint подставляем дефолт, чтобы сгенерированный модуль
  // сразу проходил фитнес-проверки.
  entry.hint = String(tab.hint ?? "").trim() || `Раздел «${entry.label}» подмодуля.`;
  if (tab.href) entry.href = String(tab.href).trim();
  return entry;
}

export function buildSubmodule({ slug, title, summary, subjectSlugs = [], tabs = [] }) {
  const name = String(title ?? "").trim();
  if (!name) throw new Error("нужен --title");
  const list = tabs.length > 0 ? tabs : [defaultTab()];
  const keys = new Set();
  for (const tab of list) {
    if (keys.has(tab.key)) throw new Error(`дубль вкладки «${tab.key}»`);
    keys.add(tab.key);
  }
  return {
    slug,
    title: name,
    summary: String(summary ?? "").trim() || `${name}: разделы подмодуля.`,
    subjectSlugs: [...new Set(subjectSlugs.map((item) => String(item).trim().toLowerCase()).filter(Boolean))],
    tabs: list.map(normalizeTab),
  };
}

/** `--tab structures:Структуры:Подсказка` (подсказка необязательна). */
export function parseTab(raw) {
  const [key, label, ...rest] = String(raw).split(":");
  if (!key || !label) throw new Error(`--tab ждёт key:Label, получено «${raw}»`);
  const hint = rest.join(":").trim();
  return hint ? { key: key.trim(), label: label.trim(), hint } : { key: key.trim(), label: label.trim() };
}

export function parseArgs(argv) {
  const options = {
    slug: null,
    title: null,
    summary: null,
    subjectSlugs: [],
    tabs: [],
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("--")) {
      const [flag, inline] = arg.split("=", 2);
      const value = inline ?? argv[++i];
      if (!value) throw new Error(`${flag} требует значение`);
      if (flag === "--title") options.title = value;
      else if (flag === "--summary") options.summary = value;
      else if (flag === "--subject") options.subjectSlugs.push(value);
      else if (flag === "--tab") options.tabs.push(parseTab(value));
      else throw new Error(`неизвестный флаг ${flag}`);
    } else if (!options.slug) options.slug = arg;
    else throw new Error(`лишний аргумент «${arg}»`);
  }
  return options;
}

export function withSubmodule(registry, submodule) {
  const slugs = new Set((registry.submodules ?? []).map((item) => item.slug));
  if (slugs.has(submodule.slug)) throw new Error(`подмодуль «${submodule.slug}» уже в реестре`);
  const claimed = new Set((registry.submodules ?? []).flatMap((item) => item.subjectSlugs ?? []));
  const taken = submodule.subjectSlugs.filter((slug) => claimed.has(slug));
  if (taken.length > 0) throw new Error(`предметы уже заняты другим подмодулем: ${taken.join(", ")}`);
  return {
    ...registry,
    updated: new Date().toISOString().slice(0, 10),
    submodules: [...(registry.submodules ?? []), submodule],
  };
}

export function moduleSource({ submodule, pascal }) {
  return `"use client";

import { useState } from "react";
import { requireSubmodule } from "../../registry";

/**
 * ${submodule.title}: скелет подмодуля, сгенерированный scripts/new-module.mjs.
 * Вкладки берутся из src/modules/subjects/registry.json — новый раздел
 * добавляется записью в реестре, а не правкой этого файла.
 */
const SUBMODULE = requireSubmodule("${submodule.slug}");

export function ${pascal}Module() {
  const [active, setActive] = useState<string>(SUBMODULE.tabs[0].key);
  const tab = SUBMODULE.tabs.find((item) => item.key === active) ?? SUBMODULE.tabs[0];

  return (
    <section className="card space-y-4 p-4 sm:p-5">
      <header className="space-y-1">
        <h2 className="text-lg font-bold">{SUBMODULE.title}</h2>
        <p className="text-sm text-slate-500">{SUBMODULE.summary}</p>
      </header>

      <nav role="tablist" aria-label={\`Разделы: \${SUBMODULE.title}\`} className="flex flex-wrap gap-1.5">
        {SUBMODULE.tabs.map((item) => {
          const current = item.key === tab.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={current}
              onClick={() => setActive(item.key)}
              className={
                "min-h-8 rounded-full px-3 py-1.5 text-xs font-bold transition " +
                (current ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700")
              }
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div role="tabpanel" className="space-y-2 rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-bold text-slate-700">{tab.label}</h3>
        {tab.hint ? <p className="text-sm text-slate-500">{tab.hint}</p> : null}
      </div>
    </section>
  );
}
`;
}

export function barrelSource({ submodule, pascal }) {
  return `/**
 * ${submodule.title}: публичная поверхность подмодуля.
 * Снаружи импортируется только отсюда (test/module-boundaries.test.mjs).
 */
export { ${pascal}Module } from "./${pascal}Module";
`;
}

export async function generate(options, deps = {}) {
  const read = deps.readFile ?? readFile;
  const write = deps.writeFile ?? writeFile;
  const mkdirp = deps.mkdir ?? mkdir;
  const exists = deps.access ?? access;

  const slugError = validateSlug(options.slug);
  if (slugError) throw new Error(slugError);
  const submodule = buildSubmodule(options);
  const pascal = pascalCase(submodule.slug);
  const dir = path.join(ROOT, SUBMODULES_DIR, submodule.slug);
  const files = {
    [`${SUBMODULES_DIR}/${submodule.slug}/index.ts`]: barrelSource({ submodule, pascal }),
    [`${SUBMODULES_DIR}/${submodule.slug}/${pascal}Module.tsx`]: moduleSource({ submodule, pascal }),
  };

  const dirTaken = await exists(dir).then(() => true, () => false);
  if (dirTaken) throw new Error(`каталог уже существует: ${SUBMODULES_DIR}/${submodule.slug}`);

  const registryPath = path.join(ROOT, REGISTRY_FILE);
  const registry = JSON.parse(await read(registryPath, "utf8"));
  const next = withSubmodule(registry, submodule);

  if (options.dryRun) return { submodule, files, registry: next, written: false };

  await mkdirp(dir, { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    await write(path.join(ROOT, relative), content);
  }
  await write(registryPath, `${JSON.stringify(next, null, 2)}\n`);
  return { submodule, files, registry: next, written: true };
}

const USAGE = `Генератор подмодуля предмета.

  node scripts/new-module.mjs <slug> --title "Название" [опции]

Опции:
  --summary "…"            краткое описание для реестра
  --subject <slug>         слаг предмета из БД (можно повторять)
  --tab key:Label[:hint]   раздел подмодуля (можно повторять; по умолчанию Обзор)
  --dry-run                показать план, ничего не записывая
  -h, --help               эта справка
`;

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }
  try {
    const result = await generate(options);
    console.log(`${result.written ? "Создан" : "План (--dry-run)"}: подмодуль «${result.submodule.slug}»`);
    for (const relative of Object.keys(result.files)) console.log(`  + ${relative}`);
    console.log(`  ~ ${REGISTRY_FILE}`);
    if (!result.written) console.log("\nПовторите без --dry-run, чтобы записать.");
    else console.log("\nДальше: npm run typecheck && npm test");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) await main();
