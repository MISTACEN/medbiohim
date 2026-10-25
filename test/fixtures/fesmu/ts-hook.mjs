/**
 * Minimal, dependency-free ESM loader hook that lets `node --test` (and plain
 * `node`) import the real TypeScript sources of the FESMU adapter directly.
 *
 * Why this exists: `node --test test/university-adapter.test.mjs` must exercise
 * the shipped code in `src/lib/university/*.ts`, but those files use
 * extensionless relative imports (`./types`), which Node's native type stripping
 * cannot resolve. This hook (a) resolves extensionless relative specifiers to
 * `.ts`/`.tsx`/`index.ts` and (b) transpiles TypeScript with the already-present
 * `typescript` dev dependency (no new npm packages, no network, no build step).
 *
 * Usage from a test:
 *   import { register } from "node:module";
 *   register("./fixtures/fesmu/ts-hook.mjs", import.meta.url);
 *   const fesmu = await import("../../src/lib/university/fesmu.ts");
 *
 * The hook only touches URLs that end in `.ts`/`.tsx`; every other module goes
 * through Node's default loader untouched.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const TS_EXT = /\.tsx?$/;
const RELATIVE = /^\.{1,2}\//;
const SRC_ROOT = new URL("../../../src/", import.meta.url);

async function firstExisting(candidates) {
  for (const candidate of candidates) {
    try {
      if (existsSync(fileURLToPath(candidate))) return candidate;
    } catch {
      // ignore malformed candidate
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = new URL(specifier.slice(2), SRC_ROOT);
    const alias = await firstExisting([`${base.href}.ts`, `${base.href}.tsx`, `${base.href}/index.ts`]);
    if (alias) return { url: alias, format: "module", shortCircuit: true };
  }
  if (RELATIVE.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
    let base;
    try {
      base = new URL(specifier, context.parentURL);
    } catch {
      return nextResolve(specifier, context);
    }
    const url = await firstExisting([`${base.href}.ts`, `${base.href}.tsx`, `${base.href}/index.ts`]);
    if (url) return { url, format: "module", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  const clean = url.split("?")[0];
  if (TS_EXT.test(clean) && clean.startsWith("file:")) {
    const source = readFileSync(fileURLToPath(clean), "utf8");
    const out = ts.transpileModule(source, {
      fileName: fileURLToPath(clean),
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: false,
        isolatedModules: true,
      },
      reportDiagnostics: false,
    });
    return { format: "module", source: out.outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
