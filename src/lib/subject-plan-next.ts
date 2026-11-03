/**
 * Общая модель занятия учебного плана и логика «ближайшего занятия».
 *
 * Планы предметов приходят в трёх видах:
 *  1. Статический план кафедры с массивом weeks (гистология): одна запись = одно
 *     занятие с лекцией, лабораторной, препаратами и ДЗ.
 *  2. Статический план кафедры в плоском формате (химия, физиология, оптика…):
 *     отдельные списки lectures / labs / practicals / controls с датами.
 *  3. План из API /subject-plans/:slug — weeks с полями date / lecture /
 *     practice / preparations (+ метаданные).
 *
 * Здесь всё приводится к единому PlanSession, чтобы вкладка «План» на странице
 * предмета и блок «Ближайшее занятие» на /academic работали одинаково для всех
 * предметов, а «ближайшее» считалось только по датам занятий плана (план
 * синхронизирован с расписанием) — без выдуманных дат.
 */

export type PlanSessionKind = "week" | "lecture" | "lab" | "practical";

export type PlanSession = {
  /** Стабильный ключ для React. */
  key: string;
  /** Тип записи: week — «полное» занятие из недельного плана, остальные — плоский формат. */
  kind: PlanSessionKind;
  /** Дата занятия в формате YYYY-MM-DD или null, если в плане даты нет. */
  date: string | null;
  /** Номер занятия/лекции в плане кафедры. */
  num: number | null;
  /** Лекция занятия. */
  lecture?: { num?: number | null; title: string; lectureId?: string | null; topics?: string[]; note?: string | null } | null;
  /** Лабораторное занятие (тема + работа). */
  lab?: { title: string; topics?: string[] } | null;
  /** Текст практической части (планы из API). */
  practice?: string | null;
  /** Микропрепараты к занятию. */
  preparations?: { n?: number | string | null; name: string }[];
  /** Электронограммы: список подписей либо только флаг «есть». */
  electronograms?: string[];
  hasElectronograms?: boolean;
  /** Домашнее задание к занятию. */
  homework?: { summary?: string; items?: string[]; text?: string } | null;
  /** Контрольное мероприятие в этот день (контрольная, коллоквиум…). */
  control?: string | null;
  /** Заголовок для плоских форматов («Лекция 3», «Лабораторное занятие 5»…). */
  title?: string | null;
  /** Описание/примечание из плана API. */
  description?: string | null;
  week?: number | null;
  /** Счётчики привязанных материалов (заполняет страница предмета из topic_progress). */
  testsCount?: number | null;
  examQuestionsCount?: number | null;
  /** Тема плана (API), связанная с занятием — для статусов topic_progress. */
  topicId?: string | null;
};

export type PlanControl = {
  n?: number;
  date: string | null;
  title: string;
  covers: string[];
  prepHref?: string | null;
  prepNote?: string | null;
};

export type NormalizedSubjectPlan = {
  subject: string;
  slug?: string;
  course?: number | null;
  semester?: number | null;
  year?: string;
  faculty?: string;
  departments?: string;
  note?: string;
  sessions: PlanSession[];
  controls: PlanControl[];
};

/** Разбиение занятий по отношению к сегодняшнему дню. */
export type PlanSplit = {
  /** Занятия ближайшей даты (>= сегодня); пусто, если семестр закончился. */
  next: PlanSession[];
  /** Остальные будущие занятия, по возрастанию даты. */
  upcoming: PlanSession[];
  /** Прошедшие занятия, по убыванию даты (свежие сверху). */
  past: PlanSession[];
  /** Занятия без даты в плане (нельзя надёжно отнести к прошлому/будущему). */
  undated: PlanSession[];
  /** Ближайшая дата YYYY-MM-DD или null. */
  nextDate: string | null;
};

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" ? (value as Record<string, any>) : null;
}

