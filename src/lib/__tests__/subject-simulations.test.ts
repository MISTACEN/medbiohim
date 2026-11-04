import { describe, expect, it } from "vitest";
import { SIMULATIONS } from "@/lib/sim/catalog";
import { resolveSubjectAdapter, simulationsForSubject } from "@/lib/learning/subjects";

const catalogSlugs = new Set(SIMULATIONS.map((simulation) => simulation.slug));

function available(slug: string): Set<string> {
  return new Set(simulationsForSubject(slug));
}

describe("доступность моделей по предметам", () => {
  it("каждая модель существует в каталоге", () => {
    for (const subject of [
      "physiology", "histology", "chemistry_organic_physical", "inorganic_chemistry", "biology",
    ]) {
      for (const slug of simulationsForSubject(subject)) {
        expect(catalogSlugs.has(slug), `${subject} → ${slug}`).toBe(true);
      }
    }
  });

  it("обе химии получают химические модели", () => {
    for (const subject of ["chemistry_organic_physical", "inorganic_chemistry"]) {
      expect(available(subject).has("buffer-titration")).toBe(true);
      expect(available(subject).has("osmosis")).toBe(true);
    }
    expect(available("chemistry_organic_physical").has("enzyme-kinetics")).toBe(true);
  });

  it("физиология и гистология делят осмос", () => {
    expect(available("physiology").has("osmosis")).toBe(true);
    expect(available("histology").has("osmosis")).toBe(true);
    expect(available("biology").has("osmosis")).toBe(true);
  });

  it("биология получает модели о смежных механизмах", () => {
    expect(available("biology").has("enzyme-kinetics")).toBe(true);
    expect(available("biology").has("hardy-weinberg")).toBe(true);
    expect(available("biology").has("oxygen-hemoglobin")).toBe(true);
    expect(available("biology").has("membrane-potential")).toBe(true);
  });

  it("физиология получает свои модели и буферы", () => {
    expect(available("physiology").has("membrane-potential")).toBe(true);
    expect(available("physiology").has("oxygen-hemoglobin")).toBe(true);
    expect(available("physiology").has("buffer-titration")).toBe(true);
  });

  it("непрофильный предмет не получает химических моделей", () => {
    expect(simulationsForSubject("history")).toEqual([]);
    expect(simulationsForSubject("unknown-subject")).toEqual([]);
    expect(resolveSubjectAdapter("history").simulations).toEqual([]);
  });
});
