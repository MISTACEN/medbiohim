/**
 * Тестовый резолвер алиасов "@/..." для node:test: маппит их на src/**.
 * Нужен только тестам, работающим с модулями, которые используют
 * tsconfig-алиасы. Приложение Next.js резолвит их своим конфигом.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

export async function resolve(specifier, context, next) {
  // Алиасы "@/..." → src/**. Родственные импорты без расширения → .ts.
  if (specifier.startsWith("@/")) {
    const base = path.join(srcDir, specifier.slice(2));
    const target = pathToFileURL(base.endsWith(".ts") ? base : `${base}.ts`).href;
    return next(target, context);
  }
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : null;
  if (isRelative && parentPath && !path.extname(specifier)) {
    const candidate = path.resolve(path.dirname(parentPath), specifier);
    if (existsSync(`${candidate}.ts`)) {
      return next(pathToFileURL(`${candidate}.ts`).href, context);
    }
  }
  return next(specifier, context);
}
