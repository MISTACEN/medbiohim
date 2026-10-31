/**
 * Идентичность группы: id группы — постоянный, а название и курс — вычисляемые.
 *
 * «МБХ 201» = база «МБХ» + курс 2 + поток 01. При переходе из первого потока
 * во второй группа остаётся тем же id, поэтому расписание и прогресс не
 * теряются: меняется только отображаемое имя.
 */

/** Учебный год начинается 1 сентября: до сентября ещё идёт прошлый. */
export function academicYearStart(date: Date): number {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= 8 ? year : year - 1;
}

/** Курс = текущий учебный год − год поступления + 1 (1 сентября — новый курс). */
export function autoCourse(admissionYear: unknown, date = new Date()): number | null {
  const year = Number(admissionYear);
  if (!Number.isInteger(year) || year < 1990 || year > 2100) return null;
  const course = academicYearStart(date) - year + 1;
  return course >= 1 && course <= 8 ? course : null;
}

/** База названия: «МБХ-201» → «МБХ», «МБХ 201» → «МБХ». */
export function groupBase(code: unknown, name: unknown): string {
  const raw = String(code || name || "").trim();
  if (!raw) return "";
  const base = raw.replace(/[\s\-_./]*\d.*$/, "").trim();
  return base || raw;
}

/** Поток в названии — два знака: «2» → «02», «поток 2» → «02». */
export function streamSuffix(stream: unknown): string {
  const raw = String(stream ?? "").trim();
  if (!raw) return "01";
  const digits = raw.match(/\d+/)?.[0];
  if (!digits) return raw.slice(0, 2).padStart(2, "0");
  return digits.padStart(2, "0").slice(-2);
}

/**
 * Вычисляемое имя группы. Если курса нет — честно возвращаем сохранённое
 * имя, а не выдумываем «МБХ 001».
 */
export function groupDisplayName(input: { code?: unknown; name?: unknown; course?: unknown; stream?: unknown }): string {
  const name = String(input.name || "").trim();
  const course = Number(input.course);
  if (!Number.isInteger(course) || course < 1) return name;
  const base = groupBase(input.code, input.name);
  if (!base) return name;
  return `${base} ${course}${streamSuffix(input.stream)}`;
}

/**
 * Курс конкретного студента: персональная заморозка сильнее автоматики.
 * null в course_override означает «считать автоматически».
 */
export function effectiveCourse(input: {
  admissionYear?: unknown;
  storedCourse?: unknown;
  override?: unknown;
  date?: Date;
}): { course: number | null; source: "override" | "auto" | "stored" } {
  const override = Number(input.override);
  if (Number.isInteger(override) && override >= 1 && override <= 8) {
    return { course: override, source: "override" };
  }
  const auto = autoCourse(input.admissionYear, input.date);
  if (auto != null) return { course: auto, source: "auto" };
  const stored = Number(input.storedCourse);
  if (Number.isInteger(stored) && stored >= 1) return { course: stored, source: "stored" };
  return { course: null, source: "stored" };
}
