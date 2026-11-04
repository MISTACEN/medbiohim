import { describe, expect, it } from "vitest";

import { EXTERNAL_RESOURCES, searchExternalResources } from "@/lib/libraryExternal";

describe("searchExternalResources", () => {
  it("пустой запрос возвращает весь справочник", () => {
    expect(searchExternalResources("   ")).toHaveLength(EXTERNAL_RESOURCES.length);
  });

  it("находит PubMed по названию", () => {
    const hits = searchExternalResources("pubmed");
    expect(hits.map((item) => item.id)).toContain("pubmed");
  });

  it("находит ресурсы по ключевому слову в описании", () => {
    const hits = searchExternalResources("эбс");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("нечувствителен к регистру и ё", () => {
    expect(searchExternalResources("ПОЛНОТЕКСТОВЫЕ")).toHaveLength(
      searchExternalResources("полнотекстовые").length,
    );
  });

  it("возвращает пустой список для неизвестного запроса", () => {
    expect(searchExternalResources("квантовая хромодинамика")).toEqual([]);
  });
});

describe("справочник источников", () => {
  it("не содержит выдуманных API-ссылок на elib", () => {
    const elib = EXTERNAL_RESOURCES.find((item) => item.id === "elib-fesmu");
    expect(elib?.url).toBe("http://elib.fesmu.ru/");
    expect(elib?.accessNote).toContain("API не подтверждено");
  });

  it("у каждого источника есть доступность и примечание", () => {
    for (const resource of EXTERNAL_RESOURCES) {
      expect(resource.accessNote.length).toBeGreaterThan(0);
      expect(resource.url.startsWith("http")).toBe(true);
    }
  });
});
