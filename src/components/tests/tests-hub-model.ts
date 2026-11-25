/**
 * Модель меню тестов (TestsHub) — чистые типы, константы и функции без React.
 *
 * Выделено из TestsHub.tsx в ходе архитектурного аудита 2026-11-22: компонент
 * был монолитом на 1131 строк с четырьмя ответственностями (типы, загрузка/
 * маппинг, конвейер фильтров, вью). Здесь — данные и правила; состояние и
 * разметка остаются в компоненте.
 *
 * MAIN_SUBJECT_LABELS — осознанные UI-подписи главных предметов. Канон
 * слаг-маппинга и остальных подписей — `lib/subjectSlug.ts`
 * (`subjectDisplayName`); здесь только отличающиеся подписи и порядок пиллюлей.
 */
import { resolveSubjectSlug } from "@/lib/subjectSlug";

export type Mode = "prepare" | "solve" | "exam" | "sequential";

export type CurriculumTopic = {
  topic_id?: string;
  title?: string;
  question_count?: number;
  test_count?: number;
  planned_date?: string | null;
  is_extra?: boolean;
  order_index?: number;
};

export type CurriculumModule = {
  module_id?: string;
  title?: string;
  order_index?: number;
  topics?: CurriculumTopic[];
};

export type CurriculumSubject = {
  subject_id?: string;
  subject_name?: string;
  unclassified_questions?: number;
  modules?: CurriculumModule[];
};

export type TestItem = {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  subjectSlug: string;
  moduleId: string;
  moduleTitle: string;
  topicId: string;
  topicTitle: string;
  knowledgeLevel?: number | null;
  moduleKey: string;
  topicKey: string;
  moduleRank: number;
  isFallbackModule: boolean;
  questionCount: number;
  source: string;
  orderIndex: number;
  timeLimitSec: number | null;
  maxAttempts: number | null;
  /** id более крупного теста с тем же составом: такую копию не показываем. */
  duplicateOf: string | null;
};

export type TopicGroup = {
  key: string;
  moduleId: string;
  moduleTitle: string;
  title: string;
  plannedDate: string | null;
  isExtra: boolean;
  moduleOrder: number;
  topicOrder: number;
  questionCount: number;
  tests: TestItem[];
};

export type ModuleGroup = {
  key: string;
  title: string;
  count: number;
  topics: number;
  order: number;
  fallback: boolean;
};

export type SubjectOption = {
  key: string;
  label: string;
  slug: string;
  count: number;
};

export type TopicMeta = {
  moduleId: string;
  topicId: string;
  moduleTitle: string;
  topicTitle: string;
  plannedDate: string | null;
  isExtra: boolean;
  moduleOrder: number;
  topicOrder: number;
};

/**
 * D9: совокупный результат загрузки хаба тестов. `ready: false` — версия
 * «ещё не готовы» (идёт bootstrap авторизации), страница показывает скелетон.
 */
export type TestsLoad =
  | { ready: false }
  | { ready: true; tests: TestItem[]; curriculum: CurriculumSubject[] };

export type ManualSection = {
  title: string;
  count: number;
  subsections: { title: string; from: number; to: number; count: number }[];
};

export const MAIN_SUBJECT_LABELS: Record<string, string> = {
  histology: "Гистология",
  physiology: "Физиология",
  organic_chemistry: "Органическая химия",
  probability: "Вероятность и статистика",
  chemistry_organic_physical: "Органическая химия",
};

export const MAIN_SUBJECT_ORDER = ["histology", "physiology", "organic_chemistry", "probability"];

