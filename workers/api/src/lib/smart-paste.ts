/**
 * §8 «Умный импорт» (Smart Paste): староста копирует привычный текст из
 * чата — парсер выделяет тему, дедлайн, чек-лист задач и блок критериев.
 *
 * Правила честности:
 *  • никакой AI — только правила по разметке, которую студенты реально пишут;
 *  • даты распознаются только явные (дд.мм, дд.мм.гггг, гггг-мм-дд) — «до
 *    пятницы» не додумывается;
 *  • если из текста не удалось вытащить ни темы, ни задач — ok: false с
 *    честной причиной, вызывающий не заполняет форму «пустотой».
 */

export type SmartPasteResult = {
  ok: boolean;
  reason?: string;
  title: string | null;
  dueDate: string | null; // ISO yyyy-mm-dd, если год явный; иначе null
  checklist: string[];
  criteria: string | null;
};

const MONTHS_RU: Record<string, number> = {
  "января": 1, "февраля": 2, "марта": 3, "апреля": 4, "мая": 5, "июня": 6,
  "июля": 7, "августа": 8, "сентября": 9, "октября": 10, "ноября": 11, "декабря": 12,
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Явные даты: 02.10, 02.10.2026, 2026-10-02, «2 октября». */
export function extractDueDate(text: string, today = new Date()): string | null {
  const year = today.getFullYear();

  // 2026-10-02 (ISO). \b в JS — ASCII-граница и не работает с кириллицей,
  // поэтому везде lookaround по \p{L}\p{N} с флагом u.
  let m = text.match(/(?<![\p{L}\p{N}])(\d{4})-(\d{2})-(\d{2})(?![\p{L}\p{N}])/u);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // 02.10.2026 / 2.10.2026
  m = text.match(/(?<![\p{L}\p{N}])(\d{1,2})\.(\d{1,2})\.(\d{4})(?![\p{L}\p{N}])/u);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${m[3]}-${pad2(month)}-${pad2(day)}`;
  }

  // 02.10 — год выводим честно: ближайшая будущая дата от «сегодня»
  m = text.match(/(?<![\p{L}\p{N}])(\d{1,2})\.(\d{1,2})(?!\.\d)(?![\p{L}\p{N}])/u);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const candidates = [year, year + 1].map((y) => new Date(Date.UTC(y, month - 1, day)));
      const future = candidates.find((d) => d.getTime() >= Date.UTC(year, today.getMonth(), today.getDate()) - 86400000);
      if (future) return `${future.getUTCFullYear()}-${pad2(month)}-${pad2(day)}`;
    }
  }

  // «2 октября» / «02 октября»
  const monthNames = Object.keys(MONTHS_RU).join("|");
  m = text.match(new RegExp(`(?<![\\p{L}\\p{N}])(\\d{1,2})\\s+(${monthNames})(?![\\p{L}\\p{N}])`, "iu"));
  if (m) {
    const day = Number(m[1]);
    const month = MONTHS_RU[m[2].toLowerCase()];
    if (day >= 1 && day <= 31) {
      const candidates = [year, year + 1].map((y) => new Date(Date.UTC(y, month - 1, day)));
      const future = candidates.find((d) => d.getTime() >= Date.UTC(year, today.getMonth(), today.getDate()) - 86400000);
      if (future) return `${future.getUTCFullYear()}-${pad2(month)}-${pad2(day)}`;
    }
  }

  return null;
}

/** Тема: «ТЕМА: Эмбриология», «Дз на 02.10. Тема: Ферменты.» или первая строка при задачах. */
export function extractTitle(lines: string[]): string | null {
  for (const line of lines) {
    // Тема может быть в середине строки после «ДЗ на …» — не привязываем к началу.
    const m = line.match(/(?:^|\s)(?:тема|темы)\s*[:\-—]\s*(.{2,120})$/i);
    if (m) return m[1].trim();
  }
  // Первая строка как заголовок — только если дальше есть задачи: строка
  // болтовни («всем привет, как дела?») темой не является.
  if (!extractChecklist(lines).length) return null;
  for (const line of lines) {
    const trimmed = line.trim();
    // Первая строка-заголовок: не пункт списка, не дата, не «дз на …»
    if (
      trimmed.length >= 3 && trimmed.length <= 120 &&
      !/^\d+[.)]/.test(trimmed) &&
      !/^\s*(?:дз|домашн\w*|домашка)\b/i.test(trimmed) &&
      !extractDueDate(trimmed)
    ) {
      return trimmed;
    }
  }
  return null;
}

/** Чек-лист: нумерованные и маркированные пункты. */
export function extractChecklist(lines: string[]): string[] {
  const items: string[] = [];
  let current: string | null = null;
  for (const line of lines) {
    const m = line.match(/^\s*(?:\d+[.)]|[-•*])\s+(.{2,300})$/);
    if (m) {
      if (current) items.push(current);
      current = m[1].trim();
    } else if (current && line.trim() && !/^\s*(?:критери|оценк)/i.test(line)) {
      // продолжение пункта
      current += " " + line.trim();
    }
  }
  if (current) items.push(current);
  return items.filter((item) => item.length >= 2).slice(0, 20);
}

/** Критерии оценок: всё от строки с «критери…» до конца или пустой строки. */
export function extractCriteria(lines: string[]): string | null {
  const start = lines.findIndex((line) => /^\s*критери/i.test(line));
  if (start < 0) return null;
  const collected: string[] = [lines[start]];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) break;
    // новая смысловая секция — критерии закончились
    if (/^\s*(?:тема|дз|домашн)\b/i.test(line)) break;
    collected.push(line);
  }
  const text = collected.join("\n").trim();
  return text.length >= 3 ? text.slice(0, 2000) : null;
}

export function smartPasteParse(raw: unknown, today = new Date()): SmartPasteResult {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, reason: "Пустой текст", title: null, dueDate: null, checklist: [], criteria: null };

  const lines = text.split(/\r?\n/);
  const dueDate = extractDueDate(text, today);
  const checklist = extractChecklist(lines);
  const title = extractTitle(lines);
  const criteria = extractCriteria(lines);

  if (!title && checklist.length === 0) {
    return {
      ok: false,
      reason: "Не удалось распознать тему или задачи: нет нумерованных пунктов и строки «Тема: …»",
      title: null, dueDate, checklist, criteria,
    };
  }

  return {
    ok: true,
    title: title || (checklist[0] ? checklist[0].slice(0, 120) : null),
    dueDate,
    checklist,
    criteria,
  };
}
