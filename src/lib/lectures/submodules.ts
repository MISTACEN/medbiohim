/**
 * Подмодули лекций: внутри предмета занятия распределены по тематическим
 * блокам, как в программе кафедры, а не лежат одним плоским списком.
 *
 * Разбиение задано явно по id лекций — это единственный способ не угадывать:
 * название темы («занятие 07») не говорит, к какому подмодулю относится запись,
 * а порядок в базе произвольный. Всё, что не попало ни в один подмодуль, честно
 * уходит в группу «Прочие занятия», а не приклеивается к соседнему блоку.
 *
 * Границы подмодулей по гистологии взяты из программы кафедры
 * (`public/content/histology/index.json`): «Цитология и эмбриология» (16 ч),
 * «Общая гистология» — ткани, кровь и кроветворение (30 ч),
 * «Частная гистология» — органы и системы (42 ч).
 */

export type LectureLike = {
  id?: string | null;
  title?: string | null;
  topic?: string | null;
  subject?: string | null;
  subject_slug?: string | null;
};

export type LectureSubmodule = {
  id: string;
  title: string;
  subtitle?: string;
  /** Порядок внутри подмодуля = порядок занятий в программе. */
  lectureIds: string[];
};

const HISTOLOGY: LectureSubmodule[] = [
  {
    id: "citologiya-embriologiya",
    title: "Цитология и эмбриология",
    subtitle: "Клетка и органоиды, ядро и жизненный цикл, половые клетки и эмбриогенез",
    lectureIds: [
      "hist-00-gistotekhnika",
      "hist-01-citologiya-organelly",
      "hist-02-citologiya-yadro-cikl",
      "hist-03-embriologiya",
    ],
  },
  {
    id: "obschaya-gistologiya",
    title: "Общая гистология: ткани",
    subtitle: "Эпителии, кровь и кроветворение, соединительные, скелетные, мышечные и нервная ткани",
    lectureIds: [
      "hist-04-epitelialnye-tkani",
      "hist-05-krov",
      "hist-06-sobstvenno-st",
      "hist-07-hryaschevye-kostnye",
      "hist-08-myishechnye-tkani",
      "hist-09-nervnaya-tkan",
      "hist-16-krovetvorenie",
    ],
  },
  {
    id: "chastnaya-gistologiya",
    title: "Частная гистология: органы и системы",
    subtitle: "Нервная система, органы чувств, сосуды, эндокринные и пищеварительные органы, лимфоидная система",
    lectureIds: [
      "hist-10-nervnaya-sistema",
      "hist-11-kora-mozzhechok-vns",
      "hist-12-zrenie-obonyanie",
      "hist-13-sluh-vkus",
      "hist-14-serdechno-sosudistaya",
      "hist-15-endokrinnaya",
      "hist-17-limfoidnye-organy",
      "hist-18-pishchevaritelnyy-kanal",
    ],
  },
];

const CHEMISTRY: LectureSubmodule[] = [
  {
    id: "uglevodorody",
    title: "Углеводороды и галогенопроизводные",
    subtitle: "Арены, галогенопроизводные: строение, замещение, реакционная способность",
    lectureIds: ["lec-chem-areny", "lec-chem-galogenoproizvodnye"],
  },
  {
    id: "spirty-fenoly",
    title: "Спирты, фенолы и простые эфиры",
    subtitle: "Кислотно-основные свойства, реакции O–H и C–O, качественные реакции",
    lectureIds: ["lec-chem-spirty", "lec-chem-fenoly-efiry"],
  },
  {
    id: "karbonil-kisloty",
    title: "Карбонильные соединения и карбоновые кислоты",
    subtitle: "Альдегиды и кетоны, кислоты и их функциональные производные",
    lectureIds: ["lec-chem-oksosoedineniya", "lec-chem-karbonovye-kisloty"],
  },
];