/** ISO-дата из «YYYY-MM-DD», «DD.MM.YYYY» или Date-подобной строки; иначе null. */
export function parsePlanDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Сегодняшняя дата по локальным часам в формате YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toNumberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeHomework(value: unknown): PlanSession["homework"] {
  const rec = asRecord(value);
  if (!rec) {
    return typeof value === "string" && value.trim() ? { text: value } : null;
  }
  const items = Array.isArray(rec.items) ? rec.items.map(String) : undefined;
  const text = typeof rec.text === "string" ? rec.text : undefined;
  const summary = typeof rec.summary === "string" ? rec.summary : undefined;
  if (!items?.length && !text && !summary) return null;
  return { summary, items, text };
}

function normalizePreparations(value: unknown): PlanSession["preparations"] {
  if (!Array.isArray(value)) return undefined;
  const list: { n: number | string | null; name: string }[] = [];
  value.forEach((entry, index) => {
    if (typeof entry === "string") {
      list.push({ n: index + 1, name: entry });
      return;
    }
    const rec = asRecord(entry);
    if (!rec) return;
    const name = String(rec.name || rec.title || "").trim();
    if (!name) return;
    list.push({ n: rec.n != null ? (rec.n as number | string) : index + 1, name });
  });
  return list.length ? list : undefined;
}

function normalizeElectronograms(value: unknown): { list?: string[]; flag?: boolean } {
  if (Array.isArray(value)) {
    const list = value.map(String).filter(Boolean);
    return { list: list.length ? list : undefined, flag: list.length > 0 };
  }
  if (value === true) return { flag: true };
  return {};
}

/** Дата занятия из недели плана API: planned_date / date / metadata.date. */
function apiWeekDate(week: Record<string, any>): string | null {
  return (
    parsePlanDate(week.date) ||
    parsePlanDate(week.planned_date) ||
    parsePlanDate(asRecord(week.metadata)?.date)
  );
}

function apiWeekHomework(week: Record<string, any>): PlanSession["homework"] {
  return normalizeHomework(week.homework) || normalizeHomework(asRecord(week.metadata)?.homework);
}

/** Недели плана из API /subject-plans → единые занятия. */
export function sessionsFromApiPlanWeeks(weeks: unknown): PlanSession[] {
  if (!Array.isArray(weeks)) return [];
  return weeks
    .map((raw, index): PlanSession | null => {
      const week = asRecord(raw);
      if (!week) return null;
      const metadata = asRecord(week.metadata) || {};
      const kind = String(week.item_type || "").toLowerCase();
      const lectureTitle = String(
        (kind === "lecture" ? week.title : "") || week.lecture || metadata.lecture || ""
      ).trim();
      const practiceTitle = ["practice", "lab", "seminar"].includes(kind)
        ? String(week.title || "").trim()
        : String(week.practice || metadata.practice || "").trim();
      const electro = normalizeElectronograms(week.electronograms ?? metadata.electronograms);
      const lectureId = week.lecture_id ? String(week.lecture_id) : metadata.lecture_id ? String(metadata.lecture_id) : null;
      const session: PlanSession = {
        key: String(week.id || week.topic_id || `api-week-${index}`),
        kind: "week",
        date: apiWeekDate(week),
        num: toNumberOrNull(week.week ?? metadata.week ?? metadata.calendar_week),
        week: toNumberOrNull(week.week ?? metadata.week ?? metadata.calendar_week),
        lecture: lectureTitle ? { title: lectureTitle, lectureId } : null,
        practice: practiceTitle || null,
        preparations: normalizePreparations(week.preparations ?? metadata.preparations),
        electronograms: electro.list,
        hasElectronograms: electro.flag,
        homework: apiWeekHomework(week),
        control: week.control ? String(week.control) : null,
        description: week.description ? String(week.description) : null,
        topicId: week.topic_id ? String(week.topic_id) : null,
      };
      return session;
    })
    .filter((s): s is PlanSession => !!s);
}

