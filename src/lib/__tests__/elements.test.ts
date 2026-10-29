import { describe, expect, it } from "vitest";

import datasetJson from "@/data/chemical-elements.json";
import {
  CATEGORY_LABELS_RU,
  ELEMENT_COUNT,
  categoriesWithCounts,
  categoryLabelRu,
  chemicalElements,
  elementAriaLabel,
  elementsMeta,
  elementsValidation,
  filterElements,
  formatAtomicMass,
  getElementByNumber,
  getElementBySymbol,
  matchesQuery,
  parseElementsDataset,
  searchElements,
  validateElementsDataset,
} from "@/lib/elements";

type MutableDataset = {
  meta: Record<string, unknown>;
  elements: Array<Record<string, unknown>>;
};

/** Глубокая копия снимка, чтобы тесты могли намеренно портить данные. */
function cloneDataset(): MutableDataset {
  return JSON.parse(JSON.stringify(datasetJson)) as MutableDataset;
}

describe("снимок данных о химических элементах", () => {
  it("содержит 118 элементов и проходит валидатор", () => {
    expect(elementsValidation.valid).toBe(true);
    expect(elementsValidation.errors).toEqual([]);
    expect(chemicalElements).toHaveLength(ELEMENT_COUNT);
    expect(ELEMENT_COUNT).toBe(118);
  });

  it("атомные номера непрерывны 1..118", () => {
    expect(chemicalElements.map((element) => element.number)).toEqual(
      Array.from({ length: 118 }, (_, index) => index + 1)
    );
  });

  it("символы и русские названия уникальны", () => {
    expect(new Set(chemicalElements.map((element) => element.symbol)).size).toBe(118);
    expect(new Set(chemicalElements.map((element) => element.name_ru)).size).toBe(118);
  });

  it("задаёт источник, дату снимка и лицензию", () => {
    expect(elementsMeta.source).toMatch(/^https:\/\//);
    expect(elementsMeta.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(elementsMeta.license.length).toBeGreaterThan(10);
    expect(elementsMeta.attribution.length).toBeGreaterThan(10);

    const primary = elementsMeta.sources.find((source) => source.role === "primary");
    expect(primary).toBeDefined();
    expect(primary?.url).toMatch(/^https:\/\//);
    expect(primary?.license.length).toBeGreaterThan(10);
    expect(primary?.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(primary?.retrieved).toBe(elementsMeta.snapshotDate);

    const russianNames = elementsMeta.sources.find((source) => source.role === "russian-names");
    expect(russianNames?.license).toContain("CC0");
    const verificationSource = elementsMeta.sources.find((source) => source.role === "verification");
    expect(verificationSource?.url).toContain("pubchem");
  });

  it("фиксирует независимую сверку с PubChem", () => {
    const verification = elementsMeta.verification;
    expect(verification.symbolMatches).toBe(118);
    expect(verification.checkedAt).toBe(elementsMeta.snapshotDate);
    expect(verification.independentSource).toContain("pubchem");
    expect(verification.samples.map((sample) => sample.number).sort((a, b) => a - b)).toEqual([1, 6, 26, 92]);
    expect(verification.samples.every((sample) => sample.symbolMatch)).toBe(true);
    expect(verification.massWithinTolerance).toBeGreaterThan(70);
  });
});

describe("точечные сверки значений", () => {
  it("водород: H, 1.008 а.е.м. (PubChem 1.0080)", () => {
    const hydrogen = getElementByNumber(1);
    expect(hydrogen?.symbol).toBe("H");
    expect(hydrogen?.name_en).toBe("Hydrogen");
    expect(hydrogen?.name_ru).toBe("Водород");
    expect(hydrogen?.atomic_mass).toBe(1.008);
    expect(Math.abs((hydrogen?.atomic_mass ?? 0) - 1.008)).toBeLessThanOrEqual(0.001);
  });

  it("углерод: C, 12.011 а.е.м. (PubChem 12.011)", () => {
    const carbon = getElementByNumber(6);
    expect(carbon?.symbol).toBe("C");
    expect(carbon?.name_ru).toBe("Углерод");
    expect(carbon?.atomic_mass).toBe(12.011);
    expect(carbon?.group).toBe(14);
    expect(carbon?.period).toBe(2);
  });

  it("железо: Fe, 55.8452 а.е.м. (PubChem 55.84, расхождение округления)", () => {
    const iron = getElementByNumber(26);
    expect(iron?.symbol).toBe("Fe");
    expect(iron?.name_ru).toBe("Железо");
    expect(iron?.atomic_mass).toBe(55.8452);
    expect(Math.abs((iron?.atomic_mass ?? 0) - 55.84)).toBeLessThanOrEqual(0.01);
    expect(iron?.group).toBe(8);
    expect(iron?.period).toBe(4);
    expect(iron?.block).toBe("d");
    expect(iron?.phase).toBe("Solid");
    expect(iron?.electron_configuration_semantic).toContain("3d6");
  });

  it("уран: U, 238.028913 а.е.м. (PubChem 238.0289)", () => {
    const uranium = getElementByNumber(92);
    expect(uranium?.symbol).toBe("U");
    expect(uranium?.name_ru).toBe("Уран");
    expect(uranium?.atomic_mass).toBe(238.028913);
    expect(Math.abs((uranium?.atomic_mass ?? 0) - 238.0289)).toBeLessThanOrEqual(0.001);
    expect(uranium?.period).toBe(7);
    expect(uranium?.ypos).toBe(10);
    expect(uranium?.category).toBe("actinide");
    expect(uranium?.electron_configuration_semantic).toContain("5f3");
  });

  it("лантаноиды и актиноиды вынесены в отдельные ряды сетки", () => {
    expect(getElementByNumber(57)?.ypos).toBe(9); // La
    expect(getElementByNumber(71)?.ypos).toBe(9); // Lu
    expect(getElementByNumber(89)?.ypos).toBe(10); // Ac
    expect(getElementByNumber(103)?.ypos).toBe(10); // Lr
    expect(getElementByNumber(72)?.ypos).toBe(6); // Hf возвращается в основной блок
    expect(getElementByNumber(104)?.ypos).toBe(7); // Rf
  });

  it("у каждой категории источника есть русская подпись", () => {
    const categories = new Set(chemicalElements.map((element) => element.category));
    for (const category of categories) {
      expect(CATEGORY_LABELS_RU[category]).toBeTruthy();
      expect(categoryLabelRu(category)).not.toBe(category);
    }
  });
});

describe("валидатор отбрасывает битые данные", () => {
  it("принимает исходный снимок", () => {
    expect(validateElementsDataset(datasetJson).valid).toBe(true);
  });

  it("ловит дубликат атомного номера", () => {
    const broken = cloneDataset();
    broken.elements[1].number = 1;
    const result = validateElementsDataset(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/дубликат атомного номера 1/i);
  });

  it("ловит пустой символ", () => {
    const broken = cloneDataset();
    broken.elements[0].symbol = "";
    const result = validateElementsDataset(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/символ/i);
  });

  it("ловит номер 119", () => {
    const broken = cloneDataset();
    broken.elements[117].number = 119;
    const result = validateElementsDataset(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/1\.\.118/);
  });

  it("ловит пропущенный элемент и неверное количество", () => {
    const broken = cloneDataset();
    broken.elements = broken.elements.slice(0, 117);
    const result = validateElementsDataset(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/118/);
  });

  it("ловит дубликат символа", () => {
    const broken = cloneDataset();
    broken.elements[1].symbol = "H";
    const result = validateElementsDataset(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/дубликат символа H/);
  });

  it("ловит недопустимые группу, период, массу, состояние и пустые названия", () => {
    const broken = cloneDataset();
    broken.elements[0].group = 19;
    broken.elements[0].period = 8;
    broken.elements[0].atomic_mass = 0;
    broken.elements[0].phase = "Plasma";
    broken.elements[0].name_ru = "";
    broken.elements[0].name_en = "";
    const result = validateElementsDataset(broken);
    expect(result.valid).toBe(false);
    const joined = result.errors.join(" ");
    expect(joined).toMatch(/группа/);
    expect(joined).toMatch(/период/);
    expect(joined).toMatch(/атомная масса/);
    expect(joined).toMatch(/Solid, Liquid или Gas/);
    expect(joined).toMatch(/name_ru/);
    expect(joined).toMatch(/name_en/);
  });

  it("требует метаданные источника", () => {
    const broken = cloneDataset();
    delete broken.meta.source;
    delete broken.meta.attribution;
    const result = validateElementsDataset(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/meta\.source/);
    expect(result.errors.join(" ")).toMatch(/meta\.attribution/);
  });

  it("parseElementsDataset бросает ошибку на битых данных и сортирует валидные", () => {
    expect(() => parseElementsDataset({ meta: {}, elements: [] })).toThrowError(/Некорректный снимок/);

    const shuffled = cloneDataset();
    shuffled.elements.reverse();
    const parsed = parseElementsDataset(shuffled);
    expect(parsed.elements[0].number).toBe(1);
    expect(parsed.elements[117].number).toBe(118);
  });
});

describe("поиск и фильтры", () => {
  it("находит железо по символу «Fe» и «fe», а не Fermium", () => {
    for (const query of ["Fe", "fe", " FE "]) {
      const found = searchElements(query);
      expect(found.map((element) => element.symbol)).toEqual(["Fe"]);
    }
    expect(searchElements("fermium").map((element) => element.number)).toEqual([100]);
    expect(searchElements("F").map((element) => element.symbol)).toEqual(["F"]);
    expect(searchElements("he").map((element) => element.symbol)).toEqual(["He"]);
  });

  it("находит железо по русскому названию и его части", () => {
    expect(searchElements("железо").map((element) => element.number)).toEqual([26]);
    expect(searchElements("Желез").map((element) => element.number)).toEqual([26]);
    expect(searchElements("ЖЕЛЕЗО").map((element) => element.number)).toEqual([26]);
  });

  it("находит элемент по атомному номеру", () => {
    expect(searchElements("26").map((element) => element.symbol)).toEqual(["Fe"]);
    expect(searchElements("1").map((element) => element.symbol)).toEqual(["H"]);
    expect(searchElements("92").map((element) => element.symbol)).toEqual(["U"]);
  });

  it("находит элементы по латинскому названию", () => {
    expect(searchElements("iron").map((element) => element.number)).toEqual([26]);
    expect(searchElements("uranium").map((element) => element.number)).toEqual([92]);
  });

  it("пустой запрос возвращает все элементы", () => {
    expect(searchElements("")).toHaveLength(118);
    expect(searchElements("   ")).toHaveLength(118);
  });

  it("несуществующий запрос ничего не находит", () => {
    expect(searchElements("кентаврий")).toHaveLength(0);
    expect(searchElements("Xx")).toHaveLength(0);
  });

  it("фильтрует по категории и комбинирует с поиском", () => {
    const nobleGases = filterElements({ category: "noble gas" });
    expect(nobleGases.length).toBeGreaterThan(0);
    expect(nobleGases.every((element) => element.category === "noble gas")).toBe(true);
    expect(nobleGases.map((element) => element.symbol)).toContain("He");

    const lanthanides = filterElements({ category: "lanthanide" });
    expect(lanthanides).toHaveLength(15);

    const combined = filterElements({ category: "transition metal", query: "Fe" });
    expect(combined.map((element) => element.symbol)).toEqual(["Fe"]);

    expect(filterElements({ category: "transition metal", query: "водород" })).toHaveLength(0);
  });

  it("matchesQuery работает по номеру, символу и названиям", () => {
    const iron = getElementByNumber(26);
    if (!iron) throw new Error("в снимке нет элемента №26");
    expect(matchesQuery(iron, "26")).toBe(true);
    expect(matchesQuery(iron, "Fe")).toBe(true);
    expect(matchesQuery(iron, "железо")).toBe(true);
    expect(matchesQuery(iron, "Iron")).toBe(true);
    expect(matchesQuery(iron, "27")).toBe(false);
  });

  it("находит элементы по символу и номеру независимо от регистра", () => {
    expect(getElementBySymbol("fe")?.number).toBe(26);
    expect(getElementBySymbol("FE")?.number).toBe(26);
    expect(getElementBySymbol("Xx")).toBeUndefined();
    expect(getElementByNumber(119)).toBeUndefined();
    expect(getElementByNumber(0)).toBeUndefined();
  });
});

describe("подписи и форматирование", () => {
  it("категории с количеством покрывают все 118 элементов", () => {
    const categories = categoriesWithCounts();
    expect(categories.reduce((sum, item) => sum + item.count, 0)).toBe(118);
    expect(categories.every((item) => item.label.length > 0)).toBe(true);
  });

  it("безопасно форматирует атомную массу", () => {
    expect(formatAtomicMass(1.008)).toBe("1,008");
    expect(formatAtomicMass(238.028913)).toMatch(/^238,028913$/);
  });

  it("собирает доступную подпись кнопки элемента", () => {
    const iron = getElementByNumber(26);
    if (!iron) throw new Error("в снимке нет элемента №26");
    const label = elementAriaLabel(iron);
    expect(label).toContain("Железо");
    expect(label).toContain("Fe");
    expect(label).toContain("26");
    expect(label).toContain("55,8452");
  });
});
