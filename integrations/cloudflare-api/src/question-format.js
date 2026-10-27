/**
 * Единая нормализация тестовых вопросов.
 *
 * В базе исторически соседствуют несколько форматов закрытых вопросов:
 *   - options: ["текст", …], answer: "2"        (0-based индекс, старые банки);
 *   - options: [{label, correct}], answer: "3"  (готовые флаги);
 *   - options: ["1) …", …], answer: "3"         (нумерация внутри варианта, 1-based);
 *   - options: ["…"], answer: "Верный ответ: 2) …" (читаемый эталон физиологии);
 *   - options: ["…"], answer: "ньютон"           (эталон совпадает с текстом варианта);
 *   - options: ["…"], answer: "В"                (буква варианта).
 *
 * Модуль приводит всё это к одному виду: у каждого варианта есть `key`
 * (буква А/Б/В или исходный номер), `label` без служебной нумерации и
 * `correct`; текст эталона превращается в понятную строку
 * «Б) текст варианта» или «1) … → 2) …» для вопросов на последовательность.
 *
 * Модуль намеренно не бросает исключений и не ходит в сеть, чтобы его можно
 * было использовать и в Worker, и в тестах Node.
 */

const OPEN_TYPES = new Set([
  "open", "text", "short_answer", "short-answer", "theory", "problem",
  "practical", "case", "preparation", "ticket", "essay",
]);

const CLOSED_TYPES = new Set([
  "mcq", "mc", "multiple", "multi", "multi_choice", "multi-choice",
  "single", "single_choice", "single-choice", "closed", "choice", "test",
  "quiz", "ordering",
]);

const LETTER_KEYS = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ".split("");

const CYRILLIC_LETTERS = {
  А: 0, Б: 1, В: 2, Г: 3, Д: 4, Е: 5, Ё: 5, Ж: 6, З: 7, И: 8, Й: 9,
  К: 10, Л: 11, М: 12, Н: 13, О: 14, П: 15, Р: 16, С: 17, Т: 18, У: 19,
  Ф: 20, Х: 21, Ц: 22, Ч: 23, Ш: 24, Щ: 25, Э: 26, Ю: 27, Я: 28,
};

const LATIN_LETTERS = {
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9,
  K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18,
  T: 19, U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
};

const HTML_ENTITIES = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
  "&quot;": '"', "&#39;": "'", "&apos;": "'",
};

/** Убирает HTML, чтобы сравнивать смысл, а не разметку. */
export function plainText(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (m) => HTML_ENTITIES[m] ?? " ");
}

/** Нормализация для сравнения ответов и вариантов. */
export function normalizedAnswer(value) {
  return plainText(value)
    .normalize("NFKC")
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[—–−]/g, "-")
    .replace(/[«»„""'’]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function letterIndex(token) {
  const value = String(token || "").trim();
  if (value.length !== 1) return -1;
  const upper = value.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(CYRILLIC_LETTERS, upper)) return CYRILLIC_LETTERS[upper];
  if (Object.prototype.hasOwnProperty.call(LATIN_LETTERS, upper)) return LATIN_LETTERS[upper];
  return -1;
}

function isLatinLetter(token) {
  return /^[A-Za-z]$/.test(String(token || ""));
}

function isCyrillicLetter(token) {
  return /^[А-ЯЁа-яё]$/.test(String(token || ""));
}

/**
 * Служебная нумерация варианта: «1) …», «(2) …», «А. …».
 * Не считает нумерацией «60-63 %» или «2,4-ДНФГ».
 */
function optionMarker(label) {
  const raw = String(label ?? "");
  const close = /^\s*\(?([0-9]{1,2}|[А-ЯЁа-яёA-Za-z])\)\s*/.exec(raw);
  if (close) return { key: close[1].toUpperCase(), text: raw.slice(close[0].length).trim() };
  const numericDotted = /^\s*([0-9]{1,2})[.:\-–]\s+/.exec(raw);
  if (numericDotted) return { key: numericDotted[1], text: raw.slice(numericDotted[0].length).trim() };
  // «Г. Галилеем» — это фамилия с инициалом, а не маркер «Г.». Буквенный
  // маркер через точку считаем только перед строчным словом: «А. вариант».
  const letterDotted = /^\s*([А-ЯЁA-Z])\.\s+(?=\p{Ll})/u.exec(raw);
  if (letterDotted) return { key: letterDotted[1].toUpperCase(), text: raw.slice(letterDotted[0].length).trim() };
  return null;
}

