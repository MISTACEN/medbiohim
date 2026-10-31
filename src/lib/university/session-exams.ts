/**
 * Сессионное расписание (§4): экзаменационные PDF факультетов разбираются
 * в структурированные строки «группы → дата → время → примечание».
 *
 * Алгоритм оконный: даты — якоря строк таблицы (PDF-текст «плоский», группы
 * переносятся по строкам). Окно строки i — от конца времени строки i-1 до
 * конца времени строки i; внутри окна лежат группы этой строки, её
 * примечание и retake-маркер «ПЕРЕСДАЧА».
 *
 * Правила честности:
 *  • якорь-дата обязан быть правдоподобной (год в окне [текущий−1, +2]) —
 *    коды специальностей вида 31.05.01 не являются датами;
 *  • только то, что реально есть в тексте; нераспознанное поле — null.
 */

export type SessionExamRow = {
  groups: string[];
  date: string | null;
  time: string | null;
  note: string | null;
  is_retake: boolean;
};

export type SessionExamsDocument = {
  title: string | null;
  faculty_hint: string | null;
  course_hint: number | null;
  rows: SessionExamRow[];
};

const DATE_RE = /(?<![\d.])(\d{2})\.(\d{2})\.(\d{2,4})(?![\d.])/g;

function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

/** дд.мм.гг → ISO (год 26 → 2026). Чистая функция без окна правдоподобности. */
export function parseSessionDate(value: string): string | null {
  const match = value.match(/(?<![\d.])(\d{2})\.(\d{2})\.(\d{2,4})(?![\d.])/);
  if (!match) return null;
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  const month = Number(match[2]);
  const day = Number(match[1]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function plausibleYear(iso: string, today: Date): boolean {
  const year = Number(iso.slice(0, 4));
  return year >= today.getFullYear() - 1 && year <= today.getFullYear() + 2;
}

/** Время вида «16-30», «16:30» → «16:30». */
export function parseSessionTime(value: string): string | null {
  const match = value.match(/(?<![\d:])([01]?\d|2[0-3])[-:.]([0-5]\d)(?![\d:])/);
  if (!match) return null;
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

export function parseExamPdfText(text: string, today = new Date()): SessionExamsDocument {
  const normalized = String(text || "").replace(/\u00a0/g, " ");
  const titleMatch = normalized.match(/РАСПИСАНИЕ\s+ЭКЗАМЕНА[^\n]*/i);
  const title = titleMatch ? normalizeWhitespace(titleMatch[0].replace(/РАСПИСАНИЕ/i, "").trim()) : null;
  const courseMatch = normalized.match(/на\s+(\d)\s+курсе/i);
  const facultyMatch = normalized.match(/(?:факультет[аи]?)\s+([^\n,]+)/i);

  const endMatch = normalized.match(/\n\s*(?:Примечание|Заведующий|СОГЛАСОВАНО)/i);
  const body = endMatch ? normalized.slice(0, endMatch.index) : normalized;

  // Якоря-даты с правдоподобным годом (коды специальностей 31.05.01 отсеиваются).
  const anchors: Array<{ start: number; end: number; date: string; time: string | null; windowEnd: number }> = [];
  DATE_RE.lastIndex = 0;
  for (let match = DATE_RE.exec(body); match; match = DATE_RE.exec(body)) {
    const iso = parseSessionDate(match[0]);
    if (!iso || !plausibleYear(iso, today)) continue;
    const start = match.index;
    const end = match.index + match[0].length;
    const time = parseSessionTime(body.slice(end, end + 12).match(/^\s*(\S+(?: \S+)?)/)?.[1] ?? "");
    const windowEnd = end + (time ? 1 + time.length : 0);
    anchors.push({ start, end, date: iso, time, windowEnd });
  }

  const rows: SessionExamRow[] = [];
  for (let i = 0; i < anchors.length; i += 1) {
    const anchor = anchors[i];
    const windowStart = i > 0 ? anchors[i - 1].windowEnd : (function collectAfterHeader() {
      // Первое окно начинается после шапки таблицы: колонок «Группа Дата Время
      // Место проведения экзамена Отчетная документация ФИО экзаменатора».
      const headerMatch = body.slice(0, anchor.start).match(/Отчетная\s+документация|ФИО\s+экзаменатора/i);
      return headerMatch && headerMatch.index != null ? headerMatch.index + headerMatch[0].length : 0;
    })();
    const window = body.slice(windowStart, anchor.windowEnd);

    const groups = (window.match(/\b\d{5}\b/g) || []).filter((value, index, all) => all.indexOf(value) === index);
    const isRetake = /пересдач/i.test(window);
    if (!groups.length && !isRetake) continue; // проза/шапка — не строка расписания

    // Примечание — текст окна до даты, без групповых токенов (эхо даты/времени
    // в хвосте окна отбрасывается самой границей окна).
    const preDate = window.slice(0, window.length - (anchor.windowEnd - anchor.start));
    const note = normalizeWhitespace(preDate.replace(/(?:\b\d{5}\b[,\s]*)+/g, " "));

    rows.push({ groups, date: anchor.date, time: anchor.time, note: note || null, is_retake: isRetake });
  }

  const facultyHint = facultyMatch ? normalizeWhitespace(facultyMatch[1]) : null;
  return { title, faculty_hint: facultyHint, course_hint: courseMatch ? Number(courseMatch[1]) : null, rows };
}
