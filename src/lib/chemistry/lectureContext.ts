/**
 * Мост «текст лекции → химическая панель».
 *
 * Панель открывается не на пустом разделе, а там, где студенту нужно:
 *  • в лекции есть уравнения реакций — раздел «Реакции», первое уравнение уже
 *    подставлено и посчитано;
 *  • есть только формулы веществ — раздел «Структуры» с первым веществом;
 *  • ничего химического нет — поведение прежнее (структуры, glucose).
 *
 * Разбор намеренно консервативный: берём только те уравнения, которые решатель
 * действительно может уравнять, и только те вещества, которые парсер формул
 * понимает. Лучше пустая панель, чем подставленный мусор из прозы.
 */
import { balanceEquation, parseFormula } from "./balance";

export type LectureChemSection = "structures" | "reactions" | null;

export type LectureChemContext = {
  /** Раздел, на котором открыть панель; null — оставить выбор по умолчанию. */
  section: LectureChemSection;
  /** Первое уравнение лекции в форме, которую понимает решатель. */
  equation: string | null;
  equations: string[];
  /** Формулы веществ в порядке первого упоминания. */
  substances: string[];
};

const ARROW = /(?:⟶|→|⇌|↔|->|=>)/;

/** В лекциях формулы набраны нижними индексами: C₆H₆ — решателю нужен C6H6. */
function normalizeChemText(text: string): string {
  return text
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (char) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(char)))
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (char) => String("⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(char)));
}

const FORMULA_TOKEN = /(?:[A-Z][a-z]?\d*)+(?:\([A-Za-z0-9]+\)\d*)*/g;

const EQUATION_LIMIT = 3;
const SUBSTANCE_LIMIT = 8;

function cleanTerm(raw: string): string {
  return raw
    .replace(/^[\s*_`>«"'([{]+/, "")
    .replace(/[\s*_`»"'.,;:!?)\]}]+$/, "")
    .replace(/\s+\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isFormula(term: string): boolean {
  if (!term || !/[A-Z]/.test(term)) return false;
  return parseFormula(term) !== null;
}

/** Решатель сам расставляет коэффициенты и отвергает формулы с ними. */
function withoutCoefficient(term: string): string {
  return term.replace(/^\d+\s*/, "");
}

/**
 * Формула внутри куска строки: слева от стрелки проза стоит перед формулой,
 * поэтому берём последнюю, справа — первую.
 */
function formulaIn(part: string, side: "left" | "right"): string {
  const cleaned = cleanTerm(part);
  const matches = [...cleaned.matchAll(/(?:[A-Z][a-z]?\d*)+(?:\([A-Za-z0-9]+\)\d*)*/g)].map((match) => match[0]);
  if (!matches.length) return "";
  const picked = side === "left" ? matches[matches.length - 1] : matches[0];
  return withoutCoefficient(picked);
}

/** Слева от стрелки берём хвост из формул, справа — начало; прозу отрезаем. */
function sidesAround(line: string, arrowIndex: number, arrowLength: number): { left: string; right: string } | null {
  const leftParts = line.slice(0, arrowIndex).split(/\s+\+\s+/);
  const rightParts = line.slice(arrowIndex + arrowLength).split(/\s+\+\s+/);

  const left: string[] = [];
  for (let index = leftParts.length - 1; index >= 0; index -= 1) {
    const term = formulaIn(leftParts[index], "left");
    if (!isFormula(term)) break;
    left.unshift(term);
  }

  const right: string[] = [];
  for (const part of rightParts) {
    const term = formulaIn(part, "right");
    if (!isFormula(term)) break;
    right.push(term);
  }

  if (!left.length || !right.length) return null;
  return { left: left.join(" + "), right: right.join(" + ") };
}

function equationsInLine(line: string): string[] {
  const found: string[] = [];
  const arrow = ARROW.exec(line);
  if (!arrow) return found;
  const sides = sidesAround(line, arrow.index, arrow[0].length);
  if (!sides) return found;
  const candidate = `${sides.left} -> ${sides.right}`;
  if (balanceEquation(candidate).ok) found.push(candidate);
  return found;
}

function collectEquations(text: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    for (const equation of equationsInLine(line)) {
      if (seen.has(equation)) continue;
      seen.add(equation);
      result.push(equation);
      if (result.length >= EQUATION_LIMIT) return result;
    }
  }
  return result;
}

function collectSubstances(text: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(FORMULA_TOKEN)) {
    const token = cleanTerm(match[0]);
    if (!isFormula(token)) continue;
    // Одиночный элемент («Na», «Cl») — тоже вещество, но оно почти всегда
    // случайная буква в прозе; берём его только если есть цифры или пары.
    if (!/\d/.test(token) && token.length <= 3) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    result.push(token);
    if (result.length >= SUBSTANCE_LIMIT) break;
  }
  return result;
}

export function lectureChemContext(markdown: string): LectureChemContext {
  const text = normalizeChemText(String(markdown || ""));
  if (!text.trim()) return { section: null, equation: null, equations: [], substances: [] };
  const equations = collectEquations(text);
  const substances = collectSubstances(text);
  return {
    section: equations.length ? "reactions" : substances.length ? "structures" : null,
    equation: equations[0] ?? null,
    equations,
    substances,
  };
}