const PHYSIOLOGY: LectureSubmodule[] = [
  {
    id: "vozbudimye-sistemy",
    title: "Возбудимые системы",
    subtitle: "Биоэлектрические явления, законы раздражения и проведения, мышцы и синапсы",
    lectureIds: [
      "lec-44db6ebee0344e24",
      "lec-7f9d0be106de460f",
      "lec-8c7c3b4980a04971",
      "lec-7689425cf2c14023",
      "lec-f032784e3caf4e67",
    ],
  },
  {
    id: "krov-endokrinnaya",
    title: "Кровь и эндокринная система",
    subtitle: "Состав и свойства крови, форменные элементы, гемостаз, гормональная регуляция",
    lectureIds: [
      "lec-600c4ab31d684ddf",
      "lec-6fb509db7efb4fbd",
      "lec-6940f5d6a7884a58",
      "lec-c549c1fe308d4bbb",
    ],
  },
  {
    id: "cns",
    title: "Центральная нервная система",
    subtitle: "Рефлекс и торможение, частная физиология ЦНС, вегетативная нервная система",
    lectureIds: ["lec-75da7a3c6a354eed", "lec-fc517dbd545b422c", "lec-7a1a41c1be12466b"],
  },
  {
    id: "dyhanie-vydelenie",
    title: "Дыхание и выделение",
    subtitle: "Внешнее дыхание и транспорт газов, ритмогенез, почка",
    lectureIds: ["lec-physio-resp-01", "lec-physio-resp-02", "lec-physio-resp-03"],
  },
  {
    id: "pishchevarenie",
    title: "Пищеварение, обмен веществ и терморегуляция",
    subtitle: "Пищеварительный конвейер, всасывание, обмен и энергия, температура тела",
    lectureIds: [
      "lec-physio-digest-01",
      "lec-physio-digest-02",
      "lec-physio-digest-03",
      "lec-physio-digest-04",
      "lec-physio-digest-05",
    ],
  },
  {
    id: "sensory-vnd",
    title: "Сенсорные системы и высшая нервная деятельность",
    subtitle: "Соматосенсорная, вкусовая, обонятельная, зрительная и слуховая системы; поведение",
    lectureIds: [
      "lec-physio-sense-01",
      "lec-physio-sense-02",
      "lec-physio-sense-03",
      "lec-physio-sense-04",
    ],
  },
];

/** Названия предметов: в списке API приходит только slug. */
export const SUBJECT_TITLES: Record<string, string> = {
  histology: "Гистология, цитология",
  histology_cytology: "Гистология, цитология",
  chemistry: "Химия",
  organic_chemistry: "Органическая химия",
  chemistry_organic_physical: "Органическая и физическая химия",
  inorganic_chemistry: "Неорганическая химия",
  physiology: "Физиология",
  normal_physiology: "Физиология",
};

/** Что показать вместо slug: известное название или аккуратно развёрнутый slug. */
export function subjectTitle(key: string | null | undefined, fallback?: string | null): string {
  if (key && SUBJECT_TITLES[key]) return SUBJECT_TITLES[key];
  const raw = String(fallback ?? key ?? "").trim();
  if (!raw) return "Без модуля";
  if (SUBJECT_TITLES[raw]) return SUBJECT_TITLES[raw];
  return raw.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
}

/**
 * Группа для лекций, не заявленных ни в одном подмодуле. По гистологии это
 * старые недельные дайджесты и экзаменационные материалы — они не часть
 * тканевых блоков, поэтому получают собственный раздел, а не «Прочие».
 */
const SUBJECT_FALLBACK: Record<string, { title: string; subtitle?: string }> = {
  histology: {
    title: "Дайджесты недель и подготовка к экзамену",
    subtitle: "Обзорные лекции по неделям, федеральные тестовые задания, задачи кафедры и списки гистопрепаратов",
  },
};