/** Разбирает options из JSON/JSONB/массива в плоскую структуру. */
export function parseOptions(raw) {
  let value = raw;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      value = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const parsed = [];
  for (const item of value) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const label = String(
        item.label ?? item.text ?? item.title ?? item.value ?? item.option ?? "",
      ).trim();
      if (!label) continue;
      parsed.push({
        id: item.id != null ? String(item.id) : undefined,
        key: item.key != null ? String(item.key) : undefined,
        label,
        rawLabel: label,
        correct:
          item.correct === true ||
          item.is_correct === true ||
          item.isCorrect === true ||
          item.is_answer === true ||
          item.isAnswer === true,
      });
    } else {
      const label = String(item ?? "").trim();
      if (!label) continue;
      parsed.push({ label, rawLabel: label, correct: false });
    }
  }
  return parsed;
}

function withKeys(options) {
  if (!options.length) return [];
  const markers = options.map((option) => optionMarker(option.rawLabel));
  const numericMarkers = markers.every((marker) => marker && /^[0-9]+$/.test(marker.key));
  const letterMarkers = markers.every((marker) => marker && /^[А-ЯЁA-Z]$/i.test(marker.key));
  return options.map((option, index) => {
    const marker = markers[index];
    let key;
    if (numericMarkers) key = String(index + 1);
    else if (letterMarkers && !marker) key = LETTER_KEYS[index] || String(index + 1);
    else if (letterMarkers) key = marker.key.toUpperCase();
    else if (marker) key = marker.key.toUpperCase();
    else if (option.key) key = String(option.key).toUpperCase();
    else key = LETTER_KEYS[index] || String(index + 1);
    const label = marker ? marker.text : option.label;
    return {
      ...option,
      label: label || option.label,
      key,
      marker: marker ? marker.key : null,
    };
  });
}

function findOptionByText(options, text) {
  const target = normalizedAnswer(text);
  if (!target) return -1;
  const matches = [];
  options.forEach((option, index) => {
    if (normalizedAnswer(option.label) === target) matches.push(index);
  });
  return matches.length === 1 ? matches[0] : -1;
}

function findOptionByMarker(options, number) {
  const token = String(number);
  const matches = [];
  options.forEach((option, index) => {
    const marker = optionMarker(option.rawLabel);
    if (marker && marker.key === token && /^[0-9]+$/.test(marker.key)) matches.push(index);
  });
  return matches.length === 1 ? matches[0] : -1;
}

