export const COLLOQUIUM_DEFAULTS = {
  version: 1,
  enabled: true,
  subject_slug: "physiology",
  subject_name: "Физиология",
  course_number: 2,
  semester: 3,
  title: "Коллоквиум по физиологии",
  subtitle: "Подготовка к коллоквиуму по физиологии возбудимых систем",
  description: "План подготовки: теория, тесты с разбором ошибок, ситуационные задачи и пробный экзамен.",
  opens_at: null as string | null,
  closes_at: null as string | null,
  exam: {
    default_question_count: 20,
    pass_percent: 70,
    default_minutes: 30,
    max_attempts: 0,
    question_counts: [10, 20, 30, 50],
    timer_minutes: [15, 30, 45, 60, 0],
  },
  plan: {
    total_minutes: 705,
  },
  features: {
    plan: true,
    theory: true,
    tests: true,
    tasks: true,
    exam: true,
  },
};

export const COLLOQUIUM_MAX_PAYLOAD_BYTES = 1_500_000;
const SUBJECT_RE = /^[a-z0-9][a-z0-9_-]{1,99}$/i;
const SUBJECT_ALIASES: Record<string, string> = {
  "sub-phys": "physiology",
  phys: "physiology",
};

export function parseColloquiumSubject(raw: unknown): string | null {
  const value = String(raw || "").trim().toLowerCase();
  if (!value || !SUBJECT_RE.test(value)) return null;
  return SUBJECT_ALIASES[value] || value;
}

export function colloquiumSettingsKey(subject: string): string {
  return `colloquium:${subject}`;
}

export function colloquiumContentKey(subject: string): string {
  return `colloquium:${subject}:content`;
}

export function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function validText(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.trim().length >= min && value.length <= max;
}

function normalizeDate(value: unknown): { value: string | null } | { error: true } {
  if (value === null || value === "") return { value: null };
  if (typeof value !== "string") return { error: true };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { error: true };
  return { value: date.toISOString() };
}

function uniqueIntArray(value: unknown, min: number, max: number): number[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 12) return null;
  const numbers = value.filter((item) => validInteger(item, min, max));
  if (numbers.length !== value.length) return null;
  return Array.from(new Set(numbers));
}

