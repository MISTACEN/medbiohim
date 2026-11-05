/**
 * Разделение SQL-файла на отдельные выражения без внешних импортов
 * (проверяется node-тестом test/bootstrap-migrate.test.js).
 *
 * Тела $$...$$ (DO-блоки, функции), строковые литералы и комментарии не
 * разрезаются: иначе миграции с DO-блоками ломаются на первом ';'.
 */

function stripLeadingComments(fragment: string): string {
  let text = fragment;
  for (;;) {
    const stripped = text
      .replace(/^\s+/, "")
      .replace(/^--[^\n]*(\n|$)/, "")
      .replace(/^\/\*[\s\S]*?\*\//, "");
    if (stripped === text) break;
    text = stripped;
  }
  return text.trim();
}

function splitSqlStatements(sql: string): string[] {
  const text = sql.replace(/\r\n/g, "\n");
  const statements: string[] = [];
  let current = "";
  let i = 0;
  let inSingle = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = "";
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (inLineComment) {
      current += ch;
      if (ch === "\n") inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlockComment) {
      current += ch;
      if (ch === "*" && next === "/") {
        current += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i += 1;
      continue;
    }
    if (!inSingle && !dollarTag && ch === "-" && next === "-") {
      inLineComment = true;
      current += ch + next;
      i += 2;
      continue;
    }
    if (!inSingle && !dollarTag && ch === "/" && next === "*") {
      inBlockComment = true;
      current += ch + next;
      i += 2;
      continue;
    }
    if (!dollarTag && !inLineComment && !inBlockComment && ch === "'") {
      inSingle = !inSingle;
      current += ch;
      i += 1;
      continue;
    }
    if (inSingle) {
      current += ch;
      if (ch === "'" && next === "'") {
        current += next;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (!dollarTag && ch === "$") {
      const match = /^\$[A-Za-z_]*\$/.exec(text.slice(i));
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }
    if (dollarTag && text.startsWith(dollarTag, i)) {
      current += dollarTag;
      i += dollarTag.length;
      dollarTag = "";
      continue;
    }
    if (!dollarTag && ch === ";") {
      const trimmed = stripLeadingComments(current);
      if (trimmed) statements.push(trimmed);
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  const trimmed = stripLeadingComments(current);
  if (trimmed) statements.push(trimmed);
  return statements;
}

export { splitSqlStatements };
