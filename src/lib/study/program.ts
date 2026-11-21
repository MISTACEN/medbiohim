/**
 * Программа подготовки: не «текст преподавателя», а данные.
 *
 * Зачем отдельный слой:
 *  • студент не переписывает ДЗ — он отмечает, что уже сдано;
 *  • из отметок детерминированно пересобирается ход сдачи отработок и план
 *    по дням (без выдуманных дат и тем);
 *  • сайтовый AI переписывает акценты, советы и порядок блоков, но не может
 *    сдвинуть сроки: в патч попадают только известные даты и блоки.
 *
 * Даты здесь — из описания преподавателя (осень 2026). КР по умолчанию
 * 20.11; дату можно изменить на странице, остальные сроки фиксированы.
 */
import type { StudyKind } from "./plan";
import { addDays, dayLabel, krGrade, toIso } from "./plan";
import {
  KR_ACTIONS,
  KR_DATE_DEFAULT,
  KR_GRADES,
  KR_RISK,
  KR_RULES,
  HISTOLOGY_PROGRAM,
  ROADMAP_GROUPS,
  STUDY_SEED_PATCH,
  TEACHER_TEXT,
  type Program,
  type ProgramBlock,
  type ProgramTask,
} from "./programData";

export {
  KR_ACTIONS,
  KR_DATE_DEFAULT,
  KR_GRADES,
  KR_RISK,
  KR_RULES,
  HISTOLOGY_PROGRAM,
  STUDY_SEED_PATCH,
  TEACHER_TEXT,
  type Program,
  type ProgramBlock,
  type ProgramTask,
};


const DAY_MS = 86_400_000;
const pad = (value: number) => String(value).padStart(2, "0");

function parseIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function diffDays(a: string, b: string): number {
  return Math.round((parseIso(a).getTime() - parseIso(b).getTime()) / DAY_MS);
}