/** Статический план кафедры (оба формата) → единые занятия. */
export function normalizeStaticPlan(raw: unknown): NormalizedSubjectPlan {
  const data = asRecord(raw) || {};
  const meta = asRecord(data.meta) || {};
  const sessions: PlanSession[] = [];

  // Формат 1: weeks (гистология) — одно занятие = лекция + лабораторная + препараты.
  if (Array.isArray(data.weeks)) {
    data.weeks.forEach((rawWeek: unknown, index: number) => {
      const week = asRecord(rawWeek);
      if (!week) return;
      const lectureRec = asRecord(week.lecture);
      const labRec = asRecord(week.lab);
      const electro = normalizeElectronograms(week.electronograms);
      sessions.push({
        key: `week-${week.num ?? index}`,
        kind: "week",
        date: parsePlanDate(week.date),
        num: toNumberOrNull(week.num),
        week: toNumberOrNull(week.num),
        lecture: lectureRec
          ? {
              num: toNumberOrNull(lectureRec.num),
              title: String(lectureRec.title || ""),
              lectureId: lectureRec.lecture_id ? String(lectureRec.lecture_id) : null,
              topics: Array.isArray(lectureRec.topics) ? lectureRec.topics.map(String) : undefined,
              note: lectureRec.note ? String(lectureRec.note) : null,
            }
          : null,
        lab: labRec
          ? {
              title: String(labRec.title || ""),
              topics: Array.isArray(labRec.topics) ? labRec.topics.map(String) : undefined,
            }
          : null,
        practice: typeof week.practice === "string" ? week.practice : null,
        preparations: normalizePreparations(week.preparations),
        electronograms: electro.list,
        hasElectronograms: electro.flag,
        homework: normalizeHomework(week.homework),
        control: week.control ? String(week.control) : null,
      });
    });
  }

  // Формат 2: плоские списки lectures / labs / practicals с датами.
  if (Array.isArray(data.lectures)) {
    data.lectures.forEach((rawLecture: unknown, index: number) => {
      const lecture = asRecord(rawLecture);
      if (!lecture) return;
      const title = String(lecture.title || "").trim();
      if (!title) return;
      sessions.push({
        key: `lecture-${lecture.n ?? index}`,
        kind: "lecture",
        date: parsePlanDate(lecture.date),
        num: toNumberOrNull(lecture.n),
        lecture: {
          num: toNumberOrNull(lecture.n),
          title,
          lectureId: lecture.lecture_id ? String(lecture.lecture_id) : null,
        },
      });
    });
  }

  if (Array.isArray(data.labs)) {
    data.labs.forEach((rawLab: unknown, index: number) => {
      // В некоторых планах labs — просто массив строк тем без дат.
      if (typeof rawLab === "string") {
        sessions.push({
          key: `lab-string-${index}`,
          kind: "lab",
          date: null,
          num: null,
          title: rawLab,
        });
        return;
      }
      const lab = asRecord(rawLab);
      if (!lab) return;
      const title = String(lab.title || "").trim();
      if (!title) return;
      const work = Array.isArray(lab.lab) ? lab.lab.map(String) : undefined;
      sessions.push({
        key: `lab-${lab.n ?? index}`,
        kind: "lab",
        date: parsePlanDate(lab.date),
        num: toNumberOrNull(lab.n),
        title: title,
        lab: { title, topics: Array.isArray(lab.topics) ? lab.topics.map(String) : undefined },
        homework: normalizeHomework(lab.lab && !Array.isArray(lab.lab) ? lab.lab : undefined),
        control: lab.control ? String(lab.control) : null,
        // Работы лабораторного практикума храним как preparations-подобный список.
        ...(work ? { description: work.map((item, i) => `${i + 1}. ${item}`).join("\n") } : {}),
      });
    });
  }

  if (Array.isArray(data.practicals)) {
    data.practicals.forEach((rawPractical: unknown, index: number) => {
      const practical = asRecord(rawPractical);
      if (!practical) return;
      const title = String(practical.title || "").trim();
      if (!title) return;
      sessions.push({
        key: `practical-${practical.n ?? index}`,
        kind: "practical",
        date: parsePlanDate(practical.date),
        num: toNumberOrNull(practical.n),
        title,
        practice: title,
      });
    });
  }

  const controls: PlanControl[] = Array.isArray(data.controls)
    ? data.controls
        .map((rawControl: unknown, index: number): PlanControl | null => {
          const control = asRecord(rawControl);
          if (!control) return null;
          const title = String(control.title || "").trim();
          if (!title) return null;
          return {
            n: toNumberOrNull(control.n) ?? index + 1,
            date: parsePlanDate(control.date),
            title,
            covers: Array.isArray(control.covers) ? control.covers.map(String) : [],
            prepHref: control.prep_href ? String(control.prep_href) : null,
            prepNote: control.prep_note ? String(control.prep_note) : null,
          };
        })
        .filter((c): c is PlanControl => !!c)
    : [];

  return {
    subject: String(data.subject || meta.subject_name || meta.title || ""),
    slug: data.slug ? String(data.slug) : meta.subject_slug ? String(meta.subject_slug) : undefined,
    course: toNumberOrNull(data.course ?? meta.course),
    semester: toNumberOrNull(data.semester ?? meta.semester),
    year: data.year ? String(data.year) : meta.academic_year ? String(meta.academic_year) : undefined,
    faculty: data.faculty ? String(data.faculty) : meta.faculty ? String(meta.faculty) : undefined,
    departments: data.departments ? String(data.departments) : undefined,
    note: data.note ? String(data.note) : undefined,
    sessions,
    controls,
  };
}

