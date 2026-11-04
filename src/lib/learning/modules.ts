/**
 * Единый реестр учебных модулей и межпредметных связей.
 *
 * Один модуль = одна реализация (`base` — существующий маршрут) и одна запись
 * прогресса. Связи описывают, в каких дисциплинах модуль уместен, насколько
 * глубоко, к каким темам относится и почему вообще показан.
 *
 * Дисциплины в базе неоднородны: часть строк имеет `slug = NULL` (биохимия,
 * патофизиология, фармакология, генетика, биофизика, анатомия), есть дубли
 * с одинаковым slug. Поэтому предмет определяется по slug, точному
 * нормализованному названию и явным префиксам, а не сравнением одной строки.
 */

import { SIMULATIONS } from "@/lib/sim/catalog";

export type SubjectAreaKey =
  | "chemistry_organic_physical"
  | "inorganic_chemistry"
  | "analytical_toxicology"
  | "biochemistry"
  | "biology"
  | "cytology"
  | "histology"
  | "embryology"
  | "genetics"
  | "molecular_biology"
  | "physiology"
  | "pathophysiology"
  | "pharmacology"
  | "physics"
  | "optics"
  | "biophysics"
  | "medical_technology"
  | "anatomy"
  | "pathological_anatomy"
  | "microbiology"
  | "immunology";

export type Applicability = 1 | 2 | 3;

/** 1 — профильная дисциплина, 2 — содержательно применимо, 3 — вспомогательно. */
export const APPLICABILITY_LABELS: Record<Applicability, string> = {
  1: "Профильный",
  2: "Применимый",
  3: "Вспомогательный",
};

export type SubjectArea = {
  key: SubjectAreaKey;
  name: string;
  /** Slug, под которым дисциплина встречается в базе. */
  slugs: string[];
  /** Точные нормализованные названия, включая дубли и длинные формулировки. */
  names: string[];
  /** Явные префиксы для составных названий вида «Медицинская биохимия: …». */
  prefixes: string[];
};