function range(start: string, end: string): string[] {
  if (start > end) return [];
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

function maxDate(dates: Array<string | null>): string | null {
  let result: string | null = null;
  for (const date of dates) if (date && (!result || date > result)) result = date;
  return result;
}

export type BlockUrgency = "done" | "overdue" | "today" | "tomorrow" | "soon" | "later";

export type DeadlineInfo = { date: string | null; label: string; urgency: BlockUrgency };

/** Срок человеческим языком. Без Intl: SSR и клиент должны совпадать. */
export function deadlineInfo(date: string | null, todayIso: string): DeadlineInfo {
  if (!date) return { date: null, label: "к КР", urgency: "later" };
  const diff = diffDays(date, todayIso);
  const short = `${pad(parseIso(date).getDate())}.${pad(parseIso(date).getMonth() + 1)}`;
  if (diff < 0) return { date, label: `просрочено ${-diff} дн. · ${short}`, urgency: "overdue" };
  if (diff === 0) return { date, label: `сегодня · ${short}`, urgency: "today" };
  if (diff === 1) return { date, label: `завтра · ${short}`, urgency: "tomorrow" };
  if (diff <= 3) return { date, label: `через ${diff} дн. · ${short}`, urgency: "soon" };
  return { date, label: `через ${diff} дн. · ${short}`, urgency: "later" };
}

export type ProgramProgress = { done: number; total: number; percent: number };

export function progressOf(program: Program, done: Record<string, boolean>, blockIds?: string[]): ProgramProgress {
  const blocks = blockIds ? program.blocks.filter((block) => blockIds.includes(block.id)) : program.blocks;
  const tasks = blocks.flatMap((block) => block.tasks);
  const finished = tasks.filter((task) => done[task.id]).length;
  return { done: finished, total: tasks.length, percent: tasks.length ? Math.round((finished / tasks.length) * 100) : 0 };
}

export type RoadmapTask = ProgramTask & { blockId: string; blockShort: string };

export type RoadmapStep = {
  id: string;
  title: string;
  why: string;
  blockIds: string[];
  deadline: string | null;
  deadlineLabel: string;
  urgency: BlockUrgency;
  tasks: RoadmapTask[];
  pending: RoadmapTask[];
  doneCount: number;
  total: number;
  minutes: number;
  pendingMinutes: number;
};

export function buildRoadmap(input: {
  program?: Program;
  done: Record<string, boolean>;
  today?: string;
  krDate?: string;
}): RoadmapStep[] {
  const program = input.program ?? HISTOLOGY_PROGRAM;
  const todayIso = input.today ?? toIso(new Date());
  const krDate = input.krDate ?? program.kr.defaultDate;
  const done = input.done;

  return ROADMAP_GROUPS.map((group) => {
    const blocks = group.blockIds
      .map((id) => program.blocks.find((block) => block.id === id))
      .filter((block): block is ProgramBlock => Boolean(block));
    const tasks: RoadmapTask[] = blocks.flatMap((block) =>
      block.tasks.map((task) => ({ ...task, blockId: block.id, blockShort: block.short })),
    );
    if (group.id === "kr") {
      for (const action of KR_ACTIONS) {
        tasks.push({ ...action, blockId: "kr", blockShort: "КР" });
      }
    }

    const deadline =
      group.id === "kr"
        ? krDate
        : group.id === "cyto"
          ? addDays(krDate, -1)
          : maxDate(blocks.map((block) => block.due));
    const info = deadlineInfo(deadline, todayIso);
    const doneCount = tasks.filter((task) => done[task.id]).length;
    const pending = tasks.filter((task) => !done[task.id]);
    const urgency: BlockUrgency = pending.length === 0 ? "done" : info.urgency;

    return {
      id: group.id,
      title: group.title,
      why: group.why,
      blockIds: group.blockIds,
      deadline,
      deadlineLabel: pending.length === 0 ? "сдано" : info.label,
      urgency,
      tasks,
      pending,
      doneCount,
      total: tasks.length,
      minutes: tasks.reduce((sum, task) => sum + task.minutes, 0),
      pendingMinutes: pending.reduce((sum, task) => sum + task.minutes, 0),
    };
  });
}

/** Порядок блоков от AI применяется только к известным id и не теряет шаги. */
export function orderRoadmap(steps: RoadmapStep[], priority: string[]): RoadmapStep[] {
  if (!priority.length) return steps;
  const index = new Map(priority.map((id, position) => [id, position]));
  return steps
    .map((step, position) => ({ step, position }))
    .sort((a, b) => {
      const left = index.get(a.step.id) ?? Number.MAX_SAFE_INTEGER;
      const right = index.get(b.step.id) ?? Number.MAX_SAFE_INTEGER;
      return left === right ? a.position - b.position : left - right;
    })
    .map((entry) => entry.step);
}

export type StudySource = "program" | "kr" | "repeat" | "assignment" | "class";

export type StudyItem = {
  id: string;
  text: string;
  kind: StudyKind;
  source: StudySource;
  minutes: number;
  hint?: string;
  blockId?: string;
};

export type StudyDay = {
  date: string;
  label: string;
  focus: string;
  load: number;
  heavy: boolean;
  items: StudyItem[];
};

export type StudyPlanV2 = {
  days: StudyDay[];
  risks: string[];
  deadline: string;
  readiness: number;
  tonight: StudyItem[];
};

export type PlanAssignment = {
  id: string;
  subject: string;
  topic: string;
  due_date: string | null;
  status: string;
};

const KIND_MINUTES: Record<StudyKind, number> = {
  control: 40,
  tests: 40,
  electronograms: 30,
  file: 60,
  drawing: 40,
  lecture: 40,
  other: 20,
};

const KIND_ORDER: StudyKind[] = ["control", "tests", "electronograms", "file", "drawing", "lecture", "other"];

function focusOf(items: StudyItem[]): string {
  const kinds = new Set(items.map((item) => item.kind));
  if (kinds.has("control")) return "Контрольная точка";
  if (kinds.has("tests")) return "Тесты";
  if (kinds.has("electronograms")) return "Электронограммы";
  if (kinds.has("drawing")) return "Рисунки";
  if (kinds.has("file")) return "Письменная работа";
  if (kinds.has("lecture")) return "Теория";
  return "Сдача и повторение";
}

/**
 * План по дням. Сначала фиксированные события (17.11, 19.11, день КР), потом
 * невыполненные задачи блоков в приоритете: нервная ткань → цитология →
 * скелетные. Перегруз не прячется: день помечается heavy, в риски идёт строка.
 */
export function buildStudyPlanV2(input: {
  program?: Program;
  done: Record<string, boolean>;
  today?: Date;
  now?: Date;
  krDate?: string;
  assignments?: PlanAssignment[];
}): StudyPlanV2 {
  const program = input.program ?? HISTOLOGY_PROGRAM;
  const today = input.today ?? new Date();
  const now = input.now ?? today;
  const todayIso = toIso(today);
  const krDate = input.krDate ?? program.kr.defaultDate;
  const done = input.done;
  const risks: string[] = [KR_RISK];
  const perDay = new Map<string, StudyItem[]>();

  const loadOf = (date: string) => (perDay.get(date) ?? []).reduce((sum, item) => sum + item.minutes, 0);
  // Вечером сегодняшняя ёмкость меньше: 4 часа после работы/учёбы — не план, а самообман.
  const capacityOf = (date: string) => (date === todayIso && now.getHours() >= 18 ? 110 : 150);

  const add = (date: string, item: StudyItem) => {
    if (done[item.id]) return;
    const list = perDay.get(date) ?? [];
    if (list.some((entry) => entry.text === item.text)) return;
    list.push(item);
    perDay.set(date, list);
  };

  const addTask = (date: string, task: ProgramTask, source: StudySource, blockId?: string) => {
    if (done[task.id]) return;
    add(date, {
      id: task.id,
      text: task.text,
      kind: task.kind,
      source,
      minutes: task.minutes,
      hint: task.hint,
      blockId,
    });
  };

  const place = (task: ProgramTask, candidates: string[], source: StudySource, blockId?: string) => {
    if (done[task.id]) return;
    const usable = candidates.length ? candidates : [todayIso];
    // Раскладываем по дню с наименьшей итоговой загрузкой: так вечер 12.11 не
    // забирает всё, а длинные задачи не сваливаются в один день.
    const target = usable.reduce((best, date) => {
      const nextLoad = loadOf(date) + task.minutes;
      const bestLoad = loadOf(best) + task.minutes;
      if (nextLoad !== bestLoad) return nextLoad < bestLoad ? date : best;
      return capacityOf(date) > capacityOf(best) ? date : best;
    }, usable[0]);
    addTask(target, task, source, blockId);
  };

  // Фиксированные события: 17.11 открытые тесты, 19.11 § 6 и репетиция.
  for (const event of program.events) {
    if (done[event.id] || event.date > krDate) continue;
    add(event.date, {
      id: event.id,
      text: event.text,
      kind: event.kind,
      source: "kr",
      minutes: event.minutes,
      hint: event.hint,
      blockId: "kr",
    });
  }

  // День КР: утром названия, на работе — тест и электронограмма, бонус.
  const krItems: Array<Omit<StudyItem, "id"> & { id: string }> = [
    {
      id: "kr-morning",
      text: "Утром: 11 названий и ключевые подписи — 15 минут",
      kind: "electronograms",
      source: "kr",
      minutes: 15,
    },
    {
      id: "kr-exam",
      text: "КР: тест + одна из 11 электронограмм",
      kind: "control",
      source: "kr",
      minutes: 20,
    },
    {
      id: "kr-bonus",
      text: "Сдать за 2–3 минуты до таймера: +0,5 аннулирует одну ошибку",
      kind: "control",
      source: "kr",
      minutes: 5,
    },
  ];
  for (const item of krItems) {
    if (!done[item.id]) add(krDate, item);
  }

  // Кандидаты по блокам.
  const nerve = program.blocks.find((block) => block.id === "nerv-2026-11-06");
  const syn = program.blocks.find((block) => block.id === "syn-2026-11-13");
  const cyto = program.blocks.find((block) => block.id === "cyt-next-week");
  const skel = program.blocks.find((block) => block.id === "skel-2026-10-23");

  const nerveDeadline = syn?.due ?? addDays(todayIso, 1);
  const nerveDays =
    nerveDeadline >= todayIso ? range(todayIso, nerveDeadline) : range(todayIso, addDays(todayIso, 1));

  const cytEnd = addDays(krDate, -1);
  const cytStartBase = addDays(nerveDeadline, 1);
  const cytStart = cytStartBase > todayIso ? cytStartBase : todayIso;
  const cytDays = cytEnd >= cytStart ? range(cytStart, cytEnd) : [todayIso];

  // Подготовку к тесту по нервной ткани не ставим на вечер перед занятием:
  // тест идёт позже, поэтому 14–18.11 — реалистичнее.
  const testEnd = addDays(krDate, -2);
  const testStart = cytStart;
  const testDays = testEnd >= testStart ? range(testStart, testEnd) : cytDays;

  const skelEnd = addDays(krDate, -2);
  const skelStartBase = addDays(nerveDeadline, 1);
  const skelStart = skelStartBase > todayIso ? skelStartBase : todayIso;
  const skelDays = skelEnd >= skelStart ? range(skelStart, skelEnd) : [todayIso];

  // Приоритет: сначала нервная ткань (завтра занятие), потом цитология (КР),
  // потом старый долг по скелетным тканям.
  if (nerve) for (const task of nerve.tasks) place(task, nerveDays, "program", nerve.id);
  if (syn) {
    for (const task of syn.tasks) {
      if (task.id === "syn-test") place(task, testDays, "program", syn.id);
      else place(task, nerveDays, "program", syn.id);
    }
  }
  if (cyto) for (const task of cyto.tasks) place(task, cytDays, "program", cyto.id);
  if (skel) for (const task of skel.tasks) place(task, skelDays, "program", skel.id);

  // Напоминание на ближайшее занятие: что именно сдать по нервной ткани.
  const classDate = syn?.due && syn.due >= todayIso ? syn.due : todayIso;
  const classPending = [...(nerve?.tasks ?? []), ...(syn?.tasks ?? [])].filter((task) => !done[task.id]);
  if (classPending.length) {
    add(classDate, {
      id: "class-nerve",
      text: `Занятие: сдать нервную ткань — файл, рисунки, электронограммы`,
      kind: "other",
      source: "class",
      minutes: 10,
      blockId: nerve?.id,
    });
  }

  // Интервальные прогоны электронограмм — до дня перед КР.
  for (let date = addDays(nerveDeadline, 1); date <= addDays(krDate, -1); date = addDays(date, 2)) {
    if (loadOf(date) + 30 > capacityOf(date)) continue;
    add(date, {
      id: `em-repeat-${date}`,
      text: "Электронограммы: 11 названий + подписи",
      kind: "electronograms",
      source: "repeat",
      minutes: 30,
    });
  }

  // Личные отработки из API: то, что студент уже ведёт на сайте. Блоки самой
// программы сюда не подмешиваем — иначе задачи задвоятся в плане.
  const programTopics = new Set(program.blocks.map((block) => block.short));
  for (const assignment of input.assignments ?? []) {
    if (assignment.status === "passed" || programTopics.has(assignment.topic)) continue;
    const due = assignment.due_date && /^\d{4}-\d{2}-\d{2}$/.test(assignment.due_date) ? assignment.due_date : null;
    const rawTarget = due && due >= todayIso ? due : todayIso;
    const target = rawTarget > krDate ? addDays(krDate, -1) : rawTarget;
    place(
      {
        id: `assignment-${assignment.id}`,
        kind: "other",
        text: `Отработать: ${assignment.topic}${assignment.subject ? ` (${assignment.subject})` : ""}`,
        minutes: KIND_MINUTES.other,
      },
      [target],
      "assignment",
    );
  }

  // Сортируем пункты дня: контроль → тесты → ЭМ → файл → рисунок → лекция.
  for (const items of perDay.values()) {
    items.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  }

  const days: StudyDay[] = [...perDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => {
      const load = items.reduce((sum, item) => sum + item.minutes, 0);
      return {
        date,
        label: dayLabel(date, todayIso),
        focus: focusOf(items),
        load,
        heavy: load > 150,
        items,
      };
    });

  for (const day of days) {
    if (day.heavy) {
      risks.push(`${day.label}: ${day.load} мин. Это больше 150 — перенеси 1–2 пункта или сократи прогон.`);
    }
  }

  const overdue = program.blocks.filter((block) => block.due && block.due < todayIso && !block.tasks.every((task) => done[task.id]));
  if (overdue.length) {
    const nerveStillPending = [...(nerve?.tasks ?? []), ...(syn?.tasks ?? [])].some((task) => !done[task.id]);
    risks.push(
      `Просрочено: ${overdue.map((block) => `${block.dateText} — ${block.short}`).join("; ")}.${nerveStillPending ? " Файл по нервным тканям один и закрывает сразу 06.11 и 13.11." : ""}`,
    );
  }

  if (now.getHours() >= 18 && todayIso === "2026-11-12") {
    risks.push(
      `Сейчас вечер ${todayIso.split("-").reverse().slice(0, 2).join(".")}: до ближайшего занятия физически не успеть весь блок. Сначала файл, рисунок НМС и электронограмма НМС — остальное после занятия и до КР.`,
    );
  }

  const nervePending = [...(nerve?.tasks ?? []), ...(syn?.tasks ?? [])].filter((task) => !done[task.id]);
  const nerveMinutes = nervePending.reduce((sum, task) => sum + task.minutes, 0);
  const nerveCapacity = capacityOf(todayIso) + capacityOf(addDays(todayIso, 1));
  if (nerveMinutes > nerveCapacity && todayIso <= "2026-11-13") {
    risks.push(
      `До занятия ${syn?.dateText ?? "13.11"} доступно около ${nerveCapacity} мин, а по нервной ткани висит ${nerveMinutes} мин. Закрывай по приоритету: файл → рисунок НМС → электронограмма НМС; остальное сразу после занятия.`,
    );
  }

  const cytoFile = cyto?.tasks.find((task) => task.id === "cyt-file");
  if (cytoFile && !done[cytoFile.id] && todayIso >= "2026-11-14") {
    risks.push("Файлик «1. Цитология» ещё не начат: это 120 минут и база тестовой части. Начинать сегодня, иначе к КР не успеть.");
  }

  const krProgress = progressOf(program, done, ["cyt-next-week"]);
  const readiness = krProgress.percent;

  const todayItems = perDay.get(todayIso) ?? [];

  return { days, risks, deadline: krDate, readiness, tonight: todayItems };
}

/** Промпт: AI меняет акценты и порядок блоков, но не сроки и не состав задач. */
export function buildAiPromptV2(plan: StudyPlanV2, roadmap: RoadmapStep[]): string {
  const days = plan.days
    .map((day) => `- ${day.date} (${day.label}): ${day.items.map((item) => item.text).join("; ")}`)
    .join("\n");
  const blocks = roadmap
    .map(
      (step) =>
        `- [${step.id}] ${step.title}: ${step.doneCount}/${step.total} сдано, дедлайн ${step.deadline ?? "к КР"}`,
    )
    .join("\n");
  return [
    "Ты — методист, готовишь студента-медика к контрольной по гистологии " + plan.deadline + ".",
    "Ниже: блоки отработок с прогрессом, правила КР и уже посчитанный план по дням.",
    "Даты, состав задач и дедлайны менять нельзя — они уже посчитаны детерминированно.",
    "Ответь компактно, без пояснений и markdown:",
    "1) выбери 3 ключевых дня (сегодня, ближайшее занятие, день перед КР) и перепиши их фокус до 50 символов;",
    "2) расставь приоритет блоков (id) — что сдавать первым;",
    "3) дай 2 коротких совета;",
    "4) назови 2 пункта, которые реально не успеть, если ничего не менять.",
    "Без выдуманных дат, тем и фактов. Ответ строго JSON:",
    '{"days":[{"date":"ГГГГ-ММ-ДД","focus":"..."}],"priority":["nerve","cyto"],"advice":["..."],"cut":["..."]}',
    "",
    "Блоки:",
    blocks,
    "",
    "План по дням:",
    days,
  ].join("\n");
}

import type { AiPlanPatch } from "./programData";
export type { AiPlanPatch };

/** Разбор ответа AI: всё, что не совпало с нашими днями и блоками, отбрасывается. */
export function parseAiPlanV2(reply: string, plan: StudyPlanV2, roadmap: RoadmapStep[]): AiPlanPatch {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  const empty: AiPlanPatch = { days: {}, advice: [], priority: [], cut: [] };
  if (start < 0 || end <= start) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return empty;
  }
  const data = parsed as {
    days?: Array<{ date?: unknown; focus?: unknown }>;
    advice?: unknown;
    priority?: unknown;
    cut?: unknown;
  };
  const knownDays = new Set(plan.days.map((day) => day.date));
  const knownBlocks = new Set(roadmap.map((step) => step.id));
  const days: Record<string, string> = {};
  for (const entry of Array.isArray(data.days) ? data.days : []) {
    const date = String(entry?.date ?? "");
    const focus = String(entry?.focus ?? "").trim();
    if (knownDays.has(date) && focus) days[date] = focus.slice(0, 90);
  }
  const advice = (Array.isArray(data.advice) ? data.advice : [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);
  const priority = (Array.isArray(data.priority) ? data.priority : [])
    .map((item) => String(item ?? "").trim())
    .filter((id) => knownBlocks.has(id))
    .slice(0, 8);
  const cut = (Array.isArray(data.cut) ? data.cut : [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);
  return { days, advice, priority, cut };
}

/** Оценка с учётом +0,5 и требования теории для «5». */
export function krGradeWithBonus(errors: number, bonus: boolean, theoryFull: boolean): 2 | 3 | 4 | 5 {
  const effective = Math.max(0, errors - (bonus ? 1 : 0));
  const grade = krGrade(effective);
  if (grade === 5 && !theoryFull) return 4;
  return grade;
}

/** Сколько ошибок можно допустить для целевой оценки (без бонуса). */
export function mistakesAllowed(grade: 3 | 4 | 5): string {
  if (grade === 5) return "0 ошибок + теория по электронограмме";
  if (grade === 4) return "1–3 ошибки";
  return "4–6 ошибок";
}

/** Ближайшее действие: первая невыполненная задача первого незакрытого шага. */
export function nextAction(roadmap: RoadmapStep[]): RoadmapTask | null {
  for (const step of roadmap) {
    const task = step.pending[0];
    if (task) return task;
  }
  return null;
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Экспорт плана в календарь: по одному событию на день, без сервера. */
export function toIcs(plan: StudyPlanV2): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MEDBIOHIM//Study plan//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const day of plan.days) {
    const date = day.date.replace(/-/g, "");
    const title = `Подготовка к КР: ${day.focus} (${day.load} мин)`;
    const description = day.items.map((item) => `- ${item.text} (${item.minutes} мин)`).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:study-${day.date}@medbiohim`,
      `DTSTAMP:${date}T000000Z`,
      `DTSTART;VALUE=DATE:${date}`,
      `SUMMARY:${icsEscape(title)}`,
      `DESCRIPTION:${icsEscape(description)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}