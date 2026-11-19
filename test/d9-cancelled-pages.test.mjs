// D9 (TECH-AUDIT-PLAN-2026-10-27 §6): единый слой отменяемой загрузки.
// Первая волна мигрировала пять ключевых страниц; этот тест фиксирует
// остаток — страницы, где ручной `cancelled`-флаг больше не нужен: отмену и
// отказ от setState после unmount делает useApiRequest.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const PAGES = [
  "src/app/community/page.tsx",
  "src/app/progress/page.tsx",
  "src/app/practice/page.tsx",
  "src/app/trainers/feed/[subject]/page.tsx",
  "src/app/lectures/[id]/page.tsx",
  "src/app/subjects/[id]/tests/page.tsx",
  "src/app/lectures/page.tsx",
  "src/app/subjects/page.tsx",
  "src/app/materials/page.tsx",
  "src/app/tests/preparation/[id]/page.tsx",
  "src/app/tests/bank/[id]/page.tsx",
  "src/app/settings/page.tsx",
  "src/app/subjects/[id]/page.tsx",
  "src/app/schedule/page.tsx",
];

// Страница-редирект больше не грузит данные сама: вместо useApiRequest от неё
// требуется только переход и отсутствие состояния загрузки.
const REDIRECT_PAGES = new Set(["src/app/progress/page.tsx"]);

// После разнесения страница собирается из доменных компонентов: загрузка живёт
// в хуке домена, поэтому проверяем страницу вместе с папкой её компонентов.
// Карта явная: угадывать домен по сегменту пути нельзя — у "/subjects/[id]/"
// последний каталог называется "[id]", а не "subjects".
const DOMAIN_OF_PAGE = {
  "src/app/settings/page.tsx": "settings",
  "src/app/practice/page.tsx": "practice",
  "src/app/subjects/[id]/page.tsx": "subjects",
  "src/app/schedule/page.tsx": "schedule",
  "src/app/tests/preparation/[id]/page.tsx": "test-prep",
  // Вторая волна разнесения (2026-11-20): страница = shell, загрузка в хуке домена.
  "src/app/materials/page.tsx": "materials",
  "src/app/lectures/page.tsx": "lectures",
  "src/app/subjects/page.tsx": "subjects/catalog",
  "src/app/tests/bank/[id]/page.tsx": "tests-hub/bank",
  "src/app/trainers/feed/[subject]/page.tsx": "trainers",
};

function pageSource(page) {
  const pageSrc = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
  const parts = [pageSrc];
  const domain = DOMAIN_OF_PAGE[page];
  // Домен есть только у разнесённых страниц. Читаем не всю папку (там живут и
  // старые компоненты со своими флагами), а весь транзитивный граф импортов
  // `@/components/<domain>/…`, начиная со страницы, — её фактический код
  // может лежать и на втором-третьем хопе (страница → модалка → тело модалки).
  if (!domain) return pageSrc;
  const dir = new URL(`../src/components/${domain}/`, import.meta.url);
  const seen = new Set();
  let frontier = [pageSrc];
  for (let depth = 0; depth < 3 && frontier.length; depth += 1) {
    const next = [];
    for (const text of frontier) {
      for (const match of text.matchAll(new RegExp(`@/components/${domain}/([A-Za-z0-9_/-]+)`, "g"))) {
        const name = match[1];
        if (seen.has(name)) continue;
        seen.add(name);
        for (const candidate of [`${name}.tsx`, `${name}.ts`, `${name}/index.tsx`, `${name}/index.ts`]) {
          const target = new URL(candidate, dir);
          if (!existsSync(target)) continue;
          const content = readFileSync(target, "utf8");
          parts.push(content);
          next.push(content);
          break;
        }
      }
    }
    frontier = next;
  }
  return parts.join("\n");
}

test("§D9 страницы не возвращают ручные cancelled-флаги", () => {
  for (const page of PAGES) {
    const source = pageSource(page);
    assert.equal(source.includes("let cancelled = false"), false, `${page}: ручной cancelled-флаг вернулся`);
    if (REDIRECT_PAGES.has(page)) {
      assert.match(source, /redirect\("\/[^"]+"\)/, `${page}: страница-редирект должна вести на новый адрес`);
      assert.doesNotMatch(source, /useApiRequest|useState|fetch\(/, `${page}: редирект не должен грузить данные`);
      continue;
    }
    assert.match(source, /useApiRequest/, `${page}: загрузка должна идти через useApiRequest`);
  }
});