export const SUBJECT_AREAS: SubjectArea[] = [
  {
    key: "chemistry_organic_physical",
    name: "Органическая и физическая химия",
    slugs: ["chemistry_organic_physical", "organic_chemistry"],
    names: ["органическая и физическая химия", "органическая химия", "физическая химия"],
    prefixes: ["органическая химия", "физическая химия"],
  },
  {
    key: "inorganic_chemistry",
    name: "Неорганическая химия",
    slugs: ["inorganic_chemistry"],
    names: ["неорганическая химия"],
    prefixes: ["неорганическая химия"],
  },
  {
    key: "analytical_toxicology",
    name: "Аналитическая токсикология",
    slugs: [],
    names: ["аналитическая токсикология"],
    prefixes: ["аналитическая токсикология"],
  },
  {
    key: "biochemistry",
    name: "Биохимия",
    slugs: [],
    names: ["биохимия", "общая биохимия"],
    prefixes: ["биохимия", "общая биохимия", "медицинская биохимия", "биохимическая косметология"],
  },
  {
    key: "biology",
    name: "Биология",
    slugs: ["biology"],
    names: ["биология"],
    prefixes: ["биология"],
  },
  {
    key: "cytology",
    name: "Цитология",
    slugs: [],
    names: ["цитология"],
    prefixes: ["цитология"],
  },
  {
    key: "histology",
    name: "Гистология, цитология",
    slugs: ["histology", "histology_cytology"],
    names: ["гистология", "гистология, цитология", "гистология цитология"],
    prefixes: ["гистология"],
  },
  {
    key: "embryology",
    name: "Эмбриология",
    slugs: [],
    names: ["эмбриология"],
    prefixes: ["эмбриология"],
  },
  {
    key: "genetics",
    name: "Генетика",
    slugs: [],
    names: ["генетика", "общая генетика", "медицинская генетика"],
    prefixes: ["генетика", "общая генетика", "медицинская генетика"],
  },
  {
    key: "molecular_biology",
    name: "Молекулярная биология",
    slugs: [],
    names: ["молекулярная биология"],
    prefixes: ["молекулярная биология"],
  },
  {
    key: "physiology",
    name: "Физиология",
    slugs: ["physiology", "normal_physiology"],
    names: ["физиология", "нормальная физиология"],
    prefixes: ["физиология", "нормальная физиология"],
  },
  {
    key: "pathophysiology",
    name: "Патофизиология",
    slugs: [],
    names: ["патофизиология"],
    prefixes: ["патофизиология"],
  },
  {
    key: "pharmacology",
    name: "Фармакология",
    slugs: [],
    names: ["фармакология", "основы клинической фармакологии"],
    prefixes: ["фармакология", "клиническая фармакология"],
  },
  {
    key: "physics",
    name: "Физика",
    slugs: ["physics"],
    names: ["физика", "механика, электричество", "механика электричество"],
    prefixes: ["физика", "механика, электричество"],
  },
  {
    key: "optics",
    name: "Оптика, атомная физика",
    slugs: ["optics"],
    names: ["оптика, атомная физика", "оптика"],
    prefixes: ["оптика"],
  },
  {
    key: "biophysics",
    name: "Общая и медицинская биофизика",
    slugs: [],
    names: ["общая и медицинская биофизика", "биофизика", "медицинская биофизика"],
    prefixes: ["биофизика", "медицинская биофизика", "общая и медицинская биофизика"],
  },
  {
    key: "medical_technology",
    name: "Медицинские технологии и электроника",
    slugs: [],
    names: ["медицинские технологии", "медицинская электроника"],
    prefixes: ["медицинские технологии", "медицинская электроника"],
  },
  {
    key: "anatomy",
    name: "Анатомия",
    slugs: [],
    names: ["анатомия", "анатомия человека"],
    prefixes: ["анатомия"],
  },
  {
    key: "pathological_anatomy",
    name: "Патологическая анатомия",
    slugs: [],
    names: ["патологическая анатомия"],
    prefixes: ["патологическая анатомия"],
  },
  {
    key: "microbiology",
    name: "Микробиология",
    slugs: [],
    names: ["микробиология", "микробиология, вирусология"],
    prefixes: ["микробиология"],
  },
  {
    key: "immunology",
    name: "Иммунология",
    slugs: [],
    names: ["общая и клиническая иммунология", "иммунология"],
    prefixes: ["иммунология"],
  },
];

