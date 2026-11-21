/**
 * Чистая логика диагностикума: построение задания, проверка ответа и подсказки.
 *
 * Здесь нет ни Hono, ни Supabase — только детерминированные правила, которые
 * можно проверить без сети. Случайность передаётся параметром `random`, поэтому
 * тесты получают один и тот же вопрос.
 *
 * Главное правило: клиент никогда не получает ключ ответа. `buildQuestion`
 * возвращает пару «вопрос для экрана» + «ключ для сервера», и они расходятся по
 * разным местам: вопрос — в ответ API, ключ — в строку попытки.
 */

import {
  MIN_MATCH_LENGTH,
  preparationContains,
  preparationKey,
} from "../../../../../src/shared/histology/preparation-match";

/**
 * `schema` — «схема препарата»: две оси в одном задании. Сначала студент
 * отмечает, какие утверждения действительно относятся к препарату (ось
 * «соответствие источникам»), затем по этим признакам выбирает сам препарат
 * (ось «понимание»). Это не второй движок заданий, а ещё один режим того же.
 */
export type DiagnosticumMode = "identify" | "structures" | "differential" | "complex" | "schema";

export const DIAGNOSTICUM_MODES: DiagnosticumMode[] = [
  "identify",
  "structures",
  "differential",
  "complex",
  "schema",
];

/** Сколько подсказок доступно и сколько стоит каждая (в баллах из 100). */
export const MAX_HINTS = 4;
export const HINT_PENALTY = 10;

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

/** Строка без пробелов по краям; экспортируется для `grading.ts`. */
export const text = (value: unknown): string => String(value ?? "").trim();

/**
 * Нормализация названия — то же правило, что в браузере (`histologyAtlas`):
 * регистр, «ё», пунктуация и пробелы не важны. Модуль общий, чтобы атлас и
 * диагностикум не разошлись в том, какой препарат считается одним и тем же.
 */
export const normalizeName = preparationKey;

export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item)).filter(Boolean);
}

export function guideStructures(guide: GuideRow): string[] {
  return stringList(guide.structures);
}

/** Карточка с изображением: без картинки диагностировать нечего. */
export function hasImage(card: CardRow): boolean {
  const preparation = card?.preparation ?? null;
  return Boolean(text(preparation?.imagePath) || text(preparation?.imageUrl));
}

/**
 * Подбор карточки банка для препарата: точное совпадение названия, затем
 * вхождение названия гида в название карточки («Митоз (корешок лука)»).
 */
