/**
 * Резолвер когорты (Блок 5 бэклога): файл «МБХ 201» → стабильная группа.
 *
 * «МБХ 201» в 2026-27 — это когорта поступления 2025 (2 курс). Через год та же
 * когорта станет «МБХ 301» и ей нужно уже другое расписание, поэтому привязка
 * делается к стабильному id группы: вычисленный курс когорты (учебный год −
 * год поступления + 1) сравнивается с курсом из названия файла.
 *
 * Сентябрь — граница учебного года (academicYearStart), семестр и «ручной
 * режим» остаются у старосты как точечные перекрытия.
 */
import { academicYearStart, autoCourse, groupBase, streamSuffix } from "./groupIdentity.ts";

export type CohortLabel = { base: string; course: number | null; stream: string | null };

export type CohortGroupRow = {
  id: string;
  code?: unknown;
  name?: unknown;
  admission_year?: unknown;
  stream?: unknown;
  is_active?: unknown;
};

export type CohortResolution<R extends CohortGroupRow = CohortGroupRow> = {
  computed: CohortLabel & { academic_year: number };
  /** Единственная найденная группа (null, если 0 или >1). */
  match: R | null;
  /** Все подходящие группы: >1 — пусть человек выберет. */
  candidates: R[];
  /** Причина пустого результата — для честного сообщения в UI. */
  reason: "ok" | "no_course_in_label" | "no_match";
};

/**
 * «МБХ 201» / «МБХ-201» / «МБХ 2/01» → база «МБХ» + курс 2 + поток «01».
 * Хвостовые цифры — курс и поток; «МБХ 2» — только курс, поток не указан.
 */
export function parseCohortLabel(raw: unknown): CohortLabel | null {
  const label = String(raw ?? "")
    .trim()
    // Типовые имена файлов: хвостовое расширение и скобочная приписка
    // («(сессия)», «(осн)») не часть названия группы.
    .replace(/\.(xlsx|xls|pdf|csv|docx?)$/i, "")
    .replace(/\([^()]*\)\s*$/, "")
    .trim();
  if (!label) return null;
  // Разделители перед хвостовыми цифрами не попадают в базу названия.
  const cut = (head: string): string => groupBase(head.replace(/[\s\-_./]+$/, ""), head.replace(/[\s\-_./]+$/, ""));
  // Курс+поток: «201» = курс 2, поток 01. Между ними может стоять разделитель.
  const withStream = label.match(/(\d{1})\s*[-/._]?\s*(\d{2})\s*$/);
  if (withStream) {
    const base = cut(label.slice(0, withStream.index));
    return { base: base || label, course: Number(withStream[1]), stream: withStream[2].padStart(2, "0") };
  }
  // Только курс: «МБХ 2» (но не «МБХ 20» — это уже курс 2 + поток 0? нет:
  // двузначный хвост без ясного разделителя трактуем как «2 поток 01» выше;
  // сюда попадают 1-значные хвосты).
  const courseOnly = label.match(/(\d{1})\s*$/);
  if (courseOnly) {
    const base = cut(label.slice(0, courseOnly.index));
    return { base: base || label, course: Number(courseOnly[1]), stream: null };
  }
  const base = groupBase(label, label);
  if (!base || base === label) return { base, course: null, stream: null };
  return { base, course: null, stream: null };
}

/**
 * Резолв: найти группу когорты по названию файла/листа в текущем учебном году.
 * Никогда не бросает; пустой результат — это reason, а не исключение.
 */
export function resolveGroupByCohort<R extends CohortGroupRow>(
  rawLabel: unknown,
  groups: R[],
  date = new Date()
): CohortResolution<R> {
  const academicYear = academicYearStart(date);
  const computed = parseCohortLabel(rawLabel) ?? { base: "", course: null, stream: null };
  const base = computed.base.trim().toLowerCase();
  const empty = (reason: CohortResolution["reason"]): CohortResolution<R> => ({
    computed: { ...computed, academic_year: academicYear },
    match: null,
    candidates: [],
    reason,
  });
  if (!base || computed.course == null) return empty(computed.course == null ? "no_course_in_label" : "no_match");

  const candidates = groups.filter((group) => {
    if (group.is_active === false) return false;
    const groupBaseName = groupBase(group.code, group.name).trim().toLowerCase();
    if (groupBaseName !== base) return false;
    if (autoCourse(group.admission_year, date) !== computed.course) return false;
    // Поток: в файле не указан → любой поток подходит; указан — совпадение
    // обязательно (группа без потока считается потоком «01»).
    if (computed.stream) {
      const groupStream = streamSuffix(group.stream);
      return groupStream === computed.stream;
    }
    return true;
  });

  return {
    computed: { ...computed, academic_year: academicYear },
    match: candidates.length === 1 ? candidates[0] : null,
    candidates,
    reason: candidates.length ? "ok" : "no_match",
  };
}
