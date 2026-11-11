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

/**
 * Индексы и заряды в готовом HTML лекции.
 *
 * В отличие от chemicalFormulaHtml текст НЕ экранируется: он уже прошёл
 * escapeHtml в mdToHtml, повторное экранирование сломало бы &gt; и &amp;.
 * Блоки формул (LaTeX), код и преформат не трогаем — там свои правила.
 */
export function chemicalFormulaInHtml(html: string): string {
  const guarded: string[] = [];
  const protectedHtml = String(html || "").replace(
    /<span class="lec-math">[\s\S]*?<\/span>|<code>[\s\S]*?<\/code>|<pre[\s\S]*?<\/pre>|<a\b[^>]*>[\s\S]*?<\/a>/gi,
    (chunk) => {
      guarded.push(chunk);
      return `\u0000${guarded.length - 1}\u0000`;
    }
  );
  const converted = protectedHtml
    // H2SO4 → H<sub>2</sub>SO<sub>4</sub>: цифры после буквы или скобки —
    // индекс, в том числе когда дальше идёт ещё один элемент (H2 → O).
    .replace(/([A-Za-z)\]}])(\d+)/g, "$1<sub>$2</sub>")
    .replace(/\^\{?([0-9]*[+\-−])\}?/g, "<sup>$1</sup>");
  return converted.replace(/\u0000(\d+)\u0000/g, (_m, index) => guarded[Number(index)] ?? "");
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
