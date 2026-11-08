/**
 * Разбор файла теста, подготовленного в Word/текстовом редакторе.
 *
 * Формат, который уже используют преподаватели:
 *   1. Текст вопроса:
 *   @1. верный вариант
 *   #2. неверный вариант
 * где `@` — правильный ответ, `#` — неправильный, число после маркера — номер
 * варианта. Разделы («Раздел 1. …», «Тема 2», markdown-заголовок) становятся
 * темой вопросов.
 *
 * Маркер `#` совпадает с markdown-заголовком, поэтому варианты разбираются
 * только внутри вопроса: строка «# тема» до первого вопроса остаётся
 * заголовком, а не «неверным вариантом».
 *
 * Модуль ничего не сохраняет и не ходит в сеть: он превращает текст в вопросы
 * и список замечаний, чтобы преподаватель увидел сбитую разметку до загрузки.
 */

export type ParsedOption = { text: string; correct: boolean };

export type ParsedQuestion = {
  /** Номер из файла — по нему преподаватель находит вопрос в документе. */
  number: number | null;
  topic: string;
  text: string;
  options: ParsedOption[];
  /** Текст правильного варианта — ровно так, как он попадёт в банк. */
  answer: string;
  correctIndex: number | null;
  issues: string[];
};

export type ParsedTest = {
  title: string;
  topic: string;
  questions: ParsedQuestion[];
  /** Общие замечания по документу: нумерация, дубли, пропущенный текст. */
  issues: string[];
  stats: {
    questions: number;
    valid: number;
    invalid: number;
    options: number;
    ignoredLines: number;
    topics: string[];
  };
};

type Draft = {
  number: number | null;
  topic: string;
  lines: string[];
  options: Array<{ text: string; correct: boolean }>;
};

