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

export type ProgramTask = {
  id: string;
  kind: StudyKind;
  text: string;
  hint?: string;
  minutes: number;
};

export type ProgramBlock = {
  id: string;
  /** Как срок назван в задании: «23.10», «на следующую неделю». */
  dateText: string;
  /** Явный дедлайн. null — «к следующей неделе / к КР», без выдуманной даты. */
  due: string | null;
  theme: string;
  short: string;
  lectureId: string | null;
  lectureNote?: string;
  tasks: ProgramTask[];
};

export type ProgramEvent = {
  id: string;
  date: string;
  text: string;
  kind: StudyKind;
  minutes: number;
  hint?: string;
};

export type Program = {
  subject: string;
  blocks: ProgramBlock[];
  events: ProgramEvent[];
  kr: {
    defaultDate: string;
    minutes: number;
    variants: number;
    electronograms: number;
    rules: string[];
    risk: string;
    bonus: string;
  };
};

export const KR_DATE_DEFAULT = "2026-11-20";

/** Дословный главный риск преподавателя — это часть задания, не пересказ. */
export const KR_RISK =
  "КР — открытого типа, варианты заучивать бесполезно, поэтому 17.11 (открытые тесты) и 19.11 (§ 6) не пропускать. И не путать продольный/поперечный срез миелинового волокна — это самая частая потеря балла.";

export const KR_RULES = [
  "20 минут на работу; тестовая часть — вопросы из сборника, поделённые на 4 варианта.",
  "Одна электронограмма из 11: название и подписи — на «3»/«4», плюс теория — на «5».",
  "«3» — 4–6 ошибок, «4» — 1–3, «5» — 0 ошибок и полная теория по электронограмме.",
  "+0,5 за сдачу до таймера аннулирует одну ошибку (например, 0 ошибок в тесте + теория, но 1 ошибка → «5»).",
];

export const KR_GRADES = [
  { grade: 3, errors: "4–6", electronogram: "только название и подписи" },
  { grade: 4, errors: "1–3", electronogram: "только название и подписи" },
  { grade: 5, errors: "0", electronogram: "название, подписи + теория" },
];

/**
 * Блоки ДЗ в том виде, в каком их дал преподаватель. Задачи разложены по
 * механизмам: лекция → файлик → рисунок → электронограммы → тест.
 */