export function normalizeSubjectName(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSlug(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

const AREA_BY_KEY = new Map<string, SubjectArea>(SUBJECT_AREAS.map((area) => [area.key, area]));
const AREA_BY_SLUG = new Map<string, SubjectArea>(
  SUBJECT_AREAS.flatMap((area) => area.slugs.map((slug) => [slug, area] as const)),
);
const AREA_BY_NAME = new Map<string, SubjectArea>(
  SUBJECT_AREAS.flatMap((area) => area.names.map((name) => [normalizeSubjectName(name), area] as const)),
);

/** Самые длинные префиксы проверяются первыми: «патофизиология» ≠ «физиология». */
const PREFIX_RULES: Array<{ prefix: string; area: SubjectArea }> = SUBJECT_AREAS
  .flatMap((area) => area.prefixes.map((prefix) => ({ prefix: normalizeSubjectName(prefix), area })))
  .sort((a, b) => b.prefix.length - a.prefix.length);

/**
 * Предмет → предметная область. Принимает slug, название или ключ области.
 * Неизвестный предмет возвращает null: показывать чужие инструменты нельзя.
 */
export function resolveSubjectAreaKey(identity: {
  slug?: string | null;
  name?: string | null;
}): SubjectAreaKey | null {
  const slug = normalizeSlug(identity.slug);
  if (slug) {
    const bySlug = AREA_BY_SLUG.get(slug);
    if (bySlug) return bySlug.key;
    if (AREA_BY_KEY.has(slug)) return slug as SubjectAreaKey;
  }
  const name = normalizeSubjectName(identity.name);
  if (!name) return null;
  if (AREA_BY_NAME.has(name)) return AREA_BY_NAME.get(name)!.key;
  const byPrefix = PREFIX_RULES.find((rule) => name.startsWith(rule.prefix));
  return byPrefix ? byPrefix.area.key : null;
}

export function subjectAreaName(key: SubjectAreaKey | null | undefined): string {
  if (!key) return "";
  return AREA_BY_KEY.get(key)?.name ?? "";
}

export type ModuleKind = "core" | "cross" | "tool" | "reference";

export const MODULE_KIND_LABELS: Record<ModuleKind, string> = {
  core: "Основной модуль",
  cross: "Межпредметный модуль",
  tool: "Инструмент",
  reference: "Справочник",
};

export type ModuleFunction =
  | "simulation"
  | "calculator"
  | "editor"
  | "reference"
  | "trainer"
  | "lab"
  | "library"
  | "tests"
  | "atlas"
  | "progress";

export const MODULE_FUNCTION_LABELS: Record<ModuleFunction, string> = {
  simulation: "Симуляция",
  calculator: "Калькулятор",
  editor: "Редактор структур",
  reference: "Справочник",
  trainer: "Тренажёр",
  lab: "Лаборатория",
  library: "Библиотека",
  tests: "Тесты",
  atlas: "Атлас",
  progress: "Прогресс",
};

export type ModuleRelation = {
  level: Applicability;
  /** Почему модуль уместен в этой дисциплине. */
  reason: string;
  /** Конкретные темы дисциплины, к которым относится модуль. */
  topics: string[];
};

export type LearningModule = {
  id: string;
  title: string;
  subtitle: string;
  kind: ModuleKind;
  primary: SubjectAreaKey;
  categories: string[];
  functions: ModuleFunction[];
  /** Существующий маршрут; новые копии под предметы не создаются. */
  base: string;
  /** Для симуляций — slug из общего каталога (он же ключ прогресса). */
  simulationSlug?: string;
  /** Ключ прогресса пользователя: не зависит от предмета, из которого открыли. */
  progressKey: string;
  relations: Partial<Record<SubjectAreaKey, ModuleRelation>>;
};

function allAreas(level: Applicability, reason: string): Partial<Record<SubjectAreaKey, ModuleRelation>> {
  const map: Partial<Record<SubjectAreaKey, ModuleRelation>> = {};
  for (const area of SUBJECT_AREAS) map[area.key] = { level, reason, topics: [] };
  return map;
}

const CHEMISTRY_CORE: LearningModule[] = [
  {
    id: "chemistry.elements",
    title: "Периодическая таблица элементов",
    subtitle: "118 элементов: свойства, категории, карточка элемента",
    kind: "reference",
    primary: "inorganic_chemistry",
    categories: ["Строение вещества", "Справочник"],
    functions: ["reference"],
    base: "/chemistry/elements",
    progressKey: "chemistry.elements",
    relations: {
      inorganic_chemistry: { level: 1, reason: "Основной справочник курса неорганической химии.", topics: ["Периодический закон", "Строение атома"] },
      chemistry_organic_physical: { level: 2, reason: "Свойства элементов объясняют реакционную способность органических соединений.", topics: ["Электроотрицательность", "Химическая связь"] },
      biochemistry: { level: 2, reason: "Биоэлементы и микроэлементы — основа биохимии.", topics: ["Биоэлементы", "Металлы в ферментах"] },
      biology: { level: 3, reason: "Химический состав клетки опирается на свойства элементов.", topics: ["Химический состав клетки"] },
      pharmacology: { level: 2, reason: "Неорганические лекарственные средства и токсичность элементов.", topics: ["Неорганические препараты"] },
      analytical_toxicology: { level: 2, reason: "Идентификация элементов в токсикологическом анализе.", topics: ["Элементный анализ"] },
    },
  },
  {
    id: "chemistry.workbench",
    title: "Химическое ядро: структуры и механизмы",
    subtitle: "2D/3D-структуры, проекции, механизмы реакций",
    kind: "core",
    primary: "chemistry_organic_physical",
    categories: ["Строение вещества", "Реакции"],
    functions: ["editor", "reference"],
    base: "/chemistry",
    progressKey: "chemistry.workbench",
    relations: {
      chemistry_organic_physical: { level: 1, reason: "Профильный редактор структур и механизмов органической химии.", topics: ["Изомерия", "Механизмы реакций"] },
      inorganic_chemistry: { level: 2, reason: "Геометрия молекул и координационные соединения.", topics: ["Пространственное строение"] },
      biochemistry: { level: 3, reason: "Строение метаболитов и биополимеров.", topics: ["Структура биомолекул"] },
      pharmacology: { level: 3, reason: "Строение молекул лекарственных веществ.", topics: ["Структура лекарств"] },
    },
  },
  {
    id: "chemistry.solutions",
    title: "Растворы и pH",
    subtitle: "Разведение C₁V₁ = C₂V₂, сильные и слабые электролиты, буферы",
    kind: "cross",
    primary: "chemistry_organic_physical",
    categories: ["Растворы", "Кислотно-основное равновесие"],
    functions: ["calculator"],
    base: "/chemistry/tools",
    progressKey: "chemistry.solutions",
    relations: {
      chemistry_organic_physical: { level: 2, reason: "Расчёты концентраций для лабораторных по органической и физической химии.", topics: ["Растворы", "Буферные системы"] },
      inorganic_chemistry: { level: 2, reason: "Приготовление растворов и pH неорганических электролитов.", topics: ["Ионные равновесия", "pH"] },
      biochemistry: { level: 2, reason: "Буферные системы и осмолярность — рабочий расчёт биохимии.", topics: ["Буферные системы крови", "Осмолярность"] },
      physiology: { level: 2, reason: "Кислотно-основное равновесие и буферы крови.", topics: ["КОС", "Буферные системы"] },
      pharmacology: { level: 2, reason: "Концентрации растворов и pH для лекарственных форм.", topics: ["Растворы препаратов"] },
      biology: { level: 3, reason: "Осмос и водно-солевой обмен клетки.", topics: ["Осмос"] },
    },
  },
  {
    id: "chemistry.lab",
    title: "Виртуальная химическая лаборатория",
    subtitle: "Титрование, элемент Нернста, Бугер–Ламберт–Бер",
    kind: "core",
    primary: "inorganic_chemistry",
    categories: ["Лаборатория", "Анализ"],
    functions: ["lab"],
    base: "/chemistry/lab",
    progressKey: "chemistry.lab",
    relations: {
      inorganic_chemistry: { level: 1, reason: "Практикум по равновесиям и электрохимии.", topics: ["Титрование", "Электрохимия"] },
      chemistry_organic_physical: { level: 2, reason: "Физико-химические измерения и оптика растворов.", topics: ["Спектрофотометрия"] },
      biochemistry: { level: 3, reason: "Спектрофотометрия и электрохимические методы в биохимии.", topics: ["Фотометрия", "Потенциометрия"] },
      pharmacology: { level: 3, reason: "Анализ концентраций лекарственных веществ.", topics: ["Количественный анализ"] },
      analytical_toxicology: { level: 2, reason: "Инструментальные методы анализа.", topics: ["Фотометрия", "Потенциометрия"] },
    },
  },
  {
    id: "chemistry.practice",
    title: "Генератор химических задач",
    subtitle: "8 тем, воспроизводимый seed, пошаговые решения",
    kind: "core",
    primary: "chemistry_organic_physical",
    categories: ["Задачи", "Тренажёр"],
    functions: ["trainer"],
    base: "/chemistry/practice",
    progressKey: "chemistry.practice",
    relations: {
      chemistry_organic_physical: { level: 1, reason: "Профильный банк расчётных задач.", topics: ["Расчёты по уравнениям", "Растворы"] },
      inorganic_chemistry: { level: 2, reason: "Задачи на равновесия, газы и растворы.", topics: ["Газы", "Растворы"] },
      biochemistry: { level: 3, reason: "Расчётные задачи биохимического практикума.", topics: ["Расчёты концентраций"] },
    },
  },
];

/** Симуляции: одна реализация, разные предметные связи. */
const SIM_RELATIONS: Record<string, Partial<Record<SubjectAreaKey, ModuleRelation>>> = {
  "enzyme-kinetics": {
    biology: { level: 2, reason: "Ферменты — раздел биологии и молекулярной биологии.", topics: ["Ферменты", "Метаболизм"] },
    biochemistry: { level: 1, reason: "Кинетика ферментов — профильная тема биохимии.", topics: ["Ферментативный катализ", "Ингибирование"] },
    chemistry_organic_physical: { level: 2, reason: "Формальная кинетика и константы связывания.", topics: ["Химическая кинетика"] },
    pharmacology: { level: 3, reason: "Конкурентное ингибирование объясняет действие препаратов.", topics: ["Ингибиторы ферментов"] },
    pathophysiology: { level: 3, reason: "Изменение активности ферментов при патологии.", topics: ["Ферментопатии"] },
  },
  "buffer-titration": {
    chemistry_organic_physical: { level: 1, reason: "Профильная модель кислотно-основного титрования.", topics: ["Титрование", "Буферная зона"] },
    inorganic_chemistry: { level: 2, reason: "Ионные равновесия и кривые титрования.", topics: ["Ионные равновесия"] },
    biochemistry: { level: 2, reason: "Буферные системы и их ёмкость.", topics: ["Буферные системы"] },
    physiology: { level: 2, reason: "Регуляция pH крови опирается на буферы.", topics: ["КОС", "Буферы крови"] },
    pharmacology: { level: 3, reason: "pH влияет на ионизацию и всасывание препаратов.", topics: ["Ионизация лекарств"] },
  },
  "membrane-potential": {
    physiology: { level: 1, reason: "Профильная модель потенциала покоя.", topics: ["Мембранный потенциал", "Ионные градиенты"] },
    biochemistry: { level: 3, reason: "Работа Na⁺/K⁺-насоса и энергия градиентов.", topics: ["Ионный транспорт"] },
    biology: { level: 2, reason: "Транспорт через мембрану — общая тема клетки.", topics: ["Мембранный транспорт"] },
    histology: { level: 2, reason: "Электрофизиология клеточных мембран.", topics: ["Клеточная мембрана"] },
    pathophysiology: { level: 2, reason: "Нарушения возбудимости при изменении ионного состава.", topics: ["Нарушения возбудимости"] },
    biophysics: { level: 2, reason: "Биофизика мембран и электрогенез.", topics: ["Биоэлектричество"] },
  },
  osmosis: {
    chemistry_organic_physical: { level: 2, reason: "Коллигативные свойства растворов.", topics: ["Осмотическое давление"] },
    inorganic_chemistry: { level: 2, reason: "Осмос как свойство растворов электролитов.", topics: ["Растворы электролитов"] },
    biology: { level: 2, reason: "Водно-солевой обмен клетки.", topics: ["Осмос", "Тургор"] },
    histology: { level: 2, reason: "Тонус клетки и изменения объёма.", topics: ["Тонус клетки"] },
    physiology: { level: 2, reason: "Осмолярность плазмы и распределение воды.", topics: ["Водно-солевой баланс"] },
    pathophysiology: { level: 3, reason: "Гипо- и гиперосмолярные состояния.", topics: ["Нарушения водного баланса"] },
    biochemistry: { level: 3, reason: "Осмолярность биологических жидкостей.", topics: ["Осмолярность"] },
  },
  "oxygen-hemoglobin": {
    physiology: { level: 1, reason: "Профильная модель транспорта кислорода.", topics: ["Газообмен", "Кривая диссоциации"] },
    biochemistry: { level: 2, reason: "Структура и кооперативность гемоглобина.", topics: ["Гемоглобин", "Аллостерия"] },
    biology: { level: 3, reason: "Функция белков-переносчиков.", topics: ["Белки"] },
    pathophysiology: { level: 3, reason: "Сдвиги кривой при ацидозе и гипоксии.", topics: ["Гипоксия"] },
  },
  "hardy-weinberg": {
    biology: { level: 1, reason: "Профильная модель популяционной генетики.", topics: ["Популяционная генетика"] },
    genetics: { level: 2, reason: "Частоты аллелей и генотипов в популяции.", topics: ["Частоты аллелей"] },
    molecular_biology: { level: 3, reason: "Полиморфизмы и распределение аллелей.", topics: ["Полиморфизмы"] },
  },
};

const SIM_MODULES: LearningModule[] = SIMULATIONS.map((simulation) => ({
  id: `sim.${simulation.slug}`,
  title: simulation.title,
  subtitle: simulation.summary,
  kind: "cross",
  primary: simulation.subjectSlug as SubjectAreaKey,
  categories: ["Симуляции", "Практика"],
  functions: ["simulation"],
  base: `/labs/simulations?slug=${encodeURIComponent(simulation.slug)}`,
  simulationSlug: simulation.slug,
  progressKey: `sim.${simulation.slug}`,
  relations: SIM_RELATIONS[simulation.slug] ?? {},
}));

const SHARED_MODULES: LearningModule[] = [
  {
    id: "atlas.histology",
    title: "Атлас микропрепаратов",
    subtitle: "Микропрепараты и электронограммы с описаниями",
    kind: "core",
    primary: "histology",
    categories: ["Морфология", "Атлас"],
    functions: ["atlas"],
    base: "/atlas",
    progressKey: "atlas.histology",
    relations: {
      histology: { level: 1, reason: "Профильный атлас курса гистологии.", topics: ["Эпителии", "Ткани"] },
      cytology: { level: 1, reason: "Цитология изучается по тем же препаратам.", topics: ["Клетка", "Органеллы"] },
      embryology: { level: 2, reason: "Препараты эмбрионального развития.", topics: ["Эмбриогенез"] },
      pathological_anatomy: { level: 2, reason: "Сравнение нормы и патологии на препаратах.", topics: ["Патология тканей"] },
      biology: { level: 3, reason: "Клеточное строение в курсе биологии.", topics: ["Клетка"] },
      anatomy: { level: 3, reason: "Микроскопическое строение органов.", topics: ["Микроанатомия"] },
    },
  },
  {
    id: "trainers.histology",
    title: "Тренажёр по препаратам",
    subtitle: "Определение структур по изображениям",
    kind: "core",
    primary: "histology",
    categories: ["Морфология", "Тренажёр"],
    functions: ["trainer"],
    base: "/trainers",
    progressKey: "trainers.histology",
    relations: {
      histology: { level: 1, reason: "Профильный тренажёр распознавания препаратов.", topics: ["Микропрепараты"] },
      cytology: { level: 1, reason: "Распознавание клеточных структур.", topics: ["Цитология"] },
      pathological_anatomy: { level: 3, reason: "Дифференциация нормы и патологии.", topics: ["Патологическая морфология"] },
      biology: { level: 3, reason: "Практика по клеточному строению.", topics: ["Клетка"] },
    },
  },
  {
    id: "library.materials",
    title: "Библиотека",
    subtitle: "Материалы MEDBIOHIM, свои файлы и внешние каталоги",
    kind: "reference",
    primary: "biology",
    categories: ["Материалы", "Библиотека"],
    functions: ["library"],
    base: "/library",
    progressKey: "library.materials",
    relations: allAreas(1, "Учебные материалы, пособия и внешние каталоги по дисциплине."),
  },
  {
    id: "labs.virtual",
    title: "Лабораторные работы",
    subtitle: "Виртуальные опыты и расчётные лаборатории",
    kind: "tool",
    primary: "chemistry_organic_physical",
    categories: ["Лаборатория", "Практика"],
    functions: ["lab"],
    base: "/labs",
    progressKey: "labs.virtual",
    relations: {
      chemistry_organic_physical: { level: 2, reason: "Химические опыты и расчёты.", topics: ["Лабораторный практикум"] },
      inorganic_chemistry: { level: 2, reason: "Опыты по равновесиям и электрохимии.", topics: ["Практикум"] },
      physics: { level: 1, reason: "Виртуальные опыты по физике.", topics: ["Измерения"] },
      biophysics: { level: 2, reason: "Биофизические измерения.", topics: ["Биофизика"] },
      physiology: { level: 3, reason: "Функциональные пробы и измерения.", topics: ["Функциональная диагностика"] },
    },
  },
  {
    id: "tests.bank",
    title: "Тесты и банк вопросов",
    subtitle: "Тренировочные тесты по темам предмета",
    kind: "tool",
    primary: "biology",
    categories: ["Контроль", "Тесты"],
    functions: ["tests"],
    base: "/tests",
    progressKey: "tests.bank",
    relations: allAreas(1, "Тренировочные вопросы по дисциплине."),
  },
  {
    id: "tickets.exam",
    title: "Билеты и вопросы к экзамену",
    subtitle: "Генератор билетов и экзаменационные вопросы",
    kind: "tool",
    primary: "physiology",
    categories: ["Контроль", "Экзамен"],
    functions: ["tests"],
    base: "/tickets",
    progressKey: "tickets.exam",
    relations: allAreas(2, "Экзаменационные материалы, если для дисциплины заведён банк билетов."),
  },
  {
    id: "progress.learning",
    title: "Прогресс обучения",
    subtitle: "Темы, тесты, карточки и результаты симуляций",
    kind: "tool",
    primary: "physiology",
    categories: ["Прогресс"],
    functions: ["progress"],
    base: "/progress",
    progressKey: "progress.learning",
    relations: allAreas(1, "Сводный прогресс по дисциплине и инструментам."),
  },
];

export const LEARNING_MODULES: LearningModule[] = [
  ...CHEMISTRY_CORE,
  ...SIM_MODULES,
  ...SHARED_MODULES,
];

const MODULE_BY_ID = new Map(LEARNING_MODULES.map((module) => [module.id, module]));

export function moduleById(id: string): LearningModule | undefined {
  return MODULE_BY_ID.get(id);
}

export type ModuleQuery = {
  kind?: ModuleKind | ModuleKind[];
  functions?: ModuleFunction[];
  excludeFunctions?: ModuleFunction[];
};

const KIND_ORDER: ModuleKind[] = ["core", "cross", "tool", "reference"];

/**
 * Модули, применимые к предметной области. Дедупликация по id обязательна:
 * в базе есть дубли дисциплин, но модуль должен остаться один.
 */
export function modulesForSubject(
  key: SubjectAreaKey | null | undefined,
  query: ModuleQuery = {},
): LearningModule[] {
  if (!key) return [];
  const kinds = query.kind ? (Array.isArray(query.kind) ? query.kind : [query.kind]) : null;
  const seen = new Set<string>();
  return LEARNING_MODULES
    .filter((module) => Boolean(module.relations[key]))
    .filter((module) => (kinds ? kinds.includes(module.kind) : true))
    .filter((module) => (query.functions ? query.functions.some((fn) => module.functions.includes(fn)) : true))
    .filter((module) => (query.excludeFunctions ? !query.excludeFunctions.some((fn) => module.functions.includes(fn)) : true))
    .filter((module) => {
      if (seen.has(module.id)) return false;
      seen.add(module.id);
      return true;
    })
    .sort((a, b) => {
      const kindDelta = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
      return kindDelta !== 0 ? kindDelta : a.title.localeCompare(b.title, "ru");
    });
}

/** Слага симуляций, доступных предметной области (единый источник истины). */
export function simulationSlugsForArea(key: SubjectAreaKey | null | undefined): string[] {
  if (!key) return [];
  return modulesForSubject(key, { functions: ["simulation"] })
    .map((module) => module.simulationSlug)
    .filter((slug): slug is string => Boolean(slug));
}

export type ModuleLinkContext = {
  subjectKey?: SubjectAreaKey | null;
  topic?: string | null;
};

/**
 * Контекстная ссылка на существующий маршрут. Предмет и тема передаются
 * query-параметрами, поэтому копий инструмента под дисциплины не появляется.
 */
export function moduleHref(module: LearningModule, context: ModuleLinkContext = {}): string {
  const params: string[] = [];
  const subjectKey = context.subjectKey ?? null;
  if (subjectKey) params.push(`subject=${encodeURIComponent(subjectKey)}`);
  if (context.topic) params.push(`topic=${encodeURIComponent(context.topic)}`);
  if (!params.length) return module.base;
  return `${module.base}${module.base.includes("?") ? "&" : "?"}${params.join("&")}`;
}

export function relationFor(
  module: LearningModule,
  key: SubjectAreaKey | null | undefined,
): ModuleRelation | null {
  if (!key) return null;
  return module.relations[key] ?? null;
}
