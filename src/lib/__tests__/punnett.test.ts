import { describe, expect, it } from "vitest";

import { gametesFor, parseGenotype, solvePunnett } from "@/lib/genetics/punnett";

function ratio(counts: number[]): string {
  const divisor = counts.reduce((a, b) => gcd(a, b));
  return counts.map((count) => count / divisor).join(":");
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

describe("parseGenotype", () => {
  it("разбирает моно- и дигибридные генотипы", () => {
    expect(parseGenotype("Aa")?.genes.map((gene) => gene.name)).toEqual(["A"]);
    expect(parseGenotype("aa")?.genes.map((gene) => gene.name)).toEqual(["A"]);
    expect(parseGenotype("AaBb")?.genes.map((gene) => gene.name)).toEqual(["A", "B"]);
  });

  it("отвергает некорректные записи", () => {
    expect(parseGenotype("AbC")?.error).toBeTruthy();
    expect(parseGenotype("A")?.error).toBeTruthy();
    expect(parseGenotype("AaAa")?.error).toBeTruthy();
    expect(parseGenotype("")?.error).toBeTruthy();
  });
});

describe("gametesFor", () => {
  it("даёт по одной аллели на ген без повторов", () => {
    expect(gametesFor(parseGenotype("Aa")!.genes)).toEqual(["A", "a"]);
    expect(gametesFor(parseGenotype("aa")!.genes)).toEqual(["a"]);
    expect(gametesFor(parseGenotype("AaBb")!.genes)).toEqual(["AB", "Ab", "aB", "ab"]);
  });
});

describe("solvePunnett", () => {
  it("Aa × Aa → расщепление 3:1, генотипы 1:2:1", () => {
    const result = solvePunnett({ parentA: "Aa", parentB: "Aa" });
    if (!result.ok) throw new Error("решение должно быть успешным");
    expect(result.offspringCount).toBe(4);
    expect(ratio(result.phenotypes.map((p) => p.count))).toBe("3:1");
    expect(ratio(result.genotypes.map((g) => g.count))).toBe("1:2:1");
    expect(result.grid).toHaveLength(2);
    expect(result.grid[0]).toHaveLength(2);
  });

  it("AaBb × AaBb → 9:3:3:1", () => {
    const result = solvePunnett({ parentA: "AaBb", parentB: "AaBb" });
    if (!result.ok) throw new Error("решение должно быть успешным");
    expect(result.offspringCount).toBe(16);
    expect(result.gametesA).toHaveLength(4);
    expect(ratio(result.phenotypes.map((p) => p.count))).toBe("9:3:3:1");
    expect(result.phenotypes[0].probability).toBeCloseTo(56.25, 5);
  });

  it("Aa × aa → 1:1", () => {
    const result = solvePunnett({ parentA: "Aa", parentB: "aa" });
    if (!result.ok) throw new Error("решение должно быть успешным");
    expect(result.offspringCount).toBe(2);
    expect(ratio(result.phenotypes.map((p) => p.count))).toBe("1:1");
    expect(ratio(result.genotypes.map((g) => g.count))).toBe("1:1");
  });

  it("счётчик потомков равен произведению числа гамет родителей", () => {
    const cases: Array<[string, string]> = [
      ["Aa", "Aa"],
      ["Aa", "aa"],
      ["AaBb", "AaBb"],
      ["AaBb", "aabb"],
      ["aa", "aa"],
    ];
    for (const [parentA, parentB] of cases) {
      const result = solvePunnett({ parentA, parentB });
      if (!result.ok) throw new Error("решение должно быть успешным");
      expect(result.offspringCount).toBe(result.gametesA.length * result.gametesB.length);
      const gridTotal = result.grid.reduce(
        (total, row) => total + row.length,
        0,
      );
      expect(gridTotal).toBe(result.offspringCount);
      const sumCounts = result.genotypes.reduce((total, item) => total + item.count, 0);
      expect(sumCounts).toBe(result.offspringCount);
    }
  });

  it("ошибки ввода валидируются", () => {
    expect(solvePunnett({ parentA: "Aa", parentB: "AaBb" }).ok).toBe(false);
    expect(solvePunnett({ parentA: "Xx", parentB: "Aa" }).ok).toBe(false);
    expect(solvePunnett({ parentA: "", parentB: "Aa" }).ok).toBe(false);
  });
});