export const HISTOLOGY_PROGRAM: Program = {
  subject: "Гистология",
  blocks: [
    {
      id: "skel-2026-10-23",
      dateText: "23.10",
      due: "2026-10-23",
      theme: "Скелетные соединительные ткани: кости и хрящи",
      short: "Скелетные ткани (23.10)",
      lectureId: "hist-07-hryaschevye-kostnye",
      tasks: [
        {
          id: "skel-lecture",
          kind: "lecture",
          text: "Лекция БЯ по скелетным тканям + раздел учебника",
          minutes: 40,
        },
        {
          id: "skel-file-cartilage",
          kind: "file",
          text: "Файлик по хрящевым тканям — написать и выучить",
          minutes: 60,
        },
        {
          id: "skel-file-bone",
          kind: "file",
          text: "Файлик по костным тканям — написать и выучить",
          minutes: 60,
        },
        {
          id: "skel-test",
          kind: "tests",
          text: "Тест по теме «Скелетные ткани»",
          minutes: 40,
        },
      ],
    },
    {
      id: "nerv-2026-11-06",
      dateText: "06.11",
      due: "2026-11-06",
      theme: "Нервные ткани: клетки, классификации, волокна",
      short: "Нервные ткани: клетки и волокна (06.11)",
      lectureId: "hist-09-nervnaya-tkan",
      tasks: [
        {
          id: "nerv-lecture",
          kind: "lecture",
          text: "Лекция БЯ и § 9.1–9.5: нейроциты, классификации, нейроглия, волокна",
          minutes: 50,
        },
        {
          id: "nerv-file",
          kind: "file",
          text: "Файлик по нервным тканям — писать целиком сразу",
          hint: "Он один общий на два занятия: не дели на «к 06.11» и «к 13.11», преподаватель принимает один файл.",
          minutes: 90,
        },
        {
          id: "nerv-drawing",
          kind: "drawing",
          text: "Рисунок «нервное волокно»",
          hint: "В задании отмечено, что рисунок снова должен «двигаться». Если формат непонятен — уточни у преподавателя до сдачи.",
          minutes: 40,
        },
        {
          id: "nerv-em",
          kind: "electronograms",
          text: "Электронограммы: миелиновое волокно — поперечный и продольный разрез",
          hint: "Самая частая потеря балла: продольный — волокно вдоль, перехваты и насечки; поперечный — кольца миелина вокруг осевого цилиндра.",
          minutes: 40,
        },
      ],
    },
    {
      id: "syn-2026-11-13",
      dateText: "13.11",
      due: "2026-11-13",
      theme: "Нервные ткани: синапсы, нервные окончания",
      short: "Синапсы и окончания (13.11)",
      lectureId: "hist-10-nervnaya-sistema",
      lectureNote:
        "Эта часть темы обычно идёт в лекции по спинному мозгу — смотреть там. Строение синапса при этом подробно разобрано в § 9.6 лекции о нервной ткани.",
      tasks: [
        {
          id: "syn-lecture",
          kind: "lecture",
          text: "Лекция БЯ по синапсам (в лекции по спинному мозгу) + § 9.6",
          minutes: 50,
        },
        {
          id: "syn-file-repeat",
          kind: "file",
          text: "Повторить общий файлик по нервным тканям",
          minutes: 30,
        },
        {
          id: "syn-drawing",
          kind: "drawing",
          text: "Рисунок «нервно-мышечный синапс»",
          hint: "Если в лекции нет образца и не уверен, какой именно рисунок нужен — уточни у преподавателя.",
          minutes: 40,
        },
        {
          id: "syn-em",
          kind: "electronograms",
          text: "Электронограмма: нервно-мышечный синапс",
          hint: "Подписи: аксональная терминаль, синаптические пузырьки, пресинаптический полюс, синаптическая щель, постсинаптический полюс, вторичные щели.",
          minutes: 30,
        },
        {
          id: "syn-test",
          kind: "tests",
          text: "Подготовиться к тесту по нервным тканям",
          minutes: 40,
        },
      ],
    },
    {
      id: "cyt-next-week",
      dateText: "на следующую неделю",
      due: null,
      theme: "Цитология: ядро, жизненный цикл клетки, регенерация и регуляция",
      short: "Цитология к КР",
      lectureId: "hist-02-citologiya-yadro-cikl",
      lectureNote:
        "Лекции БЯ по этой теме не было — раздел учебника читать самостоятельно. На сайте это лекция «Цитология: ядро, жизненный цикл клетки».",
      tasks: [
        {
          id: "cyt-lecture",
          kind: "lecture",
          text: "Раздел учебника по цитологии: ядро, ЖЦК, регенерация, регуляция",
          minutes: 60,
        },
        {
          id: "cyt-file",
          kind: "file",
          text: "Файлик «1. Цитология» — от ядра до конца: написать и выучить",
          hint: "Самый долгий пункт и база тестовой части КР. Начинать 14.11, иначе к 20.11 не успеть.",
          minutes: 120,
        },
        {
          id: "cyt-em-10-11",
          kind: "electronograms",
          text: "Электронограммы 10 и 11: ядро и апоптоз",
          minutes: 40,
        },
        {
          id: "cyt-em-repeat",
          kind: "electronograms",
          text: "Повторить электронограммы 1–9",
          minutes: 40,
        },
        {
          id: "cyt-drawing",
          kind: "drawing",
          text: "Схема жизненного цикла клетки",
          minutes: 60,
        },
        {
          id: "cyt-kr-prep",
          kind: "tests",
          text: "Готовиться к КР: тесты + одна электронограмма",
          minutes: 60,
        },
      ],
    },
  ],
  events: [
    {
      id: "kr-17-open",
      date: "2026-11-17",
      text: "Открытые тесты — все 45 вопросов",
      kind: "tests",
      minutes: 60,
      hint: "Не пропускать: это прямая подготовка к тестовой части КР, варианты заучивать бесполезно.",
    },
    {
      id: "kr-19-rehearsal",
      date: "2026-11-19",
      text: "Генеральная репетиция КР на 20 минут",
      kind: "control",
      minutes: 30,
    },
    {
      id: "kr-19-section6",
      date: "2026-11-19",
      text: "§ 6 — 45 вопросов-ответов",
      kind: "lecture",
      minutes: 40,
    },
  ],
  kr: {
    defaultDate: KR_DATE_DEFAULT,
    minutes: 20,
    variants: 4,
    electronograms: 11,
    rules: KR_RULES,
    risk: KR_RISK,
    bonus: "+0,5 за сдачу до таймера аннулирует одну ошибку.",
  },
};

/** Пункты КР, которые студент отмечает сам: печать, репетиция, § 6. */
export const KR_ACTIONS: ProgramTask[] = [
  {
    id: "kr-print-em",
    kind: "electronograms",
    text: "Распечатать электронограммы и сложить в порядке стенда",
    minutes: 20,
  },
  {
    id: "kr-17-open",
    kind: "tests",
    text: "17.11 — открытые тесты, все 45 вопросов",
    hint: "Не пропускать.",
    minutes: 60,
  },
  {
    id: "kr-19-rehearsal",
    kind: "control",
    text: "19.11 — генеральная репетиция КР на 20 минут",
    minutes: 30,
  },
  {
    id: "kr-19-section6",
    kind: "lecture",
    text: "19.11 — § 6: 45 вопросов-ответов",
    minutes: 40,
  },
  {
    id: "kr-exam",
    kind: "control",
    text: "КР: тест + одна из 11 электронограмм",
    minutes: 20,
  },
];

