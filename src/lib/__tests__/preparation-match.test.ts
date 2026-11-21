import { describe, expect, it } from "vitest";

import {
  MIN_MATCH_LENGTH,
  preparationContains,
  preparationKey,
  preparationNames,
} from "@/shared/histology/preparation-match";
import { guideForCard, indexGuides, preparationKey as atlasPreparationKey } from "@/lib/histologyAtlas";

/**
 * Одно правило сопоставления препарат ↔ методичка для атласа и диагностикума.
 * Тест фиксирует то, что раньше дублировалось в двух модулях и уже разошлось.
 */
describe("сопоставление препарата с методичкой", () => {
  it("нормализует ключ одинаково в браузере и в общем модуле", () => {
    expect(atlasPreparationKey).toBe(preparationKey);
    expect(preparationKey("Мазок крови")).toBe("мазок-крови");
    expect(preparationKey("  Ёж — иглы! ")).toBe("еж-иглы");
    expect(preparationKey("cytology-mitosis")).toBe("cytology-mitosis");
    expect(preparationKey(null)).toBe("");
  });

  it("даёт оба варианта названия гида без повторов", () => {
    expect(preparationNames({ key: "cytology-mitosis", name: "Митоз" })).toEqual([
      "cytology-mitosis",
      "митоз",
    ]);
    expect(preparationNames({ key: "митоз", name: "Митоз" })).toEqual(["митоз"]);
  });

  it("совпадает по точному ключу и по вхождению в обе стороны", () => {
    expect(preparationContains("Митоз", "митоз")).toBe(true);
    expect(preparationContains("Митоз (корешок лука)", "Митоз")).toBe(true);
    expect(preparationContains("Митоз", "Митоз (корешок лука)")).toBe(true);
  });

  it("не совпадает на пустых и коротких названиях", () => {
    expect(preparationContains("", "Митоз")).toBe(false);
    expect(preparationContains("Митоз", null)).toBe(false);
    expect(preparationContains("Кровь", "кровь")).toBe(true);
    expect(preparationContains("Мазок крови", "ровь")).toBe(false);
    expect(preparationContains("abc", "abc-def")).toBe(false);
    expect("abc".length).toBeLessThan(MIN_MATCH_LENGTH);
  });

  it("атлас находит гид по удлинённому названию карточки", () => {
    const index = indexGuides([
      { key: "cytology-mitosis", name: "Митоз", structures: [] },
      { key: "ct-blood-smear", name: "Мазок крови", structures: [] },
    ]);
    const card = (name: string) => ({ preparation: { name } }) as never;
    expect(guideForCard(card("Митоз (корешок лука)"), index)?.key).toBe("cytology-mitosis");
    expect(guideForCard(card("мазок крови"), index)?.key).toBe("ct-blood-smear");
    expect(guideForCard(card(""), index)).toBeNull();
  });
});