function splitTokens(value) {
  return String(value || "")
    .split(/[,;/|]|\s+и\s+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

/** Пары «2) текст» из читаемого эталона. */
function readablePairs(answer) {
  const source = String(answer || "");
  if (!source.includes(")")) return [];
  const pairs = [];
  // Хвостовая «;» и двойная «;;» — обычный формат физиологии; поэтому
  // режем по «;» без lookahead, иначе одиночная пара с «;» не находится.
  const regex = /([0-9]{1,2})\)\s*([^;]+)/g;
  let match;
  while ((match = regex.exec(source))) {
    const text = match[2].trim();
    if (text) pairs.push({ number: Number(match[1]), text });
  }
  return pairs;
}

function stripAnswerPrefix(value) {
  return String(value ?? "")
    .replace(/^\s*(?:верный|правильный|эталонный|correct|reference)\s*ответ\s*[:\-–]\s*/i, "")
    .trim();
}

/**
 * Сопоставляет эталон с вариантами.
 * @returns {{indexes:number[], order:number[]|null, method:string}}
 */
export function resolveCorrectIndexes(options, answer) {
  const list = Array.isArray(options) ? options : [];
  const length = list.length;
  const flagged = [];
  list.forEach((option, index) => {
    if (option && option.correct === true) flagged.push(index);
  });
  if (flagged.length) return { indexes: flagged, order: null, method: "options.correct" };

  const raw = stripAnswerPrefix(answer);
  if (!raw) return { indexes: [], order: null, method: "empty" };

  // 1. Читаемый эталон: «Верный ответ: 2) тормозится».
  const pairs = readablePairs(raw);
  if (pairs.length) {
    const indexes = [];
    for (const pair of pairs) {
      const byText = findOptionByText(list, pair.text);
      if (byText >= 0) indexes.push(byText);
      else if (pair.number >= 1 && pair.number <= length) indexes.push(pair.number - 1);
    }
    if (indexes.length) {
      return { indexes: [...new Set(indexes)].sort((a, b) => a - b), order: null, method: "readable" };
    }
  }

  // 2. Эталон целиком совпадает с текстом варианта: «ньютон», «0», «5».
  const byWholeText = findOptionByText(list, raw);
  if (byWholeText >= 0) return { indexes: [byWholeText], order: null, method: "text" };

  // 3. Буквенный эталон: «В», «Б», «a, c».
  const tokens = splitTokens(raw);
  if (tokens.length && tokens.every((token) => isLatinLetter(token) || isCyrillicLetter(token))) {
    const indexes = tokens.map(letterIndex).filter((index) => index >= 0 && index < length);
    if (indexes.length === tokens.length) {
      return {
        indexes: [...new Set(indexes)].sort((a, b) => a - b),
        order: null,
        method: "letter",
      };
    }
  }

  // 4. Числовой эталон.
  if (/^[0-9]+$/.test(raw)) {
    const number = Number(raw);
    const byMarker = findOptionByMarker(list, number);
    if (byMarker >= 0) return { indexes: [byMarker], order: null, method: "marker" };

    // Исторические банки (legacy_ticks, histology-mbh, local) хранят 0-based индекс.
    if (number >= 0 && number < length) {
      return { indexes: [number], order: null, method: "index-0" };
    }
    // Крайний случай: 1-based номер последнего варианта.
    if (number >= 1 && number <= length) {
      return { indexes: [number - 1], order: null, method: "index-1" };
    }
    // Вопрос на последовательность: «123» = 1 → 2 → 3.
    if (raw.length > 1) {
      const digits = raw.split("").map(Number);
      if (digits.every((digit) => digit >= 1 && digit <= length)) {
        return { indexes: [], order: digits.map((digit) => digit - 1), method: "sequence" };
      }
    }
    return { indexes: [], order: null, method: "unresolved" };
  }

  // 5. Несколько чисел через запятую: «1,3» / «1;3».
  if (tokens.length > 1 && tokens.every((token) => /^[0-9]+$/.test(token))) {
    const indexes = [];
    for (const token of tokens) {
      const number = Number(token);
      const byMarker = findOptionByMarker(list, number);
      if (byMarker >= 0) indexes.push(byMarker);
      else if (number >= 0 && number < length) indexes.push(number);
      else if (number >= 1 && number <= length) indexes.push(number - 1);
    }
    if (indexes.length === tokens.length) {
      return {
        indexes: [...new Set(indexes)].sort((a, b) => a - b),
        order: null,
        method: "multi",
      };
    }
  }

  return { indexes: [], order: null, method: "unresolved" };
}

/** Человекочитаемый эталон по уже нормализованным вариантам. */
export function buildAnswerDisplay(options, resolution, answer) {
  const list = Array.isArray(options) ? options : [];
  if (resolution?.order?.length) {
    return resolution.order
      .map((index) => {
        const option = list[index];
        return option ? `${option.key}) ${option.label}` : "";
      })
      .filter(Boolean)
      .join(" → ");
  }
  if (resolution?.indexes?.length) {
    return resolution.indexes
      .map((index) => {
        const option = list[index];
        return option ? `${option.key}) ${option.label}` : "";
      })
      .filter(Boolean)
      .join("; ");
  }
  return String(answer ?? "").trim();
}

/**
 * Извлекает варианты, записанные прямо в тексте вопроса:
 * «…? 1) … 2) … 3) …» или «…?\nА) …\nБ) …».
 * Возвращает null, если список не похож на варианты ответа.
 */
export function extractOptionsFromText(text) {
  const source = plainText(text).replace(/\r\n/g, "\n").trim();
  if (source.length < 12) return null;

  const attempts = [
    { regex: /(?:^|\n)\s*([0-9]{1,2})[).]\s+/g, kind: "number" },
    { regex: /(?:^|\n)\s*([А-ЯЁA-Z])[).]\s+/g, kind: "letter" },
    { regex: /(?:^|\s)([0-9]{1,2})[).]\s+/g, kind: "number" },
    { regex: /(?:^|\s)([А-ЯЁA-Z])[).]\s+/g, kind: "letter" },
  ];

  for (const attempt of attempts) {
    const matches = [...source.matchAll(attempt.regex)];
    if (matches.length < 2) continue;
    const keys = matches.map((match) => match[1].toUpperCase());
    const valid = attempt.kind === "number"
      ? keys.every((key, index) => key === String(index + 1))
      : keys.every((key, index) => (letterIndex(key) | 0) === index);
    if (!valid) continue;

    const first = matches[0];
    const stem = source.slice(0, first.index).replace(/[\s:;,.\-–—]+$/, "").trim();
    if (stem.length < 8) continue;

    const options = [];
    let broken = false;
    for (let index = 0; index < matches.length; index += 1) {
      const start = matches[index].index + matches[index][0].length;
      const end = index + 1 < matches.length ? matches[index + 1].index : source.length;
      const label = source.slice(start, end).replace(/\s+/g, " ").trim();
      if (label.length < 1 || label.length > 800) {
        broken = true;
        break;
      }
      options.push(label);
    }
    if (broken || options.length < 2) continue;
    return { stem, options, keys };
  }
  return null;
}