/** Текст преподавателя целиком — источник, по которому сверяются сроки. */
export const TEACHER_TEXT = [
  "Дз на 23.10",
  "ТЕМА: Скелетные соединительные ткани: кости и хрящи",
  "1. Лекцию БЯ по этой теме учим; и соответствующий раздел в учебнике читаем",
  "2. Написать файлики по костным и хрящевым тканям и выучить",
  "3. Готовиться к тесту по теме",
  "",
  "Дз на 06.11",
  "ТЕМА: Нервные ткани: клетки, классификации, волокна.",
  "1. Лекцию БЯ по этой теме учим; и соответствующий раздел в учебнике читаем",
  "2. Написать файлик по нервным тканям и выучить (он один общий на два занятия, пишем целиком сразу)",
  "3. Нарисовать рисунок «нервное волокно» (есть в файлике, рисунок снова должен двигаться)",
  "4. Выучить новые электронограммы: миелиновое нервное волокно поперечный и продольный разрез",
  "",
  "Дз на 13.11",
  "ТЕМА: Нервные ткани: Синапсы, нервные окончания.",
  "1. Лекцию БЯ по этой теме учим (эту часть темы БЯ дает обычно в лекции по спинному мозгу, смотреть там); и соответствующий раздел в учебнике читаем",
  "2. Написанный файлик по нервным тканям выучить/повторить",
  "3. Нарисовать рисунок «нервно мышечный синапс» (если в лекции нет и вы не уверены какой рисунок нужно нарисовать, уточните у меня)",
  "4. Выучить электронограмму: нервно мышечный синапс",
  "5. Готовиться к тесту по нервным тканям",
  "",
  "Дз на следующую неделю",
  "ТЕМА: Цитология. Ядро, жизненный цикл клетки, регенерация и регуляция",
  "1. Лекцию БЯ по этой теме не читал, поэтому прочитать соответствующий раздел в учебнике самостоятельно",
  "2. Написать файлик «1. Цитология» (от ядра до конца) и ВЫУЧИТЬ",
  "3. Выучить электронограммы 10, 11 (ядро, апоптоз), и повторить первые 9",
  "4. Нарисовать в дз схему жизненного цикла клетки",
  "5. Готовиться к контрольной работе",
  "",
  "В контрольной работе будет тестовая часть (вопросы из сборника тестовых заданий, поделены на 4 варианта) и одна из 11 электронограмм.",
  "",
  "Требования для получения на КР:",
  "«3» — в тестовой части 4–6 ошибок; по электронограмме только название и подписи",
  "«4» — в тесте 1–3 ошибки; электронограмма — только название и подписи",
  "«5» — 0 ошибок в тесте; по электронограмме помимо названия и подписей дополнить теорией",
  "",
  "Система +0,5 балла: 20 минут на КР, кто успеет сдать до таймера, получает полбалла. Они аннулируют одну ошибку.",
  "Распечатать электронограммы, составить в правильном порядке как на стенде.",
].join("\n");

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

const ROADMAP_GROUPS: Array<{ id: string; title: string; why: string; blockIds: string[] }> = [
  {
    id: "nerve",
    title: "Нервная ткань: файл, два рисунка, две электронограммы",
    why: "Файл один на два занятия: он закрывает и 06.11, и 13.11. Ближайшее занятие — 13.11, поэтому это первое, что сдаём.",
    blockIds: ["nerv-2026-11-06", "syn-2026-11-13"],
  },
  {
    id: "cyto",
    title: "Цитология к КР: файлик «1. Цитология», схема ЖЦК, ЭМ 10/11",
    why: "Это материал контрольной: тестовая часть и одна из 11 электронограмм. Без файлика и схемы «5» не собрать.",
    blockIds: ["cyt-next-week"],
  },
  {
    id: "skel",
    title: "Закрыть скелетные ткани (23.10)",
    why: "Старый долг: лекция, два файлика, тест. В КР не входит, но висит и мешает спокойно готовиться.",
    blockIds: ["skel-2026-10-23"],
  },
  {
    id: "kr",
    title: "КР: печать, открытые тесты, репетиция",
    why: "КР открытого типа: заучивать варианты бесполезно. 17.11 и 19.11 — точки, которые нельзя пропустить.",
    blockIds: [],
  },
];

/**
 * Ход сдачи: «что за чем». Показывает только невыполненные задачи, но
 * прогресс и состав блока сохраняет — чтобы не казалось, что пункт исчез.
 */
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
    "Сделай четыре вещи:",
    "1) для каждого дня перепиши фокус одной строкой до 60 символов — что именно делаем и зачем;",
    "2) расставь приоритет блоков (id) — что сдавать первым и почему;",
    "3) дай 2–3 коротких совета по подготовке;",
    "4) честно назови 2–3 пункта, которые реально не успеть, если ничего не менять.",
    "Без выдуманных дат, тем и фактов. Ответ строго JSON без markdown:",
    '{"days":[{"date":"ГГГГ-ММ-ДД","focus":"..."}],"priority":["nerve","cyto"],"advice":["..."],"cut":["..."]}',
    "",
    "Блоки:",
    blocks,
    "",
    "План по дням:",
    days,
  ].join("\n");
}

export type AiPlanPatch = {
  days: Record<string, string>;
  advice: string[];
  priority: string[];
  cut: string[];
};

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