const QUESTION_RE = /^(\d{1,3})\s*[.)]\s+(.+)$/;
const NUMBERED_OPTION_RE = /^([@#])\s*(\d{1,2})\s*[.)]\s*(.+)$/;
const PLAIN_OPTION_RE = /^([@#])\s+(.+)$/;
const MARKDOWN_HEADING_RE = /^#{1,6}\s+(.+)$/;
const BOLD_HEADING_RE = /^\*\*(.+)\*\*$/;
const SECTION_RE = /^(раздел|тема|модуль|часть)\s*[№]?\s*\d+/i;

/** Снимает markdown-выделение, чтобы сравнения и текст были чистыми. */
function cleanInline(value: string): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: string): string {
  return value
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function stripFileExtension(name: string): string {
  return String(name || "")
    .replace(/^.*[\\/]/, "")
    .replace(/\.[^.]+$/, "")
    .trim();
}

function looksLikeHeading(line: string): boolean {
  return (
    MARKDOWN_HEADING_RE.test(line) ||
    BOLD_HEADING_RE.test(line) ||
    (SECTION_RE.test(line) && line.length <= 160)
  );
}

function headingText(line: string): string {
  const markdown = MARKDOWN_HEADING_RE.exec(line);
  if (markdown) return cleanInline(markdown[1]);
  const bold = BOLD_HEADING_RE.exec(line);
  if (bold) return cleanInline(bold[1]);
  return cleanInline(line.replace(/[.:]\s*$/, ""));
}

function optionMatch(line: string): { text: string; correct: boolean } | null {
  const numbered = NUMBERED_OPTION_RE.exec(line);
  if (numbered) {
    return { text: cleanInline(numbered[3]), correct: numbered[1] === "@" };
  }
  const plain = PLAIN_OPTION_RE.exec(line);
  if (plain) {
    return { text: cleanInline(plain[2]), correct: plain[1] === "@" };
  }
  return null;
}

function finalize(draft: Draft, seen: Map<string, number>): ParsedQuestion {
  const text = cleanInline(draft.lines.join(" "));
  const options = draft.options
    .map((option) => ({ text: cleanInline(option.text), correct: option.correct }))
    .filter((option) => option.text.length > 0);
  const correctIndexes = options.flatMap((option, index) => (option.correct ? [index] : []));
  const issues: string[] = [];

  if (!text) issues.push("нет формулировки вопроса");
  if (options.length < 2) issues.push("меньше двух вариантов ответа");
  if (correctIndexes.length === 0) issues.push("не отмечен правильный вариант (@)");
  if (correctIndexes.length > 1) {
    issues.push(`отмечено ${correctIndexes.length} правильных варианта — импорт поддерживает только один`);
  }
  const uniqueOptions = new Set(options.map((option) => normalizeKey(option.text)));
  if (uniqueOptions.size !== options.length) issues.push("повторяющиеся варианты ответа");

  const key = normalizeKey(text);
  const duplicate = seen.get(key);
  if (key && duplicate != null) issues.push(`дубликат вопроса №${duplicate}`);
  else if (key) seen.set(key, draft.number ?? 0);

  return {
    number: draft.number,
    topic: draft.topic,
    text,
    options,
    answer: correctIndexes.length === 1 ? options[correctIndexes[0]].text : "",
    correctIndex: correctIndexes.length === 1 ? correctIndexes[0] : null,
    issues,
  };
}

/**
 * @param text распознанный текст файла (.docx/.txt/.md)
 * @param fileName имя файла — из него берётся название теста по умолчанию
 */
export function parseTestDocument(text: string, fileName = ""): ParsedTest {
  const lines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n");

  const drafts: Draft[] = [];
  const issues: string[] = [];
  const topics: string[] = [];
  let topic = "";
  let ignoredLines = 0;
  let current: Draft | null = null;
  let previousNumber: number | null = null;
  let numberingGaps = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Вариант проверяем до заголовка: «# неверный вариант» иначе стал бы
    // markdown-заголовком. Вне вопроса такой строки считаем заголовком.
    const option = current ? optionMatch(line) : null;
    if (option) {
      current!.options.push(option);
      continue;
    }

    if (looksLikeHeading(line)) {
      const heading = headingText(line);
      if (heading) {
        topic = heading;
        if (!topics.includes(heading)) topics.push(heading);
      }
      continue;
    }

    const question = QUESTION_RE.exec(line);
    if (question) {
      const number = Number(question[1]);
      if (previousNumber != null && number !== previousNumber + 1 && numberingGaps < 3) {
        numberingGaps += 1;
        issues.push(`Нумерация: после №${previousNumber} идёт №${number}`);
      }
      previousNumber = number;
      current = { number, topic, lines: [question[2]], options: [] };
      drafts.push(current);
      continue;
    }

    if (!current && optionMatch(line)) {
      ignoredLines += 1;
      issues.push(`Вариант без вопроса: «${line.slice(0, 60)}»`);
      continue;
    }

    if (current) {
      // Многострочный вариант (формула, перенос строки в Word) или продолжение
      // вопроса. Вариант важнее: иначе хвост формулы попадёт в текст вопроса.
      if (current.options.length > 0) {
        const last = current.options[current.options.length - 1];
        last.text = `${last.text} ${cleanInline(line)}`.trim();
      } else {
        current.lines.push(line);
      }
      continue;
    }

    ignoredLines += 1;
    if (ignoredLines <= 3) issues.push(`Строка вне вопроса: «${line.slice(0, 60)}»`);
  }

  const seen = new Map<string, number>();
  const questions = drafts.map((draft) => finalize(draft, seen));

  if (questions.length === 0) {
    issues.push("В файле нет вопросов: ожидаются строки «1. текст» и варианты «@1. …» / «#2. …»");
  }

  const valid = questions.filter((question) => question.issues.length === 0).length;
  const firstTopic = questions.find((question) => question.topic)?.topic || topics[0] || "";

  return {
    title: stripFileExtension(fileName) || firstTopic || "Импортированный тест",
    topic: firstTopic,
    questions,
    issues,
    stats: {
      questions: questions.length,
      valid,
      invalid: questions.length - valid,
      options: questions.reduce((sum, question) => sum + question.options.length, 0),
      ignoredLines,
      topics,
    },
  };
}

/** Сводка вида «27 вопросов · 25 без замечаний · 2 проверить». */
export function describeTestParse(parsed: ParsedTest): string {
  const { questions, valid, invalid } = parsed.stats;
  const parts = [`вопросов: ${questions}`, `без замечаний: ${valid}`];
  if (invalid > 0) parts.push(`проверить: ${invalid}`);
  return parts.join(" · ");
}
