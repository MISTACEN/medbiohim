/**
 * План подготовки из текста преподавателя + личных отработок.
 *
 * Правила честности:
 *  • даты берутся только явные (`дд.мм`), «до пятницы» не додумывается;
 *  • дни, сроки и объём считает детерминированный планировщик, AI только
 *    переписывает формулировки и не может сдвинуть дедлайн;
 *  • перегруз дня не прячется: день помечается `heavy`, в риски попадает
 *    строка — студент сам решает, что перенести.
 */
import type { MyAssignment } from "@/lib/api";

export type StudyKind = "control" | "tests" | "electronograms" | "file" | "drawing" | "lecture" | "other";
export type BriefTask = { text: string; kind: StudyKind };
export type BriefBlock = {
  date: string | null;
  dateText: string;
  theme: string;
  tasks: BriefTask[];
  status: "not_done" | "control";
};
export type PlanItem = { id: string; text: string; kind: StudyKind; source: "brief" | "assignment" | "trainer"; minutes: number };
export type PlanDay = { date: string; label: string; focus: string; load: number; heavy: boolean; items: PlanItem[] };
export type StudyPlan = { days: PlanDay[]; risks: string[]; deadline: string | null };

/** Главный риск, сформулированный преподавателем. Дословно — это часть задания. */
export const KR_RISK =
  "КР — открытого типа, варианты заучивать бесполезно, поэтому 17.11 (открытые тесты) и 19.11 (§ 6) не пропускать. И не путать продольный/поперечный срез миелинового волокна — это самая частая потеря балла.";

export const KR_RULES = [
  "20 минут на работу, 4 варианта, одна электронограмма из 11.",
  "«3» — 4–6 ошибок, «4» — 1–3, «5» — 0 ошибок + теория по электронограмме.",
  "+0,5 за сдачу до таймера аннулирует одну ошибку.",
];

/** Текст преподавателя, который страница подставляет по умолчанию. */
export const HISTOLOGY_BRIEF = [
  "Дз на 06.11 — не сдано",
  "ТЕМА: Цитология. Ядро, жизненный цикл клетки.",
  "1. Лекцию учим: § 2 целиком.",
  "2. Написать файлик «1. Цитология» с ядра до конца.",
  "3. Схема ЖЦК — § 4.",
  "4. Сделать рисунки.",
  "5. Распечатать электронограммы в порядке стенда.",
  "",
  "Дз на 13.11 — не сдано",
  "ТЕМА: Нервная ткань. Синапсы и нервные окончания.",
  "1. Учить § 9.6 — синапсы.",
  "2. Учить § 10.3 и § 10.6 — нервные окончания.",
  "3. Рисунок нервно-мышечного синапса с подписями.",
  "4. Электронограмма нервно-мышечного синапса: название и подписи.",
  "",
  "Дз на 20.11 — КР",
  "ТЕМА: Контрольная работа по цитологии и нервной ткани.",
  "1. 17.11 — открытые тесты, все 45 вопросов.",
  "2. 19.11 — § 6, вопросы-ответы.",
  "3. 11 электронограмм: название, подписи, теория.",
  "4. 20 минут, 4 варианта, одна электронограмма.",
  "Критерии: «3» — 4–6 ошибок; «4» — 1–3; «5» — 0 ошибок + теория. Сдал до таймера — +0,5, аннулирует одну ошибку.",
].join("\n");

const DAY_MS = 86_400_000;
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MINUTES: Record<StudyKind, number> = {
  control: 40,
  tests: 40,
  electronograms: 30,
  file: 60,
  drawing: 40,
  lecture: 40,
  other: 20,
};

const pad = (n: number) => String(n).padStart(2, "0");

