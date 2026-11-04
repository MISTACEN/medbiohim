import { describe, expect, it } from "vitest";

import { balanceEquation, parseFormula } from "@/lib/chemistry/balance";

describe("парсер формул", () => {
  it("читает простые и индексные формулы", () => {
    expect(parseFormula("KMnO4")).toEqual({ elements: { K: 1, Mn: 1, O: 4 }, charge: 0 });
    expect(parseFormula("H2O")).toEqual({ elements: { H: 2, O: 1 }, charge: 0 });
    expect(parseFormula("Fe(OH)3")).toEqual({ elements: { Fe: 1, O: 3, H: 3 }, charge: 0 });
  });

  it("разбирает вложенные скобки Ca3(PO4)2", () => {
    expect(parseFormula("Ca3(PO4)2")).toEqual({ elements: { Ca: 3, P: 2, O: 8 }, charge: 0 });
  });

  it("читает заряд иона: одноэлементный, со пробелом и без цифр", () => {
    // Цифра вплотную к знаку при одноэлементном остатке — это заряд (Fe²⁺).
    expect(parseFormula("[Fe3+]")).toEqual({ elements: { Fe: 1 }, charge: 3 });
    // Пробел явно отделяет заряд от формулы.
    expect(parseFormula("[SO4 2-]")).toEqual({ elements: { S: 1, O: 4 }, charge: -2 });
    // Цифра 4 здесь — часть формулы MnO₄⁻, заряд −1.
    expect(parseFormula("[MnO4-]")).toEqual({ elements: { Mn: 1, O: 4 }, charge: -1 });
    expect(parseFormula("[Cl-]")).toEqual({ elements: { Cl: 1 }, charge: -1 });
  });

  it("возвращает null на мусор вместо исключения", () => {
    expect(parseFormula("")).toBeNull();
    expect(parseFormula("Xx2O3")).toBeNull();
    expect(parseFormula("H2(")).toBeNull();
    expect(parseFormula("[Fe3+")).toBeNull();
  });
});

describe("балансировка уравнений", () => {
  it("CH4 + O2 -> CO2 + H2O", () => {
    const result = balanceEquation("CH4 + O2 -> CO2 + H2O");
    expect(result.ok).toBe(true);
    expect(result.coefficients).toEqual([1, 2, 1, 2]);
    expect(result.atomCheck).toBe(true);
    expect(result.chargeCheck).toBe(true);
    expect(result.balanced).toBe("CH4 + 2 O2 -> CO2 + 2 H2O");
  });

  it("KMnO4 + HCl: классическое окислительное уравнение", () => {
    const result = balanceEquation("KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2");
    expect(result.ok).toBe(true);
    expect(result.coefficients).toEqual([2, 16, 2, 2, 8, 5]);
    expect(result.atomCheck).toBe(true);
    expect(result.chargeCheck).toBe(true);
    expect(result.balanced).toBe("2 KMnO4 + 16 HCl -> 2 KCl + 2 MnCl2 + 8 H2O + 5 Cl2");
  });

  it("Fe2O3 + Al -> Fe + Al2O3 (алюминотермия)", () => {
    const result = balanceEquation("Fe2O3 + Al -> Fe + Al2O3");
    expect(result.ok).toBe(true);
    expect(result.coefficients).toEqual([1, 2, 2, 1]);
    expect(result.balanced).toBe("Fe2O3 + 2 Al -> 2 Fe + Al2O3");
  });

  it("NH3 + O2 -> NO + H2O (окисление аммиака)", () => {
    const result = balanceEquation("NH3 + O2 -> NO + H2O");
    expect(result.ok).toBe(true);
    expect(result.coefficients).toEqual([4, 5, 4, 6]);
  });

  it("Ca3(PO4)2 + SiO2 + C -> CaSiO3 + CO + P4 (скобки и три реагента)", () => {
    const result = balanceEquation("Ca3(PO4)2 + SiO2 + C -> CaSiO3 + CO + P4");
    expect(result.ok).toBe(true);
    expect(result.coefficients).toEqual([2, 6, 10, 6, 10, 1]);
  });

  it("C2H6O + O2 -> CO2 + H2O (этанол)", () => {
    const result = balanceEquation("C2H6O + O2 -> CO2 + H2O");
    expect(result.ok).toBe(true);
    expect(result.coefficients).toEqual([1, 3, 2, 3]);
  });

  it("ионная реакция: заряд сохраняется вместе с атомами", () => {
    const result = balanceEquation("[Fe2+] + [MnO4-] + [H+] -> [Fe3+] + [Mn2+] + H2O");
    expect(result.ok).toBe(true);
    expect(result.coefficients).toEqual([5, 1, 8, 5, 1, 4]);
    expect(result.atomCheck).toBe(true);
    expect(result.chargeCheck).toBe(true);
    expect(result.balanced).toBe("5 [Fe2+] + [MnO4-] + 8 [H+] -> 5 [Fe3+] + [Mn2+] + 4 H2O");
  });

  it("осаждение [Ag+] + [Cl-] -> AgCl", () => {
    const result = balanceEquation("[Ag+] + [Cl-] -> AgCl");
    expect(result.ok).toBe(true);
    expect(result.coefficients).toEqual([1, 1, 1]);
  });

  it("принимает стрелку → и знак =", () => {
    expect(balanceEquation("NH3 + O2 → NO + H2O").coefficients).toEqual([4, 5, 4, 6]);
    expect(balanceEquation("NH3 + O2 = NO + H2O").coefficients).toEqual([4, 5, 4, 6]);
  });
});

describe("некорректный ввод возвращает ok:false, а не падает", () => {
  it("пустая строка и отсутствие стрелки", () => {
    expect(balanceEquation("").ok).toBe(false);
    expect(balanceEquation("H2O").ok).toBe(false);
    expect(balanceEquation("H2 + O2 H2O").error).toMatch(/знак реакции/);
  });

  it("пустая сторона или слагаемое", () => {
    expect(balanceEquation("-> H2O").error).toMatch(/левая/);
    expect(balanceEquation("H2O ->").error).toMatch(/правая/);
    expect(balanceEquation("H2 + + O2 -> H2O").error).toMatch(/Пустое слагаемое/);
  });

  it("неизвестный элемент и коэффициент в формуле", () => {
    expect(balanceEquation("Xx2O3 + Al -> Xx + Al2O3").error).toMatch(/Неизвестный элемент/);
    expect(balanceEquation("2 H2 + O2 -> H2O").error).toMatch(/коэффициент/);
  });

  it("вырожденная система", () => {
    // H2 -> H2O: два неизвестных, два независимых уравнения — только нулевое решение.
    expect(balanceEquation("H2 -> H2O").error).toMatch(/вырождена/);
  });

  it("уравнение, которое нельзя сбалансировать положительными числами", () => {
    // Электрон не сохраняется «по построению»: заряд не сойдётся ни при каких коэффициентах.
    const result = balanceEquation("[Na+] + [e-] -> Na");
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
