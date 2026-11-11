import { describe, expect, it } from "vitest";
import { chemicalFormulaHtml, chemicalFormulaInHtml } from "@/lib/chemistry/formula";

describe("chemicalFormulaHtml", () => {
  it("ставит индексы и заряды и экранирует HTML", () => {
    expect(chemicalFormulaHtml("H2SO4")).toBe("H<sub>2</sub>SO<sub>4</sub>");
    expect(chemicalFormulaHtml("Ca(OH)2")).toBe("Ca(OH)<sub>2</sub>");
    expect(chemicalFormulaHtml("Fe^3+")).toBe("Fe<sup>3+</sup>");
    expect(chemicalFormulaHtml("<b>H2O</b>")).toBe("&lt;b&gt;H<sub>2</sub>O&lt;/b&gt;");
  });
});

describe("chemicalFormulaInHtml", () => {
  it("превращает формулы в готовом HTML лекции", () => {
    expect(chemicalFormulaInHtml("<p>Кислота H2SO4 и оксид CO2</p>")).toBe(
      "<p>Кислота H<sub>2</sub>SO<sub>4</sub> и оксид CO<sub>2</sub></p>"
    );
    expect(chemicalFormulaInHtml("<p>Ион Fe^2+</p>")).toBe("<p>Ион Fe<sup>2+</sup></p>");
  });

  it("не портит уже экранированные символы", () => {
    expect(chemicalFormulaInHtml("<p>a &gt; b, H2O</p>")).toBe("<p>a &gt; b, H<sub>2</sub>O</p>");
  });

  it("не трогает код, LaTeX и ссылки", () => {
    expect(chemicalFormulaInHtml("<code>H2O</code>")).toBe("<code>H2O</code>");
    expect(chemicalFormulaInHtml('<span class="lec-math">\\(x2\\)</span>')).toBe(
      '<span class="lec-math">\\(x2\\)</span>'
    );
    expect(chemicalFormulaInHtml('<a href="/x">C6H6</a>')).toBe('<a href="/x">C6H6</a>');
  });
});