export function fallbackGroup(subjectKey: string | null | undefined): { title: string; subtitle?: string } {
  return (subjectKey && SUBJECT_FALLBACK[subjectKey]) || { title: "Прочие занятия" };
}

/** Ключи — slug предмета из базы (исторически встречаются разные написания). */
export const LECTURE_SUBMODULES: Record<string, LectureSubmodule[]> = {
  histology: HISTOLOGY,
  histology_cytology: HISTOLOGY,
  chemistry: CHEMISTRY,
  organic_chemistry: CHEMISTRY,
  chemistry_organic_physical: CHEMISTRY,
  inorganic_chemistry: CHEMISTRY,
  physiology: PHYSIOLOGY,
  normal_physiology: PHYSIOLOGY,
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Предмет лекции → ключ реестра. Slug ведущий, название — запасной вариант:
 * у части записей slug пустой или написан по-разному.
 */
export function resolveLectureSubjectKey(lecture: {
  subject?: string | null;
  subject_slug?: string | null;
}): string | null {
  const slug = String(lecture.subject_slug ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (slug && LECTURE_SUBMODULES[slug]) return slug;
  if (slug && LECTURE_SUBMODULES[slug.replace(/_/g, "")]) return slug.replace(/_/g, "");

  const name = normalize(lecture.subject);
  if (!name) return null;
  if (name.startsWith("гистолог")) return "histology";
  if (name.includes("органическ") || name.includes("хими")) return "chemistry";
  if (name.startsWith("физиолог")) return "physiology";
  return slug || null;
}

export function submodulesForSubject(key: string | null | undefined): LectureSubmodule[] {
  if (!key) return [];
  const direct = LECTURE_SUBMODULES[key];
  if (direct) return direct;
  const folded = key.toLowerCase().replace(/_/g, "");
  const found = Object.entries(LECTURE_SUBMODULES).find(
    ([slug]) => slug.replace(/_/g, "") === folded,
  );
  return found ? found[1] : [];
}

export type LectureGroup<T> = {
  /** null — лекция не заявлена ни в одном подмодуле (свой раздел предмета). */
  submodule: LectureSubmodule | null;
  title: string;
  subtitle?: string;
  lectures: T[];
};

/**
 * Раскладывает лекции предмета по подмодулям, сохраняя порядок программы.
 * Для неизвестного предмета возвращает одну группу — список не теряется.
 */
export function groupBySubmodule<T extends LectureLike>(
  subjectKey: string | null | undefined,
  lectures: T[],
): LectureGroup<T>[] {
  if (!lectures.length) return [];
  const mods = submodulesForSubject(subjectKey);
  if (!mods.length) return [{ submodule: null, title: "Занятия", lectures }];

  const byId = new Map(lectures.map((lecture) => [String(lecture.id ?? ""), lecture]));
  const used = new Set<string>();
  const groups: LectureGroup<T>[] = [];

  for (const mod of mods) {
    const list: T[] = [];
    for (const id of mod.lectureIds) {
      const lecture = byId.get(id);
      if (lecture) {
        list.push(lecture);
        used.add(id);
      }
    }
    if (list.length) groups.push({ submodule: mod, title: mod.title, lectures: list });
  }

  const rest = lectures.filter((lecture) => !used.has(String(lecture.id ?? "")));
  if (rest.length) {
    const fallback = fallbackGroup(subjectKey);
    groups.push({ submodule: null, title: fallback.title, subtitle: fallback.subtitle, lectures: rest });
  }
  return groups;
}

/** Подмодуль конкретной лекции — для подписи в шапке и навигации. */
export function submoduleOf(
  subjectKey: string | null | undefined,
  lectureId: string | null | undefined,
): LectureSubmodule | null {
  const id = String(lectureId ?? "");
  if (!id) return null;
  for (const mod of submodulesForSubject(subjectKey)) {
    if (mod.lectureIds.includes(id)) return mod;
  }
  return null;
}
