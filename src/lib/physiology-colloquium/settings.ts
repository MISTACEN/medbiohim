import {
  type BankQuestion,
  type PlanStage,
  type SituationalTask,
  type TestModule,
  type TheoryQuestion,
  type Topic,
  type TopicId,
  mcqQuestions,
  planStages,
  situationalTasks,
  testModules,
  theoryQuestions,
  topics,
  TOTAL_MINUTES,
} from "./content";

export type ColloquiumExamSettings = {
  default_question_count: number;
  pass_percent: number;
  default_minutes: number;
  max_attempts: number;
  question_counts: number[];
  timer_minutes: number[];
};

export type ColloquiumFeatures = {
  plan: boolean;
  theory: boolean;
  tests: boolean;
  tasks: boolean;
  exam: boolean;
};

export type ColloquiumSettings = {
  version: 1;
  enabled: boolean;
  subject_slug: string;
  subject_name: string;
  course_number: number | null;
  semester: number | null;
  title: string;
  subtitle: string;
  description: string;
  opens_at: string | null;
  closes_at: string | null;
  exam: ColloquiumExamSettings;
  plan: {
    total_minutes: number;
  };
  features: ColloquiumFeatures;
};

export type ColloquiumTestQuestion = Omit<BankQuestion, "options" | "correct"> & {
  options: { number: number; text: string }[];
  correct: number[];
};

export type ColloquiumContentSnapshot = {
  version: 1;
  topics: Topic[];
  test_modules: TestModule[];
  plan_stages: PlanStage[];
  theory: TheoryQuestion[];
  tests: ColloquiumTestQuestion[];
  tasks: SituationalTask[];
};

export type ColloquiumPayload = {
  settings: ColloquiumSettings;
  content: ColloquiumContentSnapshot | null;
  updated_at?: string | null;
  content_updated_at?: string | null;
  source?: "site_content" | "defaults";
  degraded?: boolean;
};

export const DEFAULT_COLLOQUIUM_SETTINGS: ColloquiumSettings = {
  version: 1,
  enabled: true,
  subject_slug: "physiology",
  subject_name: "Физиология",
  course_number: 2,
  semester: 3,
  title: "Коллоквиум по физиологии",
  subtitle: "Подготовка к коллоквиуму по физиологии возбудимых систем",
  description:
    "План подготовки: теория, тесты с разбором ошибок, ситуационные задачи и пробный экзамен.",
  opens_at: null,
  closes_at: null,
  exam: {
    default_question_count: 20,
    pass_percent: 70,
    default_minutes: 30,
    max_attempts: 0,
    question_counts: [10, 20, 30, 50],
    timer_minutes: [15, 30, 45, 60, 0],
  },
  plan: {
    total_minutes: TOTAL_MINUTES,
  },
  features: {
    plan: true,
    theory: true,
    tests: true,
    tasks: true,
    exam: true,
  },
};

export const DEFAULT_COLLOQUIUM_CONTENT: ColloquiumContentSnapshot = {
  version: 1,
  topics,
  test_modules: testModules,
  plan_stages: planStages,
  theory: theoryQuestions,
  tests: mcqQuestions.map((question) => ({
    ...question,
    options: question.options ?? [],
    correct: question.correct ?? [],
  })),
  tasks: situationalTasks,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, max);
}

