/**
 * Типы диагностикума: сырые строки гида и карточки, вопрос для экрана, ключ,
 * проверка и разбор по частям. Вынесены из model.ts, чтобы файл правил
 * укладывался в лимит маршрутного файла и типы переиспользовались соседями.
 */

export type GuideRow = {
  key: string;
  name: string;
  section?: string | null;
  system?: string | null;
  organ?: string | null;
  tissue?: string | null;
  stain?: string | null;
  difficulty?: number | null;
  low_magnification?: string | null;
  high_magnification?: string | null;
  steps?: unknown;
  features?: unknown;
  inclusions?: unknown;
  differential?: unknown;
  mistakes?: unknown;
  structures?: string[] | null;
};

export type CardRow = {
  id?: string | null;
  preparation?: {
    name?: string | null;
    imagePath?: string | null;
    imageUrl?: string | null;
    /** Путь на статике сайта: так хранятся снимки бонус-наборов. */
    imageStatic?: string | null;
  } | null;
  mode_set?: string | null;
};

export type QuestionOption = { id: string; label: string };
export type QuestionPart = {
  id: "preparation" | "structures" | "statements";
  kind: "single" | "multi";
  title: string;
  options: QuestionOption[];
};
export type Question = {
  prompt: string;
  image_card_id: string;
  parts: QuestionPart[];
};
export type AnswerKey = {
  parts: Record<string, { correct: string[]; explanation: string }>;
};
export type Submitted = Record<string, string[] | undefined>;

export type PartFeedback = {
  part_id: string;
  correct: boolean;
  /** Правильные варианты, которые студент не выбрал. */
  missing: string[];
  /** Лишние варианты, которых в ответе быть не должно. */
  extra: string[];
  explanation: string;
};
export type GradeResult = {
  correct: boolean;
  score: number;
  parts: PartFeedback[];
};