export function mergeColloquiumSettings(
  input: unknown,
  current: unknown,
): { value: any } | { error: string } {
  if (!isRecord(input)) return { error: "Ожидается JSON-объект настроек" };
  const base = isRecord(current) ? current : COLLOQUIUM_DEFAULTS;
  const next: any = {
    ...COLLOQUIUM_DEFAULTS,
    ...base,
    exam: { ...COLLOQUIUM_DEFAULTS.exam, ...(isRecord(base.exam) ? base.exam : {}) },
    plan: { ...COLLOQUIUM_DEFAULTS.plan, ...(isRecord(base.plan) ? base.plan : {}) },
    features: { ...COLLOQUIUM_DEFAULTS.features, ...(isRecord(base.features) ? base.features : {}) },
    version: 1,
  };

  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") return { error: "enabled должен быть boolean" };
    next.enabled = input.enabled;
  }
  if (input.subject_slug !== undefined) {
    if (typeof input.subject_slug !== "string" || !SUBJECT_RE.test(input.subject_slug.trim())) {
      return { error: "subject_slug имеет недопустимый формат" };
    }
    next.subject_slug = input.subject_slug.trim().toLowerCase();
  }
  if (input.subject_name !== undefined) {
    if (!validText(input.subject_name, 1, 200)) return { error: "subject_name: 1–200 символов" };
    next.subject_name = input.subject_name.trim();
  }
  if (input.course_number !== undefined) {
    if (input.course_number !== null && input.course_number !== "" && !validInteger(input.course_number, 1, 6)) {
      return { error: "course_number: целое число 1–6 или null" };
    }
    next.course_number = input.course_number === null || input.course_number === "" ? null : input.course_number;
  }
  if (input.semester !== undefined) {
    if (input.semester !== null && input.semester !== "" && !validInteger(input.semester, 1, 12)) {
      return { error: "semester: целое число 1–12 или null" };
    }
    next.semester = input.semester === null || input.semester === "" ? null : input.semester;
  }
  if (input.title !== undefined) {
    if (!validText(input.title, 1, 200)) return { error: "title: 1–200 символов" };
    next.title = input.title.trim();
  }
  if (input.subtitle !== undefined) {
    if (typeof input.subtitle !== "string" || input.subtitle.length > 500) {
      return { error: "subtitle: не более 500 символов" };
    }
    next.subtitle = input.subtitle;
  }
  if (input.description !== undefined) {
    if (typeof input.description !== "string" || input.description.length > 5000) {
      return { error: "description: не более 5000 символов" };
    }
    next.description = input.description;
  }
  if (input.opens_at !== undefined) {
    const parsed = normalizeDate(input.opens_at);
    if ("error" in parsed) return { error: "opens_at: некорректная дата" };
    next.opens_at = parsed.value;
  }
  if (input.closes_at !== undefined) {
    const parsed = normalizeDate(input.closes_at);
    if ("error" in parsed) return { error: "closes_at: некорректная дата" };
    next.closes_at = parsed.value;
  }
  if (next.opens_at && next.closes_at && new Date(next.opens_at) >= new Date(next.closes_at)) {
    return { error: "Дата открытия должна быть раньше даты закрытия" };
  }

  if (input.exam !== undefined) {
    if (!isRecord(input.exam)) return { error: "exam должен быть объектом" };
    const exam = input.exam;
    if (exam.default_question_count !== undefined) {
      if (!validInteger(exam.default_question_count, 1, 500)) {
        return { error: "exam.default_question_count: целое число 1–500" };
      }
      next.exam.default_question_count = exam.default_question_count;
    }
    if (exam.pass_percent !== undefined) {
      if (!validInteger(exam.pass_percent, 1, 100)) {
        return { error: "exam.pass_percent: целое число 1–100" };
      }
      next.exam.pass_percent = exam.pass_percent;
    }
    if (exam.default_minutes !== undefined) {
      if (!validInteger(exam.default_minutes, 0, 600)) {
        return { error: "exam.default_minutes: целое число 0–600" };
      }
      next.exam.default_minutes = exam.default_minutes;
    }
    if (exam.max_attempts !== undefined) {
      if (!validInteger(exam.max_attempts, 0, 100)) {
        return { error: "exam.max_attempts: целое число 0–100" };
      }
      next.exam.max_attempts = exam.max_attempts;
    }
    if (exam.question_counts !== undefined) {
      const values = uniqueIntArray(exam.question_counts, 1, 500);
      if (!values) return { error: "exam.question_counts: массив целых чисел 1–500" };
      next.exam.question_counts = values;
    }
    if (exam.timer_minutes !== undefined) {
      const values = uniqueIntArray(exam.timer_minutes, 0, 600);
      if (!values) return { error: "exam.timer_minutes: массив целых чисел 0–600" };
      next.exam.timer_minutes = values;
    }
  }

  if (input.plan !== undefined) {
    if (!isRecord(input.plan)) return { error: "plan должен быть объектом" };
    if (input.plan.total_minutes !== undefined) {
      if (!validInteger(input.plan.total_minutes, 1, 100000)) {
        return { error: "plan.total_minutes: целое число 1–100000" };
      }
      next.plan.total_minutes = input.plan.total_minutes;
    }
  }

  if (input.features !== undefined) {
    if (!isRecord(input.features)) return { error: "features должен быть объектом" };
    for (const key of ["plan", "theory", "tests", "tasks", "exam"]) {
      if (input.features[key] !== undefined) {
        if (typeof input.features[key] !== "boolean") {
          return { error: `features.${key} должен быть boolean` };
        }
        next.features[key] = input.features[key];
      }
    }
  }

  if (JSON.stringify(next).length > 64_000) return { error: "Настройки слишком большие" };
  return { value: next };
}

function normText(value: unknown, max: number, fallback = ""): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function normInt(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

function normStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.slice(0, 40))
    .slice(0, 20);
}

function normalizeOptions(value: unknown): { number: number; text: string }[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const result: { number: number; text: string }[] = [];
  for (const option of value) {
    if (!isRecord(option) || !validInteger(option.number, 1, 100)) return null;
    if (!validText(option.text, 1, 2000)) return null;
    if (result.some((item) => item.number === option.number)) return null;
    result.push({ number: option.number, text: option.text });
  }
  return result;
}

