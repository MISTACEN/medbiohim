// D9 (TECH-AUDIT-PLAN-2026-10-27 §6): единый слой отменяемой загрузки.
// Первая волна мигрировала пять ключевых страниц; этот тест фиксирует
// остаток — 13 второстепенных страниц, где ручной `cancelled`-флаг больше
// не нужен: отмену и отказ от setState после unmount делает useApiRequest.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
];

// Страницы, которые больше не грузят данные сами, а ведут на новый адрес.
// Для них проверка строже: ни загрузки, ни состояния на странице быть не должно.
const REDIRECT_PAGES = new Map([
  ["src/app/progress/page.tsx", "прогресс переехал на /study#progress"],
]);

test("§D9 страницы не возвращают ручные cancelled-флаги", () => {
  for (const page of PAGES) {
    const source = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    assert.equal(source.includes("let cancelled = false"), false, `${page}: ручной cancelled-флаг вернулся`);
    if (REDIRECT_PAGES.has(page)) {
      assert.match(source, /import \{ redirect \} from "next\/navigation"/, `${page}: редирект должен идти через next/navigation`);
      assert.match(source, /redirect\("\/[^"]+"\)/, `${page}: страница-редирект должна куда-то вести`);
      assert.equal(source.includes("useState"), false, `${page}: редирект не должен держать состояние загрузки`);
      continue;
    }
    assert.match(source, /useApiRequest/, `${page}: загрузка должна идти через useApiRequest`);
  }
});
