import { resolveSubjectSlug } from "@/lib/subjectSlug";

export type SubjectOption = {
  id: string;
  slug: string;
  label: string;
};

export const PAGE_SIZE = 30;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAIN_SUBJECT_ORDER = ["histology", "physiology", "organic_chemistry"];

export const KINDS = [
  { value: "", label: "Все типы" },
  { value: "mcq", label: "Тесты" },
  { value: "open", label: "Открытые" },
  { value: "theory", label: "Теория" },
];

export function plural(n: number, one: string, few: string, many: string) {
  const value = Math.abs(n) % 100;
  const last = value % 10;
  if (value > 10 && value < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

export function subjectRank(slug: string) {
  const canonical = resolveSubjectSlug(slug);
  const index = MAIN_SUBJECT_ORDER.indexOf(canonical);
  return index === -1 ? 99 : index;
}

export function optionText(option: any) {
  return typeof option === "string" ? option : String(option?.label ?? "");
}

export function optionKey(option: any, index: number) {
  if (typeof option === "string") return String.fromCharCode(65 + index);
  return option?.key != null && String(option.key).trim() ? String(option.key) : String.fromCharCode(65 + index);
}

export function answerPreview(value: any) {
  const answer = String(value ?? "").trim();
  if (!answer || /^\d{1,2}$/.test(answer)) return "";
  return answer;
}

export function optionIsCorrect(option: any) {
  return typeof option !== "string" && option?.correct === true;
}

export function isChoiceQuestion(question: any) {
  const type = String(question?.type || "").trim().toLowerCase();
  const options = Array.isArray(question?.options) ? question.options : [];
  if (["open", "text", "short_answer", "short-answer", "theory"].includes(type)) return false;
  if (["mc", "mcq", "single", "single_choice", "single-choice", "multiple_choice", "multiple-choice"].includes(type)) {
    return options.length > 0;
  }
  // Unknown types: a single option is usually a placeholder such as
  // "(открытый/соответствие)", not a real answer choice.
  return options.length > 1;
}

export function officialAnswerText(question: any) {
  const answer = String(question?.answer || "").trim();
  if (!answer) return "Эталон пока пуст";
  if (!isChoiceQuestion(question) && /^\d{1,2}$/.test(answer)) return `См. ключ (${answer})`;
  return answer;
}

export function correctOptionIndexes(question: any) {
  const options = Array.isArray(question?.options) ? question.options : [];
  if (!options.length) return [];
  const explicit = options.flatMap((option: any, index: number) => (optionIsCorrect(option) ? [index] : []));
  if (explicit.length) return explicit;
  if (typeof question?.correct === "number" && question.correct >= 0 && question.correct < options.length) {
    return [question.correct];
  }
  return [];
}

export function referenceText(question: any) {
  const display = String(question?.answer_display || "").trim();
  if (display) return display;
  const indexes = correctOptionIndexes(question);
  if (indexes.length) {
    return indexes
      .map((index: number) => `${optionKey(question.options[index], index)}) ${optionText(question.options[index])}`)
      .join("; ");
  }
  return officialAnswerText(question);
}