export function normalizeColloquiumContent(input: unknown): { value: any } | { error: string } {
  if (!isRecord(input)) return { error: "Ожидается JSON-объект контента" };
  const serialized = JSON.stringify(input);
  if (serialized.length > COLLOQUIUM_MAX_PAYLOAD_BYTES) {
    return { error: "Контент слишком большой" };
  }

  const topics = Array.isArray(input.topics) ? input.topics : [];
  const modules = Array.isArray(input.test_modules) ? input.test_modules : [];
  const stages = Array.isArray(input.plan_stages) ? input.plan_stages : [];
  const theory = Array.isArray(input.theory) ? input.theory : [];
  const tests = Array.isArray(input.tests) ? input.tests : [];
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  if (topics.length > 30) return { error: "Слишком много разделов" };
  if (modules.length > 30) return { error: "Слишком много тестовых модулей" };
  if (stages.length > 30) return { error: "Слишком много этапов" };
  if (theory.length > 1000) return { error: "Слишком много вопросов теории" };
  if (tests.length > 1500) return { error: "Слишком много тестов" };
  if (tasks.length > 500) return { error: "Слишком много задач" };

  const normalizedTopics = topics.map((topic: any) => {
    if (!isRecord(topic) || !validText(topic.id, 1, 40) || !validText(topic.title, 1, 200)) {
      throw new Error("Некорректный раздел в topics");
    }
    return {
      id: topic.id.trim(),
      title: topic.title.trim(),
      shortTitle: normText(topic.shortTitle, 80, topic.title.trim().slice(0, 80)),
      description: normText(topic.description, 1000),
      range: normText(topic.range, 40),
    };
  });

  const normalizedModules = modules.map((module: any) => {
    if (!isRecord(module) || !validText(module.id, 1, 40) || !validText(module.title, 1, 200)) {
      throw new Error("Некорректный модуль в test_modules");
    }
    return {
      id: module.id.trim(),
      title: module.title.trim(),
      shortTitle: normText(module.shortTitle, 80, module.title.trim().slice(0, 80)),
      kind: module.kind === "open" ? "open" : "mcq",
    };
  });

  const normalizedStages = stages.map((stage: any) => {
    if (!isRecord(stage) || !validText(stage.id, 1, 40) || !validText(stage.title, 1, 200)) {
      throw new Error("Некорректный этап в plan_stages");
    }
    return {
      id: stage.id.trim(),
      title: stage.title.trim(),
      subtitle: normText(stage.subtitle, 300),
      goal: normText(stage.goal, 1000),
      theoryTopics: normStringArray(stage.theoryTopics),
      testModules: normStringArray(stage.testModules),
      taskTopics: normStringArray(stage.taskTopics),
      minutes: normInt(stage.minutes, 1, 10000, 60),
    };
  });

  const normalizedTheory = theory.map((item: any) => {
    if (!isRecord(item) || !validText(item.title, 1, 500)) {
      throw new Error("Некорректный вопрос теории");
    }
    return {
      id: normInt(item.id, 1, 1_000_000, 1),
      topic: normText(item.topic, 40, "basics"),
      title: item.title.trim(),
      answer: normText(item.answer, 5000),
      simple: normText(item.simple, 5000),
    };
  });

  const normalizedTests = tests.map((item: any) => {
    if (!isRecord(item) || !validText(item.question, 1, 5000)) {
      throw new Error("Некорректный тестовый вопрос");
    }
    const options = normalizeOptions(item.options);
    if (!options || options.length < 2) throw new Error("У тестового вопроса должно быть минимум 2 варианта");
    const optionNumbers = new Set(options.map((option) => option.number));
    if (!Array.isArray(item.correct) || !item.correct.length) {
      throw new Error("У тестового вопроса должен быть правильный вариант");
    }
    const correct = Array.from(
      new Set(
        item.correct
          .filter((value: unknown) => typeof value === "number" && optionNumbers.has(value))
          .map((value: number) => value),
      ),
    );
    if (!correct.length) throw new Error("Правильный вариант теста не найден среди options");
    return {
      id: normInt(item.id, 1, 1_000_000, 1),
      module: normText(item.module, 40, "cell"),
      number: normInt(item.number, 1, 10000, 1),
      question: item.question.trim(),
      options,
      correct,
      answer: normText(item.answer, 5000),
      why: normText(item.why, 5000),
      whyLabel: normText(item.whyLabel, 100, "Пояснение"),
    };
  });

  const normalizedTasks = tasks.map((item: any) => {
    if (!isRecord(item) || !validText(item.title, 1, 500) || !validText(item.question, 1, 5000)) {
      throw new Error("Некорректная ситуационная задача");
    }
    return {
      id: normInt(item.id, 1, 1_000_000, 1),
      topic: normText(item.topic, 40, "membrane"),
      title: item.title.trim(),
      question: item.question.trim(),
      answer: normText(item.answer, 5000),
      simple: normText(item.simple, 5000),
    };
  });

  return {
    value: {
      version: 1,
      topics: normalizedTopics,
      test_modules: normalizedModules,
      plan_stages: normalizedStages,
      theory: normalizedTheory,
      tests: normalizedTests,
      tasks: normalizedTasks,
    },
  };
}
