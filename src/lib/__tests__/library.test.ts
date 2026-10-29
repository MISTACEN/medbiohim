import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { LIBRARY_FILES, libraryTokens, normalizeLibraryText, searchLibrary } from "../library";

describe("поиск по статическим пособиям", () => {
  it("«учебник по физиологии» находит учебник Агаджаняна", () => {
    const hits = searchLibrary("учебник по физиологии");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].title).toContain("Агаджанян");
    expect(hits[0].href).toBe("/library/physiology/agadzhanyan-fiziologiya-t1.pdf");
    expect(hits[0].type).toBe("material");
    expect(hits[0].type_label).toBe("Учебное пособие");
  });

  it("совпадение по обоим словам выше частичного", () => {
    const hits = searchLibrary("физиология крови");
    expect(hits[0].title).toBe("Физиология крови и эндокринной системы");
    const textOnly = hits.find((hit) => hit.title.includes("Агаджанян"));
    if (textOnly) expect(hits[0].score).toBeGreaterThan(textOnly.score);
  });

  it("вид материала ищется и без предмета", () => {
    expect(searchLibrary("учебник").map((hit) => hit.title)).toEqual([
      "Агаджанян Н.А. Основы физиологии человека, том 1",
    ]);
    expect(searchLibrary("методичка")).toHaveLength(5);
  });

  it("предметный фильтр исключает чужие пособия", () => {
    expect(searchLibrary("физиология", "histology")).toEqual([]);
    expect(searchLibrary("физиология", "physiology").length).toBeGreaterThan(0);
  });

  it("посторонний запрос не даёт ложных совпадений", () => {
    expect(searchLibrary("химия")).toEqual([]);
    expect(searchLibrary("  ")).toEqual([]);
  });

  it("стемминг и нормализация совпадают с серверными правилами", () => {
    expect(libraryTokens("учебник по гистологии")).toEqual(["учебник", "гистолог"]);
    expect(normalizeLibraryText("Физиология Ёлки")).toBe("физиология елки");
  });

  it("каждый файл индекса существует и ссылка уникальна", () => {
    const hrefs = LIBRARY_FILES.map((file) => file.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const file of LIBRARY_FILES) {
      expect(existsSync(join(process.cwd(), "public", file.href)), file.href).toBe(true);
    }
  });
});