export const MODES: Array<{ id: Mode; label: string; short: string; hint: string }> = [
  { id: "prepare", label: "Подготовка", short: "Проверка сразу", hint: "Можно отвечать и сразу видеть результат." },
  { id: "solve", label: "Решение", short: "Проверка в конце", hint: "Ответы сохраняются, эталоны — после завершения." },
  { id: "exam", label: "Экзамен", short: "Без эталонов", hint: "Режим экзамена: эталоны не показываются до конца." },
  { id: "sequential", label: "Весь банк", short: "По порядку", hint: "Все вопросы банка подряд, прогресс сохраняется." },
];

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function plural(n: number, one: string, few: string, many: string) {
  const value = Math.abs(n) % 100;
  const last = value % 10;
  if (value > 10 && value < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

export function subjectLabel(slug: string, name: string) {
  return MAIN_SUBJECT_LABELS[resolveSubjectSlug(slug)] || name || slug || "Предмет";
}

export function subjectRank(slug: string, name: string) {
  const canonical = resolveSubjectSlug(slug, name);
  const index = MAIN_SUBJECT_ORDER.indexOf(canonical);
  return index === -1 ? 99 : index;
}

export function dateLabel(value?: string | null) {
  if (!value) return "";
  const date = new Date(String(value).length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function buildHref(test: TestItem, mode: Mode, count: number) {
  const params = new URLSearchParams();
  if (mode === "sequential") {
    params.set("flow", "sequential");
    params.set("mode", "prepare");
  } else {
    params.set("mode", mode);
    params.set("count", String(count));
  }
  const subject = subjectLabel(test.subjectSlug, test.subjectName);
  if (subject) params.set("subject", subject);
  return `/tests/preparation/${encodeURIComponent(test.id)}?${params.toString()}`;
}

/**
 * Открыть экран запуска банка: режим, количество и состав выбираются уже там.
 * Список банков больше не задаёт режим за студента — иначе один и тот же
 * выбор приходилось делать дважды (в списке и на экране запуска).
 */
export function preparationHref(test: TestItem) {
  const params = new URLSearchParams();
  const subject = subjectLabel(test.subjectSlug, test.subjectName);
  if (subject) params.set("subject", subject);
  const qs = params.toString();
  return `/tests/preparation/${encodeURIComponent(test.id)}${qs ? `?${qs}` : ""}`;
}

/** Пройти только часть банка: позиции 1-based в порядке методички. */
export function buildRangeHref(test: TestItem, from: number, to: number) {
  const params = new URLSearchParams();
  params.set("mode", "prepare");
  params.set("flow", "sequential");
  params.set("from", String(from));
  params.set("to", String(to));
  const subject = subjectLabel(test.subjectSlug, test.subjectName);
  if (subject) params.set("subject", subject);
  return `/tests/preparation/${encodeURIComponent(test.id)}?${params.toString()}`;
}

export function buildBankHref(test: TestItem, mode: Mode, count: number) {
  const params = new URLSearchParams();
  if (mode === "sequential") {
    params.set("flow", "sequential");
    params.set("mode", "prepare");
  } else {
    params.set("mode", mode);
    params.set("count", String(count));
  }
  const subject = subjectLabel(test.subjectSlug, test.subjectName);
  if (subject) params.set("subject", subject);
  if (test.moduleTitle && test.moduleTitle !== subject) params.set("module", test.moduleTitle);
  if (test.topicTitle) params.set("topic", test.topicTitle);
  return `/tests/bank/${encodeURIComponent(test.id)}${params.toString() ? `?${params.toString()}` : ""}`;
}

/** Строки ApiTest → TestItem: отбрасываем дубли и битые id. */
export function mapApiTests(rows: Array<Record<string, unknown>>): TestItem[] {
  return rows
    .map((raw, index): TestItem => {
      const subjectRow = (raw?.subjects && (Array.isArray(raw.subjects) ? raw.subjects[0] : raw.subjects)) || {};
      const rowSubjectSlug = String(raw?.subject_slug || subjectRow?.slug || "");
      const rowSubjectName = String(raw?.subject_name || subjectRow?.name || "");
      return {
        id: String(raw?.id ?? ""),
        title: String(raw?.title || raw?.name || "Тест"),
        subjectId: String(raw?.subject_id || ""),
        subjectName: rowSubjectName,
        subjectSlug: rowSubjectSlug,
        moduleId: String(raw?.module_id || ""),
        moduleTitle: String(raw?.module_title || ""),
        topicId: String(raw?.topic_id || ""),
        topicTitle: String(raw?.topic_title || ""),
        moduleKey: "",
        topicKey: "",
        moduleRank: 999,
        isFallbackModule: false,
        questionCount: Number(raw?.questions_count ?? raw?.question_count ?? 0),
        source: String(raw?.source_file_name || raw?.source_key || "база тестов"),
        orderIndex: Number(raw?.order_index ?? index),
        timeLimitSec: raw?.time_limit_sec != null && Number(raw.time_limit_sec) > 0 ? Number(raw.time_limit_sec) : null,
        maxAttempts: raw?.max_attempts != null && Number(raw.max_attempts) > 0 ? Number(raw.max_attempts) : null,
        duplicateOf: raw?.duplicate_of ? String(raw.duplicate_of) : null,
      };
    })
    // Копии не выбрасываем сразу: из них собирается строка «тот же банк
    // называется иначе» — иначе знакомый тест исчезал из меню бесследно.
    .filter((item) => item.id);
}

/** Канонический банк → другие названия того же набора вопросов. */
export function aliasMap(tests: TestItem[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const test of tests) {
    if (!test.duplicateOf) continue;
    const list = map.get(test.duplicateOf) || [];
    const title = test.title.trim();
    if (title && !list.includes(title)) list.push(title);
    map.set(test.duplicateOf, list);
  }
  return map;
}

/** Индекс «тема → метаданные плана» из карты учебного плана. */
export function buildTopicMeta(curriculum: CurriculumSubject[]): Map<string, TopicMeta> {
  const map = new Map<string, TopicMeta>();
  for (const subject of curriculum) {
    (subject.modules || []).forEach((module, moduleIndex) => {
      (module.topics || []).forEach((topic, topicIndex) => {
        if (!topic.topic_id) return;
        map.set(String(topic.topic_id), {
          moduleId: String(module.module_id || ""),
          topicId: String(topic.topic_id || ""),
          moduleTitle: String(module.title || "Раздел"),
          topicTitle: String(topic.title || "Тема"),
          plannedDate: topic.planned_date ? String(topic.planned_date) : null,
          isExtra: Boolean(topic.is_extra),
          moduleOrder: Number(module.order_index ?? moduleIndex),
          topicOrder: Number(topic.order_index ?? topicIndex),
        });
      });
    });
  }
  return map;
}

/** Обогащение тестов метаданными плана: ключи, ранги, фолбэк-разделы. */
export function enrichTests(tests: TestItem[], topicMeta: Map<string, TopicMeta>): TestItem[] {
  return tests.map((test) => {
    const meta = topicMeta.get(test.topicId);
    const subjectKey = test.subjectId || test.subjectSlug || test.subjectName || "other";
    const fallbackSubject = subjectLabel(test.subjectSlug, test.subjectName) || "Без предмета";
    const apiModuleTitle = test.moduleTitle.trim();
    const apiTopicTitle = test.topicTitle.trim();
    const hasModuleMeta = Boolean(meta?.moduleTitle) || Boolean(apiModuleTitle && apiModuleTitle !== "Без раздела");
    const hasTopicMeta = Boolean(meta?.topicTitle) || Boolean(apiTopicTitle && apiTopicTitle !== "Без темы");
    const isFallbackModule = !hasModuleMeta;
    const moduleTitle = hasModuleMeta ? (apiModuleTitle || meta?.moduleTitle || "Раздел") : fallbackSubject;
    const topicTitle = hasTopicMeta ? (apiTopicTitle || meta?.topicTitle || "Тема") : "Банки вопросов";
    const moduleKey = isFallbackModule
      ? `subject:${subjectKey}`
      : (test.moduleId || meta?.moduleId || moduleTitle);
    const topicKey = hasTopicMeta
      ? (test.topicId || meta?.topicId || topicTitle)
      : `${moduleKey}:banks`;
    return {
      ...test,
      moduleTitle,
      topicTitle,
      moduleKey,
      topicKey,
      moduleRank: isFallbackModule
        ? subjectRank(test.subjectSlug, test.subjectName)
        : (meta?.moduleOrder ?? 999),
      isFallbackModule,
    };
  });
}

/** Группировка обогащённых тестов по темам с дедупом служебных банков. */
export function groupTopics(
  levelFiltered: TestItem[],
  moduleFilter: string,
  topicMeta: Map<string, TopicMeta>,
): TopicGroup[] {
  const map = new Map<string, TopicGroup>();
  for (const test of levelFiltered) {
    if ((test.source || "").startsWith("phys_full:") || (test.source || "").startsWith("phys_sub:")) continue;
    if (moduleFilter !== "all" && test.moduleKey !== moduleFilter) continue;
    const key = test.topicKey;
    const meta = topicMeta.get(test.topicId);
    const current = map.get(key);
    if (current) {
      current.tests.push(test);
      current.questionCount += test.questionCount;
    } else {
      map.set(key, {
        key,
        moduleId: test.moduleKey,
        moduleTitle: test.moduleTitle,
        title: test.topicTitle,
        plannedDate: meta?.plannedDate || null,
        isExtra: Boolean(meta?.isExtra),
        moduleOrder: test.moduleRank,
        topicOrder: meta?.topicOrder ?? 999,
        questionCount: test.questionCount,
        tests: [test],
      });
    }
  }
  return Array.from(map.values())
    .map((group) => {
      // Дедуп: одинаковые банки (тот же объём и название) показываем один раз —
      // раньше «Банк тестовых заданий…» и «Тест по теме занятия» дублировали друг друга.
      const seen = new Set<string>();
      const deduped = group.tests.filter((test) => {
        const key = `${(test.title || "").trim().toLowerCase()}|${test.questionCount}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      // Буквальный «Тест по теме занятия» рядом с содержательным банком того же
      // объёма — тот же импорт под служебным именем. Осмысленные пары (например,
      // два разных банка по 374 вопроса) не трогаем.
      const GENERIC_TITLE = /^(тест по теме занятия|тест по теме|банк тестовых заданий|занятие)$/i;
      const cleaned = deduped.filter((test) => {
        if (!GENERIC_TITLE.test((test.title || "").trim())) return true;
        return !deduped.some(
          (other) =>
            other.id !== test.id &&
            other.questionCount === test.questionCount &&
            !GENERIC_TITLE.test((other.title || "").trim()),
        );
      });
      return {
        ...group,
        tests: cleaned.slice().sort((a, b) => a.orderIndex - b.orderIndex || a.title.localeCompare(b.title, "ru")),
        questionCount: cleaned.reduce((sum, t) => sum + t.questionCount, 0),
      };
    })
    .sort((a, b) => {
      if (a.moduleOrder !== b.moduleOrder) return a.moduleOrder - b.moduleOrder;
      const moduleCompare = a.moduleTitle.localeCompare(b.moduleTitle, "ru");
      if (moduleCompare !== 0) return moduleCompare;
      if (a.topicOrder !== b.topicOrder) return a.topicOrder - b.topicOrder;
      return a.title.localeCompare(b.title, "ru");
    });
}

/** Разбор JSON методички физики в разделы с диапазонами. */
export function parseManualSections(json: Record<string, unknown>): ManualSection[] {
  const questions = (bank: any) => (Array.isArray(bank?.questions) ? bank.questions : []);
  return (Array.isArray(json?.banks) ? json.banks : []).map((bank: any) => ({
    title: String(bank?.title || ""),
    count: questions(bank).length,
    subsections: (Array.isArray(bank?.subsections) ? bank.subsections : [])
      .map((sub: any) => {
        const from = Number(sub?.from);
        const to = Number(sub?.to);
        const count = questions(bank).filter((q: any) => Number(q?.number) >= from && Number(q?.number) <= to).length;
        return { title: String(sub?.title || ""), from, to, count };
      })
      .filter((sub: any) => Number.isFinite(sub.from) && Number.isFinite(sub.to) && sub.to >= sub.from),
  }));
}

/** Разделы «Полных тестов»: мега-микс + методички, для отдельной первой секции. */
export function splitFullTests(levelFiltered: TestItem[], tests: TestItem[]) {
  const fullTests = levelFiltered.filter((test) => (test.source || "").startsWith("phys_full:"));
  const subMap = new Map<string, string>();
  for (const test of tests) {
    const source = test.source || "";
    if (source.startsWith("phys_sub:")) subMap.set(source, test.id);
  }
  const mega = fullTests.find((t) => (t.source || "") === "phys_full:physiology") || null;
  const manuals = fullTests
    .filter((t) => (t.source || "") !== "phys_full:physiology")
    .sort((a, b) => (a.source || "").localeCompare(b.source || ""));
  return { fullTests, subMap, mega, manuals };
}

/** Вопросов в обычных банках (без phys_full/phys_sub). */
export function countRegularQuestions(tests: TestItem[]): number {
  return tests
    .filter((t) => !(t.source || "").startsWith("phys_full:") && !(t.source || "").startsWith("phys_sub:"))
    .reduce((sum, test) => sum + test.questionCount, 0);
}