/**
 * Полная нормализация вопроса.
 *
 * @param {{type?:string,text?:string,body?:string,answer?:unknown,options?:unknown}} input
 * @param {{extractTextOptions?:boolean}} [settings]
 */
export function normalizeQuestion(input, settings = {}) {
  const type = String(input?.type || "open").toLowerCase();
  let text = String(input?.text ?? input?.body ?? "");
  const answer = input?.answer == null ? "" : String(input.answer);
  let options = withKeys(parseOptions(input?.options));

  // Закрытый вопрос без массива options, но с вариантами в тексте.
  if (
    settings.extractTextOptions &&
    options.length < 2 &&
    (CLOSED_TYPES.has(type) || options.length >= 2)
  ) {
    const extracted = extractOptionsFromText(text);
    if (extracted) {
      const candidate = withKeys(parseOptions(extracted.options.map((label, index) => ({
        label: `${extracted.keys?.[index] ?? index + 1}) ${label}`,
      }))));
      const candidateResolution = resolveCorrectIndexes(candidate, answer);
      if (candidateResolution.indexes.length || candidateResolution.order) {
        options = candidate;
        text = extracted.stem;
      }
    }
  }

  const resolution = resolveCorrectIndexes(options, answer);
  const correct = new Set(resolution.indexes);
  const normalizedOptions = options.map((option, index) => ({
    key: option.key,
    label: option.label,
    ...(option.id ? { id: option.id } : {}),
    correct: correct.has(index),
  }));

  // Если тип не задан явно (например, exam_questions), вопрос с вариантами — закрытый.
  const explicitlyOpen = OPEN_TYPES.has(type);
  const isClosed = normalizedOptions.length >= 2
    ? !explicitlyOpen || CLOSED_TYPES.has(type)
    : CLOSED_TYPES.has(type);

  const resolved = resolution.indexes.length > 0 || Boolean(resolution.order);
  const correctKeys = resolution.indexes.map((index) => normalizedOptions[index]?.key).filter(Boolean);

  return {
    type,
    text,
    answer,
    is_closed: isClosed,
    options: normalizedOptions,
    correct_keys: correctKeys,
    correct_indexes: resolution.indexes,
    order_indexes: resolution.order || [],
    requires_order: Boolean(resolution.order?.length),
    allow_multiple: resolution.indexes.length > 1,
    resolution: resolution.method,
    resolved,
    answer_display: isClosed
      ? buildAnswerDisplay(normalizedOptions, resolution, answer)
      : answer,
  };
}

