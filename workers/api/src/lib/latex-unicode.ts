/**
 * LaTeX → Unicode для Telegram-сообщений.
 *
 * Telegram не умеет рендерить LaTeX, а внешние рендер-сервисы добавлять нельзя
 * (бот не должен зависеть от сторонних картинок). Формулы из банка
 * `bot_formulas` и пояснения к челленджам переводятся в Unicode-текст:
 * индексы/степени — суб/суперскрипты, \frac и греческие символы — по карте.
 *
 * Дроби вида \frac{a}{b} сводятся к (a)/(b) — читаемо в чате и в аудите.
 */

const GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε",
  zeta: "ζ", eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ",
  nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ",
  phi: "φ", chi: "χ", psi: "ψ", omega: "ω", Delta: "Δ", Sigma: "Σ", Omega: "Ω",
  Pi: "Π", Lambda: "Λ", Gamma: "Γ", Theta: "Θ", Phi: "Φ", Psi: "Ψ",
};

const SYMBOLS: Record<string, string> = {
  to: "→", rightarrow: "→", Rightarrow: "⇒", leftarrow: "←", leftrightarrow: "↔",
  cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓", approx: "≈", neq: "≠",
  ne: "≠", leq: "≤", le: "≤", geq: "≥", ge: "≥", equiv: "≡", infty: "∞",
  ldots: "…", dots: "…", prime: "′", degree: "°", circ: "°", uparrow: "↑",
  downarrow: "↓", rightleftharpoons: "⇌", longrightarrow: "⟶", partial: "∂",
  sum: "Σ", prod: "Π", int: "∫", sqrt: "√", propto: "∝", perp: "⊥",
};

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶",
  "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼",
  n: "ⁿ", i: "ⁱ", "(": "⁽", ")": "⁾",
};

const SUBSCRIPT_DIGITS: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆",
  "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "−": "₋", "=": "₌",
  "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ",
  l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ",
  v: "ᵥ", x: "ₓ",
};

function toSubscript(text: string): string {
  return [...text].map((ch) => SUBSCRIPT_DIGITS[ch] ?? ch).join("");
}

function toSuperscript(text: string): string {
  return [...text].map((ch) => SUPERSCRIPT_DIGITS[ch] ?? ch).join("");
}

/**
 * Переводит LaTeX-формулу в Unicode-строку. Незнакомые команды остаются
 * как есть (\command) — формула всё равно читаема и не «теряет» контент.
 */
export function latexToUnicode(input: string): string {
  let text = String(input || "");
  if (!text.trim()) return "";

  // \frac{a}{b} → (a)/(b); \sqrt{x} → √(x). Вложенность обрабатываем итеративно.
  for (let guard = 0; guard < 10; guard += 1) {
    const frac = text.search(/\\frac\s*\{/);
    if (frac === -1) break;
    const start = text.indexOf("{", frac);
    const numerator = readGroup(text, start);
    if (!numerator) break;
    const afterNumerator = numerator.end;
    if (text[afterNumerator] !== "{") { break; }
    const denominator = readGroup(text, afterNumerator);
    if (!denominator) break;
    text = `${text.slice(0, frac)}(${numerator.body})/(${denominator.body})${text.slice(denominator.end)}`;
  }

  text = text.replace(/\\sqrt\s*\{([^{}]*)\}/g, (_m, body) => `√(${body})`);

  // \text{...} и \mathrm{...} — просто текст внутри.
  text = text.replace(/\\(?:text|mathrm|mathbf|operatorname)\s*\{([^{}]*)\}/g, (_m, body) => body);

  // Символы и греческие буквы: \alpha → α и т.д.
  text = text.replace(/\\([A-Za-z]+)/g, (m, name: string) => {
    if (GREEK[name]) return GREEK[name];
    if (SYMBOLS[name]) return SYMBOLS[name];
    return m;
  });

  // Индексы и степени: x_{12} → x₁₂, x_2 → x₂, x^{2+} → x²⁺, x^2 → x².
  text = text.replace(/_\{([^{}]+)\}/g, (_m, body: string) => toSubscript(body));
  text = text.replace(/\^\{([^{}]+)\}/g, (_m, body: string) => toSuperscript(body));
  text = text.replace(/_([A-Za-z0-9+\-−=])/g, (_m, ch: string) => toSubscript(ch));
  text = text.replace(/\^([A-Za-z0-9+\-−=])/g, (_m, ch: string) => toSuperscript(ch));

  // Лишние фигурные скобки, \left \right и шум пробелов.
  text = text.replace(/\\left|\\right/g, "");
  text = text.replace(/[{}]/g, "");
  text = text.replace(/[ \t]{2,}/g, " ").trim();
  return text;
}

/** Читает сбалансированную группу {...} начиная с позиции open (символ "{"). */
function readGroup(text: string, open: number): { body: string; end: number } | null {
  if (text[open] !== "{") return null;
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return { body: text.slice(open + 1, i), end: i + 1 };
    }
  }
  return null;
}
