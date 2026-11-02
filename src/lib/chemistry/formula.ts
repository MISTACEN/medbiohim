/**
 * Химические формулы прямо в тексте лекции.
 *
 * Автор набирает обычную строку (H2SO4, Fe^3+, Ca(OH)2), а в лекции она
 * становится формулой с индексами и зарядами. Полноценные структурные фигуры
 * остаются в блоке «Химия» (SMILES/CID), это дополнение для быстрых записей.
 */

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** H2SO4 → H₂SO₄, Ca(OH)2 → Ca(OH)₂, Fe^3+ → Fe³⁺. */
export function chemicalFormulaHtml(input: string): string {
  return escapeHtml(String(input || "").trim())
    .replace(/([A-Za-z)\]}])(\d+)/g, "$1<sub>$2</sub>")
    .replace(/\^\{?([0-9]*[+\-−])\}?/g, "<sup>$1</sup>");
}

/** Готовая строка для вставки в лекцию. */
export function chemicalFormulaMarkup(input: string): string {
  return '<span class="lec-chemical">' + chemicalFormulaHtml(input) + "</span>";
}

/** Обратное преобразование для поиска и экспорта: H₂SO₄ → H2SO4. */
export function chemicalFormulaPlain(input: string): string {
  return String(input || "")
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (digit) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(digit)))
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]/g, (sign) => {
      const index = "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻".indexOf(sign);
      return index < 10 ? String(index) : index === 10 ? "+" : "-";
    });
}