function optionalText(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  return value.slice(0, max);
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isoDate(value: unknown, fallback: string | null): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function uniqueIntegers(value: unknown, fallback: number[], min: number, max: number): number[] {
  if (!Array.isArray(value)) return [...fallback];
  const result = Array.from(
    new Set(value.map((item) => integer(item, Number.NaN, min, max)).filter((item) => Number.isFinite(item))),
  ).slice(0, 12);
  return result.length ? result : [...fallback];
}

function normalizeTopics(input: unknown): Topic[] {
  if (!Array.isArray(input)) return topics;
  return input
    .filter(isRecord)
    .map((item, index) => ({
      id: text(item.id, topics[index]?.id ?? `topic-${index + 1}`, 40) as TopicId,
      title: text(item.title, topics[index]?.title ?? `Раздел ${index + 1}`, 200),
      shortTitle: text(item.shortTitle, topics[index]?.shortTitle ?? `Раздел ${index + 1}`, 80),
      description: text(item.description, topics[index]?.description ?? "", 1000),
      range: text(item.range, topics[index]?.range ?? "", 40),
    }))
    .filter((item) => item.id && item.title);
}

function normalizeModules(input: unknown): TestModule[] {
  if (!Array.isArray(input)) return testModules;
  return input
    .filter(isRecord)
    .map((item, index) => ({
      id: text(item.id, testModules[index]?.id ?? `module-${index + 1}`, 40),
      title: text(item.title, testModules[index]?.title ?? `Модуль ${index + 1}`, 200),
      shortTitle: text(item.shortTitle, testModules[index]?.shortTitle ?? `Модуль ${index + 1}`, 80),
      kind: item.kind === "open" ? ("open" as const) : ("mcq" as const),
    }))
    .filter((item) => item.id && item.title);
}

function stringArray(value: unknown, maxItems = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeStages(input: unknown): PlanStage[] {
  if (!Array.isArray(input)) return planStages;
  return input
    .filter(isRecord)
    .map((item, index) => ({
      id: text(item.id, planStages[index]?.id ?? `stage-${index + 1}`, 40),
      title: text(item.title, planStages[index]?.title ?? `Этап ${index + 1}`, 200),
      subtitle: text(item.subtitle, planStages[index]?.subtitle ?? "", 300),
      goal: text(item.goal, planStages[index]?.goal ?? "", 1000),
      theoryTopics: stringArray(item.theoryTopics) as TopicId[],
      testModules: stringArray(item.testModules),
      taskTopics: stringArray(item.taskTopics) as TopicId[],
      minutes: integer(item.minutes, planStages[index]?.minutes ?? 60, 1, 10000),
    }))
    .filter((item) => item.id && item.title);
}

function normalizeTheory(input: unknown): TheoryQuestion[] {
  if (!Array.isArray(input)) return theoryQuestions;
  return input
    .filter(isRecord)
    .map((item, index) => ({
      id: integer(item.id, index + 1, 1, 1000000),
      topic: text(item.topic, "basics", 40) as TopicId,
      title: text(item.title, "Без названия", 500),
      answer: text(item.answer, "", 5000),
      simple: text(item.simple, "", 5000),
    }))
    .filter((item) => item.title);
}

function normalizeOptions(input: unknown): { number: number; text: string }[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(isRecord)
    .map((item, index) => ({
      number: integer(item.number, index + 1, 1, 100),
      text: text(item.text, "", 2000),
    }))
    .filter((item) => item.text)
    .slice(0, 20);
}

function normalizeTests(input: unknown): ColloquiumTestQuestion[] {
  if (!Array.isArray(input)) return DEFAULT_COLLOQUIUM_CONTENT.tests;
  return input
    .filter(isRecord)
    .map((item, index) => {
      const options = normalizeOptions(item.options);
      const optionNumbers = new Set(options.map((option) => option.number));
      const correct = Array.isArray(item.correct)
        ? Array.from(
            new Set(
              item.correct
                .map((value) => integer(value, Number.NaN, 1, 100))
                .filter((value) => Number.isFinite(value) && optionNumbers.has(value)),
            ),
          )
        : [];
      return {
        id: integer(item.id, index + 1, 1, 1000000),
        module: text(item.module, "cell", 40),
        number: integer(item.number, index + 1, 1, 10000),
        question: text(item.question, "Без формулировки", 5000),
        options,
        correct,
        answer: text(item.answer, "", 5000),
        why: text(item.why, "", 5000),
        whyLabel: optionalText(item.whyLabel, "Пояснение", 100),
      };
    })
    .filter((item) => item.question && item.options.length > 0);
}

function normalizeTasks(input: unknown): SituationalTask[] {
  if (!Array.isArray(input)) return situationalTasks;
  return input
    .filter(isRecord)
    .map((item, index) => ({
      id: integer(item.id, index + 1, 1, 1000000),
      topic: text(item.topic, "membrane", 40) as TopicId,
      title: text(item.title, "Без названия", 500),
      question: text(item.question, "", 5000),
      answer: text(item.answer, "", 5000),
      simple: text(item.simple, "", 5000),
    }))
    .filter((item) => item.title && item.question);
}

export function normalizeColloquiumSettings(input: unknown): ColloquiumSettings {
  const value = isRecord(input) ? input : {};
  const exam = isRecord(value.exam) ? value.exam : {};
  const plan = isRecord(value.plan) ? value.plan : {};
  const features = isRecord(value.features) ? value.features : {};

  return {
    version: 1,
    enabled: boolean(value.enabled, DEFAULT_COLLOQUIUM_SETTINGS.enabled),
    subject_slug: text(value.subject_slug, DEFAULT_COLLOQUIUM_SETTINGS.subject_slug, 100),
    subject_name: text(value.subject_name, DEFAULT_COLLOQUIUM_SETTINGS.subject_name, 200),
    course_number:
      value.course_number === null || value.course_number === ""
        ? null
        : integer(value.course_number, 2, 1, 6),
    semester:
      value.semester === null || value.semester === ""
        ? null
        : integer(value.semester, 3, 1, 12),
    title: text(value.title, DEFAULT_COLLOQUIUM_SETTINGS.title, 200),
    subtitle: optionalText(value.subtitle, DEFAULT_COLLOQUIUM_SETTINGS.subtitle, 500),
    description: optionalText(value.description, DEFAULT_COLLOQUIUM_SETTINGS.description, 5000),
    opens_at: isoDate(value.opens_at, null),
    closes_at: isoDate(value.closes_at, null),
    exam: {
      default_question_count: integer(
        exam.default_question_count,
        DEFAULT_COLLOQUIUM_SETTINGS.exam.default_question_count,
        1,
        500,
      ),
      pass_percent: integer(exam.pass_percent, DEFAULT_COLLOQUIUM_SETTINGS.exam.pass_percent, 1, 100),
      default_minutes: integer(exam.default_minutes, DEFAULT_COLLOQUIUM_SETTINGS.exam.default_minutes, 0, 600),
      max_attempts: integer(exam.max_attempts, DEFAULT_COLLOQUIUM_SETTINGS.exam.max_attempts, 0, 100),
      question_counts: uniqueIntegers(
        exam.question_counts,
        DEFAULT_COLLOQUIUM_SETTINGS.exam.question_counts,
        1,
        500,
      ),
      timer_minutes: uniqueIntegers(
        exam.timer_minutes,
        DEFAULT_COLLOQUIUM_SETTINGS.exam.timer_minutes,
        0,
        600,
      ),
    },
    plan: {
      total_minutes: integer(plan.total_minutes, DEFAULT_COLLOQUIUM_SETTINGS.plan.total_minutes, 1, 100000),
    },
    features: {
      plan: boolean(features.plan, true),
      theory: boolean(features.theory, true),
      tests: boolean(features.tests, true),
      tasks: boolean(features.tasks, true),
      exam: boolean(features.exam, true),
    },
  };
}

export function normalizeColloquiumContent(input: unknown): ColloquiumContentSnapshot {
  const value = isRecord(input) ? input : {};
  return {
    version: 1,
    topics: normalizeTopics(value.topics),
    test_modules: normalizeModules(value.test_modules),
    plan_stages: normalizeStages(value.plan_stages),
    theory: normalizeTheory(value.theory),
    tests: normalizeTests(value.tests),
    tasks: normalizeTasks(value.tasks),
  };
}

export function createDefaultColloquiumContent(): ColloquiumContentSnapshot {
  return normalizeColloquiumContent(DEFAULT_COLLOQUIUM_CONTENT);
}

export function totalMinutesFor(settings: ColloquiumSettings, content: ColloquiumContentSnapshot): number {
  return settings.plan.total_minutes || content.plan_stages.reduce((sum, stage) => sum + stage.minutes, 0);
}

export type ColloquiumAvailability = {
  open: boolean;
  reason: string | null;
};

export function colloquiumAvailability(
  settings: ColloquiumSettings,
  now = new Date(),
): ColloquiumAvailability {
  if (!settings.enabled) {
    return { open: false, reason: "Коллоквиум временно отключён администратором." };
  }
  if (settings.opens_at && now.getTime() < new Date(settings.opens_at).getTime()) {
    return {
      open: false,
      reason: `Коллоквиум откроется ${new Date(settings.opens_at).toLocaleString("ru-RU")}.`,
    };
  }
  if (settings.closes_at && now.getTime() > new Date(settings.closes_at).getTime()) {
    return {
      open: false,
      reason: `Коллоквиум закрыт ${new Date(settings.closes_at).toLocaleString("ru-RU")}.`,
    };
  }
  return { open: true, reason: null };
}

export function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