export function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const date = fromIso(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

function dayDiff(a: string, b: string): number {
  return Math.round((fromIso(a).getTime() - fromIso(b).getTime()) / DAY_MS);
}

/** «12.11, чт» + «сегодня»/«завтра» — без Intl, чтобы SSR и клиент совпадали. */
export function dayLabel(iso: string, today: string): string {
  const date = fromIso(iso);
  const base = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}, ${WEEKDAYS[date.getDay()]}`;
  const diff = dayDiff(iso, today);
  if (diff === 0) return `${base} — сегодня`;
  if (diff === 1) return `${base} — завтра`;
  return base;
}

function resolveDate(day: number, month: number, yearText: string | undefined, today: Date): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const explicitYear = yearText ? Number(yearText) : null;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let date = new Date(explicitYear ?? today.getFullYear(), month - 1, day);
  // без года: дата больше чем на два месяца в прошлом — значит, следующий год
  if (explicitYear === null && date.getTime() - start.getTime() < -60 * DAY_MS) {
    date = new Date(date.getFullYear() + 1, month - 1, day);
  }
  return toIso(date);
}

/** Явная дата внутри пункта. `§ 9.6` датой не считается. */
export function dateInText(text: string, today = new Date()): string | null {
  const re = /(?:^|[^\p{L}\p{N}§.])(\d{1,2})\.(\d{1,2})(?![\p{L}\p{N}.])/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const before = text.slice(0, match.index + match[0].indexOf(match[1]));
    if (/§\s*$/.test(before)) continue;
    const date = resolveDate(Number(match[1]), Number(match[2]), undefined, today);
    if (date) return date;
  }
  return null;
}

export function classify(text: string): StudyKind {
  const t = text.toLowerCase();
  if (/электронограмм/.test(t)) return "electronograms";
  if (/тест/.test(t)) return "tests";
  if (/(?:^|[^\p{L}])кр(?:[^\p{L}]|$)|контрольн/iu.test(t)) return "control";
  if (/рисун/.test(t)) return "drawing";
  if (/файлик|конспект|написать|дописать|схем/.test(t)) return "file";
  if (/§|лекци|параграф|учим|учить|читать/.test(t)) return "lecture";
  return "other";
}

export function parseBrief(raw: string, today = new Date()): BriefBlock[] {
  const blocks: BriefBlock[] = [];
  let current: BriefBlock | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const head = line.match(/^\s*дз\s+на\s+(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/i);
    if (head) {
      if (current) blocks.push(current);
      const control = /контрольн|(?:^|[^\p{L}])кр(?:[^\p{L}]|$)/iu.test(line);
      current = {
        date: resolveDate(Number(head[1]), Number(head[2]), head[3], today),
        dateText: `${head[1]}.${head[2]}`,
        theme: "",
        tasks: [],
        status: control ? "control" : "not_done",
      };
      continue;
    }
    if (!current) continue;
    const theme = line.match(/^\s*(?:тема|темы)\s*[:\-—]\s*(.+)$/i);
    if (theme) {
      current.theme = theme[1].trim().replace(/\.$/, "");
      if (/контрольн|(?:^|[^\p{L}])кр(?:[^\p{L}]|$)/iu.test(current.theme)) current.status = "control";
      continue;
    }
    if (/^\s*критери/i.test(line)) continue;
    const task = line.match(/^\s*(?:\d+[.)]|[-•*])\s+(.{2,300})$/);
    if (task) current.tasks.push({ text: task[1].trim(), kind: classify(task[1]) });
  }
  if (current) blocks.push(current);
  return blocks.filter((block) => block.theme || block.tasks.length);
}

function focusOf(items: PlanItem[]): string {
  const kinds = new Set(items.map((item) => item.kind));
  if (kinds.has("control")) return "Контрольная точка";
  if (kinds.has("tests")) return "Тесты";
  if (kinds.has("electronograms")) return "Электронограммы";
  if (kinds.has("drawing")) return "Рисунки";
  if (kinds.has("file")) return "Письменная работа";
  if (kinds.has("lecture")) return "Теория";
  return "Повторение";
}

export function buildStudyPlan(input: {
  brief: string;
  assignments?: MyAssignment[];
  today?: Date;
}): StudyPlan {
  const today = input.today ?? new Date();
  const todayIso = toIso(today);
  const blocks = parseBrief(input.brief, today);
  const risks: string[] = [];
  const perDay = new Map<string, PlanItem[]>();
  let seq = 0;

  const add = (rawDate: string | null, text: string, kind: StudyKind, source: PlanItem["source"]) => {
    if (!rawDate) return;
    const date = rawDate < todayIso ? todayIso : rawDate;
    const list = perDay.get(date) ?? [];
    if (list.some((item) => item.text === text)) return;
    list.push({ id: `${date}:${seq++}`, text, kind, source, minutes: MINUTES[kind] });
    perDay.set(date, list);
  };

  const loadOf = (date: string) =>
    (perDay.get(date) ?? []).reduce((sum, item) => sum + item.minutes, 0);

  /** Кладём в первый день, где не превышаем 150 минут; иначе — в последний. */
  const place = (dates: string[], text: string, kind: StudyKind, source: PlanItem["source"]) => {
    const fit = dates.find((date) => loadOf(date) + MINUTES[kind] <= 150);
    add(fit ?? dates[dates.length - 1], text, kind, source);
  };

  const control = blocks.find((block) => block.status === "control" && block.date) ?? null;
  const lastBlockDate = blocks.reduce<string | null>(
    (max, block) => (block.date && (!max || block.date > max) ? block.date : max),
    null,
  );
  const deadline = control?.date ?? lastBlockDate;

  // Явные даты внутри пунктов («17.11 — открытые тесты») ставим ровно на этот день.
  const anchored = new Set<string>();
  for (const block of blocks) {
    for (const task of block.tasks) {
      const date = dateInText(task.text, today);
      if (!date) continue;
      anchored.add(task.text);
      add(date, task.text, task.kind, "brief");
    }
  }

  for (const block of blocks) {
    const tasks = block.tasks.filter((task) => !anchored.has(task.text));
    if (!block.date) {
      if (tasks.length) {
        add(todayIso, `${block.theme || "Задание"} — срок не указан`, "other", "brief");
        risks.push(`Блок «${block.theme || block.dateText}» без даты: срок придётся уточнить у преподавателя.`);
      }
      continue;
    }

    if (block.status === "control") {
      const dayBefore = addDays(block.date, -1);
      const twoBefore = addDays(block.date, -2);
      add(block.date, "КР: 20 минут — тесты + одна электронограмма", "control", "brief");
      add(block.date, "Сдать за 2–3 минуты до таймера: +0,5 аннулирует одну ошибку", "control", "brief");
      add(dayBefore, "Генеральная репетиция: КР на время, 20 минут", "tests", "trainer");
      add(dayBefore, "Все 11 электронограмм: название + подписи", "electronograms", "trainer");
      add(twoBefore, "Прогнать список ошибок до нуля", "tests", "trainer");
      continue;
    }

    const overdue = block.date < todayIso;
    // Просроченное не втискиваем в сегодняшний день: сначала ближайшее занятие,
    // отработка — со следующего дня после него.
    const nextDeadline = blocks.reduce<string | null>((min, other) => {
      if (!other.date || other.date <= todayIso) return min;
      return !min || other.date < min ? other.date : min;
    }, null);
    const overdueStart = nextDeadline ? addDays(nextDeadline, 1) : todayIso;
    const slots = overdue
      ? [overdueStart, addDays(overdueStart, 1), addDays(overdueStart, 2)].filter(
          (date) => (!deadline || date <= deadline) && date >= todayIso,
        )
      : [addDays(block.date, -2), addDays(block.date, -1), block.date].filter((date) => date >= todayIso);
    const target = slots.length ? slots : [todayIso];

    if (overdue) {
      const start = target[0];
      add(start, `Отработка за ${block.dateText}: ${block.theme || "задание"}`, "control", "brief");
      risks.push(
        `Просрочено с ${block.dateText}: ${block.theme || "задание"}. В плане с ${dayLabel(start, todayIso)} — раньше не влезает, но сдать до КР обязательно.`,
      );
    }
    tasks.forEach((task) => place(target, task.text, task.kind, "brief"));
    if (!overdue) add(block.date, `Сдать: ${block.theme || "задание"}`, "other", "brief");
  }

  // Между делом — интервальные прогоны электронограмм до дня перед КР.
  if (deadline) {
    const stop = addDays(deadline, -1);
    for (let date = todayIso; date <= stop; date = addDays(date, 2)) {
      if (loadOf(date) + MINUTES.electronograms <= 150) {
        add(date, "Электронограммы: 11 названий + подписи", "electronograms", "trainer");
      }
    }
  }

  // Личные отработки: то, что студент отмечает в /assignments, сразу попадает в план.
  for (const assignment of input.assignments ?? []) {
    if (assignment.status === "passed") continue;
    const label = `${assignment.topic}${assignment.subject ? ` (${assignment.subject})` : ""}`;
    const due = /^\d{4}-\d{2}-\d{2}$/.test(assignment.due_date ?? "") ? (assignment.due_date as string) : null;
    if (!due || due < todayIso) {
      place([todayIso, addDays(todayIso, 1)], `Отработать: ${label}`, "control", "assignment");
      risks.push(`Отработка без будущего срока: ${label}. Поставь дату в «Отработках».`);
    } else {
      const prep = addDays(due, -1) < todayIso ? todayIso : addDays(due, -1);
      place([prep, todayIso], `Подготовить: ${label}`, "file", "assignment");
      add(due, `Сдать: ${label}`, "other", "assignment");
    }
  }

  const days: PlanDay[] = [...perDay.entries()]
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

  if (control) {
    risks.unshift(KR_RISK);
  } else if (/контрольн|(?:^|[^\p{L}])кр(?:[^\p{L}]|$)/iu.test(input.brief)) {
    risks.unshift("Дата КР не распознана: в тексте нет строки «Дз на дд.мм — КР». План построен по остальным срокам.");
  }

  return { days, risks, deadline };
}

/** Промпт для сайтового AI: меняем только формулировки, сроки остаются наши. */
export function buildAiPrompt(plan: StudyPlan): string {
  const days = plan.days
    .map((day) => `- ${day.date} (${day.label}): ${day.items.map((item) => item.text).join("; ")}`)
    .join("\n");
  return [
    "Ты — методист, готовишь студента-медика к контрольной по гистологии.",
    "Ниже готовый план: даты и пункты уже посчитаны, менять их нельзя.",
    "Для каждого дня перепиши фокус одной строкой до 60 символов: что именно делаем и зачем.",
    "Добавь 2–3 коротких совета по подготовке. Без выдуманных дат, тем и фактов.",
    'Ответ строго JSON без markdown: {"days":[{"date":"ГГГГ-ММ-ДД","focus":"..."}],"advice":["..."]}',
    "",
    days,
  ].join("\n");
}

export type AiPlanPatch = { days: Record<string, string>; advice: string[] };

/** Разбор ответа AI. Всё, что не совпало с нашими датами, отбрасывается. */
export function parseAiPlan(reply: string, plan: StudyPlan): AiPlanPatch {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return { days: {}, advice: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return { days: {}, advice: [] };
  }
  const data = parsed as { days?: Array<{ date?: unknown; focus?: unknown }>; advice?: unknown };
  const known = new Set(plan.days.map((day) => day.date));
  const days: Record<string, string> = {};
  for (const entry of Array.isArray(data.days) ? data.days : []) {
    const date = String(entry?.date ?? "");
    const focus = String(entry?.focus ?? "").trim();
    if (known.has(date) && focus) days[date] = focus.slice(0, 90);
  }
  const advice = (Array.isArray(data.advice) ? data.advice : [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);
  return { days, advice };
}

/** Оценка по числу ошибок — правила кафедры. */
export function krGrade(errors: number): 2 | 3 | 4 | 5 {
  if (errors <= 0) return 5;
  if (errors <= 3) return 4;
  if (errors <= 6) return 3;
  return 2;
}
