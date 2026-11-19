// Верификационная чистка неиспользуемых импортов.
// Для каждого имени из lint-отчёта: grep-подсчёт упоминаний вне import-строк.
// Удаляет спецификатор только при нулевом счётчике; остальное — в отчёт.
import report from "../lint-report.json" with { type: "json" };
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

let removed = 0;
const skipped = [];

for (const entry of report) {
  const file = entry.filePath;
  const byLine = new Map();
  for (const m of entry.messages) {
    if (m.ruleId !== "@typescript-eslint/no-unused-vars") continue;
    const match = /^'([^']+)' is defined but never used/.exec(m.message);
    if (match) byLine.set(m.line, match[1]);
  }
  if (byLine.size === 0) continue;

  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const body = lines
    .map((l, i) => ({ l, n: i + 1 }))
    .filter(({ l, n }) => !byLine.has(n) && !/^\s*(import|export)\b/.test(l) && !/^\s*\}/.test(l))
    .map(({ l }) => l)
    .join("\n");

  const unused = new Set();
  for (const [, name] of byLine) {
    const re = new RegExp(`\\b${name.replace(/[$]/g, "\\$")}\\b`);
    if (!re.test(body)) unused.add(name);
    else skipped.push(`${file.split(/medbiohim-b0[\\/]/)[1]}:${name} (есть использования)`);
  }
  if (unused.size === 0) continue;

  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const edits = [];
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue;
    const clause = stmt.importClause;
    const live = (clause.namedBindings?.elements ?? []).filter((el) => {
      const name = el.propertyName?.text ?? el.name.text;
      return !unused.has(name);
    });
    if (live.length === (clause.namedBindings?.elements?.length ?? 0)) continue;
    if (clause.namedBindings && live.length > 0) {
      const parts = live.map((el) =>
        el.propertyName
          ? `${el.propertyName.getText(sf)} as ${el.name.getText(sf)}`
          : el.name.getText(sf)
      );
      edits.push({
        start: clause.namedBindings.getStart(sf),
        end: clause.namedBindings.getEnd(),
        replacement: `{ ${parts.join(", ")} }`,
      });
    } else if (clause.namedBindings && live.length === 0 && clause.name) {
      edits.push({
        start: clause.namedBindings.getStart(sf),
        end: clause.namedBindings.getEnd(),
        replacement: "",
      });
    } else if (clause.namedBindings && live.length === 0) {
      // РОВНО ОДНА правка: удалить весь statement
      edits.push({ start: stmt.getStart(sf), end: stmt.getEnd(), replacement: "" });
    } else if (clause.name && unused.has(clause.name.text)) {
      edits.push({ start: stmt.getStart(sf), end: stmt.getEnd(), replacement: "" });
    }
  }
  if (edits.length === 0) continue;
  edits.sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  out = out.replace(/\n{3,}/g, "\n\n");
  writeFileSync(file, out, "utf8");
  removed += edits.length;
}

console.log(`removed ${removed} import edits; skipped ${skipped.length}:`);
for (const s of skipped) console.log("  skip:", s);
