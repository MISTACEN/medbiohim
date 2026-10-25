/**
 * Loads the real TypeScript sources of the FESMU adapter from a plain `.mjs`
 * test/smoke script, without any build step or new dependency.
 *
 * It installs a tiny ESM loader hook (sync `module.registerHooks` when available,
 * async `module.register` otherwise) that:
 *   - resolves extensionless relative imports (`./types`) to `.ts` files;
 *   - transpiles `.ts` with the `typescript` dev dependency that the project
 *     already ships (no new npm packages, no network, no writes to the repo).
 *
 * Example:
 *   import { loadUniversityTs } from "./fixtures/fesmu/load-ts.mjs";
 *   const fesmu = await loadUniversityTs("fesmu.ts");
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { register, registerHooks } from "node:module";
import ts from "typescript";

const SRC_DIR = new URL("../../../src/lib/university/", import.meta.url);
const SRC_ROOT = new URL("../../../src/", import.meta.url);
const NEXT_SERVER = new URL("../../../node_modules/next/server.js", import.meta.url);
const RELATIVE = /^\.{1,2}\//;

/** Route handlers import `next/server`, which raw Node ESM cannot resolve. */
function resolveNextServer(specifier) {
  if (specifier !== "next/server") return null;
  try {
    return existsSync(fileURLToPath(NEXT_SERVER)) ? NEXT_SERVER.href : null;
  } catch {
    return null;
  }
}

/** `@/foo` → `src/foo.ts` (the tsconfig path alias used by route handlers). */
function resolveAlias(specifier) {
  if (!specifier.startsWith("@/")) return null;
  const base = new URL(specifier.slice(2), SRC_ROOT);
  for (const candidate of [`${base.href}.ts`, `${base.href}.tsx`, `${base.href}/index.ts`]) {
    try {
      if (existsSync(fileURLToPath(candidate))) return candidate;
    } catch {
      // ignore malformed candidate
    }
  }
  return null;
}

function resolveRelativeTs(specifier, context) {
  if (!RELATIVE.test(specifier) || /\.[cm]?[jt]sx?$/.test(specifier) || !context?.parentURL) return null;
  let base;
  try {
    base = new URL(specifier, context.parentURL);
  } catch {
    return null;
  }
  for (const candidate of [`${base.href}.ts`, `${base.href}.tsx`, `${base.href}/index.ts`]) {
    try {
      if (existsSync(fileURLToPath(candidate))) return candidate;
    } catch {
      // ignore malformed candidate
    }
  }
  return null;
}

function transpile(url) {
  const clean = url.split("?")[0];
  if (!/\.tsx?$/.test(clean) || !clean.startsWith("file:")) return null;
  const fileName = fileURLToPath(clean);
  const out = ts.transpileModule(readFileSync(fileName, "utf8"), {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
    reportDiagnostics: false,
  });
  return out.outputText;
}

let installed = false;
function install() {
  if (installed) return;
  installed = true;
  if (typeof registerHooks === "function") {
    registerHooks({
      resolve(specifier, context, nextResolve) {
        const next = resolveNextServer(specifier);
        if (next) return { url: next, format: "commonjs", shortCircuit: true };
        const alias = resolveAlias(specifier);
        if (alias) return { url: alias, format: "module", shortCircuit: true };
        const url = resolveRelativeTs(specifier, context);
        if (url) return { url, format: "module", shortCircuit: true };
        return nextResolve(specifier, context);
      },
      load(url, context, nextLoad) {
        const source = transpile(url);
        if (source !== null) return { format: "module", source, shortCircuit: true };
        return nextLoad(url, context);
      },
    });
    return;
  }
  register("./ts-hook.mjs", import.meta.url);
}

/** Transpile+import one adapter module (`fesmu.ts`, `portals.ts`, `types.ts`). */
export async function loadUniversityTs(file = "fesmu.ts") {
  install();
  return import(new URL(file, SRC_DIR).href);
}