/** Варианты без признака правильности (для режима экзамена). */
export function publicOptions(question, reveal = true) {
  const options = Array.isArray(question?.options) ? question.options : [];
  return options.map((option) => {
    const out = { key: option.key, label: option.label };
    if (reveal) out.correct = option.correct === true;
    return out;
  });
}

function optionIndexForToken(question, token) {
  const options = Array.isArray(question?.options) ? question.options : [];
  const value = String(token ?? "").trim();
  if (!value) return -1;

  const byKey = options.findIndex((option) => String(option.key).toUpperCase() === value.toUpperCase());
  if (byKey >= 0) return byKey;

  const byText = findOptionByText(options, value);
  if (byText >= 0) return byText;

  const letter = letterIndex(value);
  if (letter >= 0 && letter < options.length) return letter;

  if (/^[0-9]+$/.test(value)) {
    const number = Number(value);
    const byMarker = findOptionByMarker(options, number);
    if (byMarker >= 0) return byMarker;
    if (number >= 0 && number < options.length) return number;
    if (number >= 1 && number <= options.length) return number - 1;
  }
  return -1;
}

function parseGiven(given) {
  if (Array.isArray(given)) return given.map(String).filter(Boolean);
  if (typeof given === "string") {
    const trimmed = given.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
      } catch {
        /* обычная строка */
      }
    }
    return splitTokens(trimmed);
  }
  if (given == null) return [];
  return [String(given)];
}

/**
 * Проверка ответа на закрытый вопрос.
 * @returns {{is_correct:boolean|null, selected_keys:string[], correct_keys:string[]}}
 */
export function gradeClosedAnswer(question, given) {
  const options = Array.isArray(question?.options) ? question.options : [];
  const tokens = parseGiven(given);

  // Последовательность: «132» или «1,3,2».
  if (question?.order_indexes?.length) {
    const sequence = tokens
      .join("")
      .replace(/[^0-9]/g, "")
      .split("")
      .map((digit) => Number(digit) - 1)
      .filter((index) => index >= 0);
    const expected = question.order_indexes;
    const isCorrect =
      sequence.length === expected.length && sequence.every((value, index) => value === expected[index]);
    return {
      is_correct: isCorrect,
      selected_keys: tokens,
      correct_keys: expected.map((index) => options[index]?.key).filter(Boolean),
    };
  }

  const correctIndexes = options
    .map((option, index) => (option.correct === true ? index : -1))
    .filter((index) => index >= 0);
  if (!correctIndexes.length) {
    return { is_correct: null, selected_keys: tokens, correct_keys: [] };
  }

  const selected = new Set();
  for (const token of tokens) {
    const index = optionIndexForToken(question, token);
    if (index >= 0) selected.add(index);
  }
  const expected = new Set(correctIndexes);
  const isCorrect =
    selected.size === expected.size && [...selected].every((index) => expected.has(index));
  return {
    is_correct: isCorrect,
    selected_keys: [...selected].map((index) => options[index]?.key).filter(Boolean),
    correct_keys: correctIndexes.map((index) => options[index]?.key).filter(Boolean),
  };
}

/** Совместимость: открытый ответ сравниваем по нормализованному тексту. */
export function gradeOpenAnswer(expected, given) {
  const target = normalizedAnswer(expected);
  const actual = normalizedAnswer(given);
  if (!target) return null;
  return target === actual;
}

export const questionFormatTypes = {
  open: [...OPEN_TYPES],
  closed: [...CLOSED_TYPES],
};
