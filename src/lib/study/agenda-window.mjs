/**
 * Окно ленты «Ближайшее» на /study и /schedule.
 *
 * Смысл: список не должен разрастаться, но аттестации (коллоквиум, КР, зачёт,
 * экзамен) нельзя прятать за обычными парами. Раньше брали первые 14 элементов
 * по дате, и на две недели вперёд это были только занятия — коллоквиум с
 * готовностью в процентах и кнопкой плана подготовки в ленту не попадал.
 *
 * Правила:
 *  • аттестации получают места первыми, по дате;
 *  • остаток лимита заполняют ближайшие не-аттестации;
 *  • итог снова сортируется по дате — лента остаётся хронологической.
 */
export const ASSESSMENT_KINDS = new Set(["exam", "credit", "colloquium", "control_work", "assessment"]);

const dateKey = (item) => String(item?.date || "");

function sortByDate(a, b) {
  return dateKey(a).localeCompare(dateKey(b));
}

export function limitAgendaItems(items, limit = 14, assessmentKinds = ASSESSMENT_KINDS) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const isAssessment = (item) => assessmentKinds.has(String(item.kind || ""));
  const assessments = list.filter(isAssessment).sort(sortByDate).slice(0, limit);
  const rest = list
    .filter((item) => !isAssessment(item))
    .sort(sortByDate)
    .slice(0, Math.max(0, limit - assessments.length));
  return [...assessments, ...rest].sort(sortByDate);
}