export function pickImageCard(guide: GuideRow, cards: CardRow[]): CardRow | null {
  const withImage = cards.filter(hasImage);
  const names = new Set([normalizeName(guide.name), normalizeName(guide.key)].filter(Boolean));

  const exact = withImage.find((card) => names.has(preparationKey(card?.preparation?.name)));
  if (exact) return exact;

  // Вхождение в любую сторону и только от MIN_MATCH_LENGTH: карточка без
  // названия больше не совпадает с первым гидом подряд.
  const guideName = preparationKey(guide.name);
  if (guideName.length < MIN_MATCH_LENGTH) return null;
  return withImage.find((card) => preparationContains(guideName, card?.preparation?.name)) ?? null;
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function sample<T>(items: T[], count: number, random: () => number): T[] {
  return shuffle(items, random).slice(0, Math.max(0, count));
}

function exploration(guide: GuideRow): string {
  const features = stringList(guide.features);
  const differential = stringList(guide.differential);
  return [features.join("; "), differential.join("; ")].filter(Boolean).join(". ") || guide.name;
}

/**
 * Собирает задание и ключ ответа. `null` — для препарата нет карточки с
 * изображением, значит задание построить нельзя (вызывающий код берёт другой
 * препарат, а не показывает пустую картинку).
 */
export function buildQuestion(input: {
  guide: GuideRow;
  guides: GuideRow[];
  cards: CardRow[];
  mode: DiagnosticumMode;
  structureTitles?: Record<string, string>;
  random?: () => number;
}): { question: Question; answers: AnswerKey } | null {
  const random = input.random ?? Math.random;
  const { guide, mode } = input;
  const card = pickImageCard(guide, input.cards);
  if (!card?.id) return null;

  const title = (slug: string) => input.structureTitles?.[slug] || slug.replace(/-/g, " ");
  const others = input.guides.filter((item) => item.key !== guide.key);
  const sameSection = others.filter(
    (item) => normalizeName(item.section) === normalizeName(guide.section),
  );
  const distractorPool = sameSection.length >= 3 ? sameSection : others;

  const namePart = (count: number): QuestionPart => {
    const distractors = sample(distractorPool, count, random).map((item) => ({
      id: item.key,
      label: item.name,
    }));
    return {
      id: "preparation",
      kind: "single",
      title: "Что это за препарат?",
      options: shuffle([{ id: guide.key, label: guide.name }, ...distractors], random),
    };
  };

  const structures = guideStructures(guide);
  const structuresPart = (): QuestionPart | null => {
    if (!structures.length) return null;
    const foreign = new Set<string>();
    for (const item of others) for (const slug of guideStructures(item)) if (!structures.includes(slug)) foreign.add(slug);
    const distractors = sample(Array.from(foreign), 3, random).map((slug) => ({
      id: slug,
      label: title(slug),
    }));
    return {
      id: "structures",
      kind: "multi",
      title: "Отметь диагностические структуры этого препарата",
      options: shuffle(
        [
          ...structures.map((slug) => ({ id: slug, label: title(slug) })),
          ...distractors,
        ],
        random,
      ),
    };
  };

  const base = {
    image_card_id: String(card.id),
  };

  if (mode === "identify") {
    return {
      question: {
        ...base,
        prompt: "Определи препарат по изображению.",
        parts: [namePart(3)],
      },
      answers: {
        parts: {
          preparation: { correct: [guide.key], explanation: exploration(guide) },
        },
      },
    };
  }

  if (mode === "structures") {
    const part = structuresPart();
    if (!part) return null;
    return {
      question: {
        ...base,
        prompt: "Рассмотри препарат и отметь структуры, которые действительно видны.",
        parts: [part],
      },
      answers: {
        parts: {
          structures: {
            correct: [...structures],
            explanation: stringList(guide.features).join("; ") || exploration(guide),
          },
        },
      },
    };
  }

  if (mode === "schema") {
    // Ось 1 — сверка утверждений с источником (features гида против чужих).
    const facts = stringList(guide.features).slice(0, 3);
    if (facts.length < 2) return null;
    const strangers = new Set<string>();
    for (const item of others) {
      for (const fact of stringList(item.features)) if (!facts.includes(fact)) strangers.add(fact);
    }
    const fakes = sample(Array.from(strangers), 2, random).map((fact, index) => ({
      id: `x${index}`,
      label: fact,
    }));
    return {
      question: {
        ...base,
        prompt: "Схема препарата: сверь утверждения с источником, затем определи препарат.",
        parts: [
          {
            id: "statements",
            kind: "multi",
            title: "Отметь утверждения, которые относятся к этому препарату",
            options: shuffle(
              [...facts.map((fact, index) => ({ id: `f${index}`, label: fact })), ...fakes],
              random,
            ),
          },
          // Ось 2 — вывод препарата по выбранным признакам.
          namePart(3),
        ],
      },
      answers: {
        parts: {
          statements: {
            correct: facts.map((_, index) => `f${index}`),
            explanation:
              stringList(guide.mistakes).slice(0, 2).join("; ") || exploration(guide),
          },
          preparation: { correct: [guide.key], explanation: exploration(guide) },
        },
      },
    };
  }

  if (mode === "differential") {
    const shared = others.find((item) =>
      guideStructures(item).some((slug) => structures.includes(slug)),
    );
    const lookAlike = shared ?? sample(sameSection.length ? sameSection : others, 1, random)[0] ?? null;
    if (!lookAlike) return null;
    return {
      question: {
        ...base,
        prompt: `Похожие препараты легко перепутать. Что изображено: «${guide.name}» или «${lookAlike.name}»?`,
        parts: [
          {
            id: "preparation",
            kind: "single",
            title: "Выбери правильный вариант",
            options: shuffle(
              [
                { id: guide.key, label: guide.name },
                { id: lookAlike.key, label: lookAlike.name },
              ],
              random,
            ),
          },
        ],
      },
      answers: {
        parts: {
          preparation: {
            correct: [guide.key],
            explanation:
              (stringList(guide.differential).join("; ") || `Отличие от «${lookAlike.name}» — в строении и составе структур.`) +
              (structures.length ? ` Ключевые структуры: ${structures.map(title).join(", ")}.` : ""),
          },
        },
      },
    };
  }

  // complex: определить препарат и отметить структуры — двумя частями.
  const part = structuresPart();
  if (!part) return null;
  return {
    question: {
      ...base,
      prompt: "Комплексная диагностика: определи препарат и отметь его диагностические структуры.",
      parts: [namePart(3), part],
    },
    answers: {
      parts: {
        preparation: { correct: [guide.key], explanation: exploration(guide) },
        structures: {
          correct: [...structures],
          explanation: stringList(guide.features).join("; ") || exploration(guide),
        },
      },
    },
  };
}

