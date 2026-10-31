/**
 * Журнал преподавателя: из распознанного текста остаётся только строка
 * студента. Чужие фамилии и оценки не покидают эту функцию — вызывающий код
 * получает максимум одну строку.
 *
 * OCR намеренно не здесь: движок работает в браузере, фото не уходит на сервер.
 */

const NAME_STOPWORDS = new Set(["студент", "студентка", "группа", "подгруппа", "тема", "дата"]);

export function normalizeJournalText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[|_/\\]+/g, " ")
    .replace(/[^\p{L}\p{N}.\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(fullName: unknown): string[] {
  return normalizeJournalText(fullName)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !NAME_STOPWORDS.has(token));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Совпадение по фамилии и, если есть, по имени/инициалу. Одной фамилии мало:
 * «Иванов» в журнале может быть и преподавателем.
 */
export function lineMatchesName(line: unknown, fullName: unknown): boolean {
  const tokens = nameTokens(fullName);
  if (!tokens.length) return false;
  const normalized = normalizeJournalText(line);
  const surname = tokens[0];
  if (surname.length < 3 || !normalized.includes(surname)) return false;
  if (tokens.length < 2) return true;
  const second = tokens[1];
  const afterSurname = normalized.slice(normalized.indexOf(surname) + surname.length);
  if (afterSurname.includes(second)) return true;
  // «Иванов И.О.» после нормализации: ищем инициал отдельным словом.
  const initial = second[0];
  return new RegExp(`(?:^|\\s)${escapeRegExp(initial)}(?:[.\\s]|$)`, "u").test(afterSurname);
}

/** Оценки/отметки в строке: 2–5, зачёт, н/а, освобождён. Даты вырезаем. */
export function extractGrades(line: unknown): string[] {
  const withoutDates = String(line ?? "")
    .replace(/\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/g, " ")
    .replace(/\b20\d{2}\b/g, " ");
  const found = withoutDates.match(/(?<![\d.,])([2-5])(?![\d.,])|(?<![\p{L}])(зач[её]т|зач|н\/а|нб|осв)(?![\p{L}])/giu) || [];
  return [...new Set(found.map((value) => value.toLowerCase()))];
}

export type IsolatedRow = {
  matched: boolean;
  line: string | null;
  grades: string[];
  /** Сколько строк вообще совпало — для честного «уточните ФИО», без чужих данных. */
  candidates: number;
};

/**
 * Возвращает только свою строку. Остальные строки отбрасываются здесь и
 * никогда не попадают в UI.
 */
export function isolateStudentRow(text: unknown, fullName: unknown): IsolatedRow {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const matches = lines.filter((line) => lineMatchesName(line, fullName));
  if (!matches.length) return { matched: false, line: null, grades: [], candidates: 0 };
  // Если совпало несколько строк (шапка, подпись), берём самую «богатую»
  // оценками: у строки студента их обычно больше всего.
  const best = matches
    .map((line) => ({ line, grades: extractGrades(line) }))
    .sort((left, right) => right.grades.length - left.grades.length || right.line.length - left.line.length)[0];
  return { matched: true, line: best.line, grades: best.grades, candidates: matches.length };
}

/**
 * Для теста и для копирования: только своя строка, никакого исходного текста.
 * shortcut: журнал читается построчно, без восстановления таблицы; если OCR
 * начнёт склеивать строки, понадобится геометрия слов из Tesseract.
 */
export function redactToOwnRow(text: unknown, fullName: unknown): string {
  return isolateStudentRow(text, fullName).line || "";
}
