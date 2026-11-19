/**
 * Реестр подмодулей предметов.
 *
 * Предмет (строка из `subjects`) может иметь подмодуль с собственными
 * разделами: у химии это структуры, реакции, растворы, лаборатория, практика и
 * таблица элементов. Раньше список разделов жил в трёх местах сразу — в
 * `ChemistryModule`, в навигации карточки предмета и в страницах `/chemistry/*`,
 * поэтому новый предмет приходилось вписывать в каждое.
 *
 * Теперь источник истины — `registry.json`; этот файл даёт типы и доступ.
 * Реестр намеренно без JSX и без сетевых вызовов: его можно импортировать и в
 * серверный, и в клиентский компонент, и он не тянет за собой UI.
 *
 * Инварианты держит `test/subject-submodules.test.mjs`.
 */
import registry from "./registry.json";

export type SubjectSubmoduleTab = {
  /** Ключ раздела; для химии совпадает с `ChemistrySection`. */
  key: string;
  label: string;
  hint?: string;
  /** Куда ведёт раздел, если у него есть отдельная страница. */
  href?: string;
};

export type SubjectSubmodule = {
  slug: string;
  title: string;
  summary: string;
  /** Слаги предметов из БД, которым принадлежит подмодуль. */
  subjectSlugs: readonly string[];
  tabs: readonly SubjectSubmoduleTab[];
};

export const SUBJECT_SUBMODULES: readonly SubjectSubmodule[] = registry.submodules;

export const SUBMODULE_SLUGS: readonly string[] = SUBJECT_SUBMODULES.map((item) => item.slug);

export function getSubmodule(slug: string | null | undefined): SubjectSubmodule | undefined {
  const key = String(slug ?? "").trim().toLowerCase();
  if (!key) return undefined;
  return SUBJECT_SUBMODULES.find((item) => item.slug === key);
}

/** Для мест, где отсутствие подмодуля — ошибка сборки, а не ветка UI. */
export function requireSubmodule(slug: string): SubjectSubmodule {
  const found = getSubmodule(slug);
  if (!found) throw new Error(`Подмодуль «${slug}» не зарегистрирован в src/modules/subjects/registry.json`);
  return found;
}

/** Подмодуль предмета по его слагу из БД. Неизвестный слаг → undefined. */
export function submoduleForSubject(subjectSlug: string | null | undefined): SubjectSubmodule | undefined {
  const key = String(subjectSlug ?? "").trim().toLowerCase();
  if (!key) return undefined;
  return SUBJECT_SUBMODULES.find((item) => item.subjectSlugs.includes(key));
}

export function submoduleTab(
  submodule: SubjectSubmodule,
  key: string,
): SubjectSubmoduleTab | undefined {
  return submodule.tabs.find((tab) => tab.key === key);
}
