export type QuestionOption = {
  key: string;
  label: string;
  id?: string;
  correct?: boolean;
};

export type NormalizedQuestion = {
  type: string;
  text: string;
  answer: string;
  is_closed: boolean;
  options: QuestionOption[];
  correct_keys: string[];
  correct_indexes: number[];
  order_indexes: number[];
  requires_order: boolean;
  allow_multiple: boolean;
  resolution: string;
  resolved: boolean;
  answer_display: string;
};

export type QuestionInput = {
  type?: string | null;
  text?: string | null;
  body?: string | null;
  answer?: unknown;
  options?: unknown;
};

export function plainText(value: unknown): string;
export function normalizedAnswer(value: unknown): string;
export function parseOptions(raw: unknown): Array<{ label: string; rawLabel: string; correct: boolean; id?: string }>;
export function resolveCorrectIndexes(
  options: QuestionOption[],
  answer: unknown,
): { indexes: number[]; order: number[] | null; method: string };
export function buildAnswerDisplay(
  options: QuestionOption[],
  resolution: { indexes: number[]; order: number[] | null },
  answer: unknown,
): string;
export function extractOptionsFromText(text: string): { stem: string; options: string[]; keys: string[] } | null;
export function normalizeQuestion(
  input: QuestionInput,
  settings?: { extractTextOptions?: boolean },
): NormalizedQuestion;
export function publicOptions(question: Pick<NormalizedQuestion, "options">, reveal?: boolean): QuestionOption[];
export function gradeClosedAnswer(
  question: NormalizedQuestion,
  given: unknown,
): { is_correct: boolean | null; selected_keys: string[]; correct_keys: string[] };
export function gradeOpenAnswer(expected: unknown, given: unknown): boolean | null;
export const questionFormatTypes: { open: string[]; closed: string[] };