/** Сортировка по дате: сначала без даты — в конец, затем по ISO-строке. */
function byDateAsc(a: PlanSession, b: PlanSession): number {
  if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.date && !b.date) return -1;
  if (!a.date && b.date) return 1;
  return 0;
}

/**
 * Делит занятия на ближайшие / будущие / прошедшие / без даты.
 * Сравнение идёт по датам плана (YYYY-MM-DD) с локальной сегодняшней датой:
 * занятие «сегодня» считается ближайшим (оно ещё не прошло).
 */
export function splitPlanSessions(sessions: PlanSession[], today: string = todayIso()): PlanSplit {
  const dated = sessions.filter((s) => s.date);
  const undated = sessions.filter((s) => !s.date);
  const upcomingAll = dated.filter((s) => (s.date as string) >= today).sort(byDateAsc);
  const past = dated
    .filter((s) => (s.date as string) < today)
    .sort((a, b) => ((a.date as string) < (b.date as string) ? 1 : -1));
  const nextDate = upcomingAll.length ? upcomingAll[0].date : null;
  const next = nextDate ? upcomingAll.filter((s) => s.date === nextDate) : [];
  const upcoming = nextDate ? upcomingAll.filter((s) => s.date !== nextDate) : [];
  return { next, upcoming, past, undated, nextDate };
}

/** «18 ноября 2026, среда» — для крупной карточки ближайшего занятия. */
export function formatPlanDateLong(iso: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      weekday: "long",
    });
  } catch {
    return iso;
  }
}

/** «18.11.26» — компактный формат для списков. */
export function formatPlanDateShort(iso: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Сколько дней до занятия (0 — сегодня, отрицательное — уже прошло). */
export function daysUntil(iso: string, today: string = todayIso()): number {
  const a = Date.parse(`${iso}T00:00:00`);
  const b = Date.parse(`${today}T00:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((a - b) / 86400000);
}

/** Человеческая подпись «сегодня / завтра / через 3 дня». */
export function daysUntilLabel(days: number): string | null {
  if (days === 0) return "сегодня";
  if (days === 1) return "завтра";
  if (days === 2) return "послезавтра";
  if (days > 2) return `через ${days} ${days % 10 === 1 && days % 100 !== 11 ? "день" : days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 10 || days % 100 >= 20) ? "дня" : "дней"}`;
  return null;
}

const KIND_LABEL: Record<PlanSessionKind, string> = {
  week: "Занятие",
  lecture: "Лекция",
  lab: "Лабораторное занятие",
  practical: "Практическое занятие",
};

export function sessionKindLabel(session: PlanSession): string {
  return KIND_LABEL[session.kind];
}

/** Короткая подпись-чип для компактных списков. */
export function sessionKindShort(session: PlanSession): string {
  if (session.kind === "lecture") return "лекция";
  if (session.kind === "lab") return "лабораторная";
  if (session.kind === "practical") return "практика";
  return "занятие";
}
