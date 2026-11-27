/**
 * Чистая логика диагностикума: выбор карточки банка, электронограммы и рамки
 * задания.
 *
 * Здесь нет ни Hono, ни Supabase — только детерминированные правила, которые
 * можно проверить без сети. Случайность передаётся параметром `random`, поэтому
 * тесты получают один и тот же вопрос.
 *
 * Главное правило: клиент никогда не получает ключ ответа. `buildQuestion`
 * возвращает пару «вопрос для экрана» + «ключ для сервера», и они расходятся по
 * разным местам: вопрос — в ответ API, ключ — в строку попытки.
 *
 * Сборка вопроса по режимам — в `model-questions.ts`, примитивы (нормализация,
 * списки, перемешивание) — в `model-base.ts`: так файл остаётся в бюджете
 * маршрутного файла.
 */

import {
  MIN_MATCH_LENGTH,
  preparationContains,
  preparationKey,
  preparationNames,
} from "../../../../../src/shared/histology/preparation-match";

/**
 * `schema` — «схема препарата»: две оси в одном задании. Сначала студент
 * отмечает, какие утверждения действительно относятся к препарату (ось
 * «соответствие источникам»), затем по этим признакам выбирает сам препарат
 * (ось «понимание»). Это не второй движок заданий, а ещё один режим того же.
 */
export type DiagnosticumMode =
  | "identify"
  | "structures"
  | "differential"
  | "complex"
  | "schema"
  | "exam"
  | "electronogram";

/**
 * `complex` — единый разбор препарата: в одном задании препарат, его структуры
 * и утверждения о нём. Остальные режимы остались ради совместимости API и
 * старых попыток; интерфейс тренажёра запускает только `complex`.
 */
export const DIAGNOSTICUM_MODES: DiagnosticumMode[] = [
  "complex",
  "identify",
  "structures",
  "differential",
  "schema",
  "exam",
  "electronogram",
];

/** Сколько подсказок доступно и сколько стоит каждая (в баллах из 100). */
export const MAX_HINTS = 4;
export const HINT_PENALTY = 10;

import type {
  AnswerKey,
  CardRow,
  GuideRow,
  Question,
} from "./types";

export type {
  AnswerKey,
  CardRow,
  GradeResult,
  GuideRow,
  PartFeedback,
  Question,
  QuestionOption,
  QuestionPart,
  Submitted,
} from "./types";

import { normalizeName, sample, shuffle, text } from "./model-base";

// Публичные имена остаются в `model.ts`, чтобы импорты соседей не менялись.
export {
  guideStructures,
  normalizeName,
  shuffle,
  stringList,
  text,
} from "./model-base";

import { buildModeQuestion } from "./model-questions";

/** Карточка с изображением: без картинки диагностировать нечего. */
export function hasImage(card: CardRow): boolean {
  const preparation = card?.preparation ?? null;
  // `imageStatic` — путь на статике сайта (бонус-снимки): без него карточка
  // считалась «без изображения», хотя файл существует.
  return Boolean(
    text(preparation?.imagePath) || text(preparation?.imageUrl) || text(preparation?.imageStatic),
  );
}

/**
 * Подбор карточки банка для препарата: точное совпадение названия, затем
 * вхождение названия гида в название карточки («Митоз (корешок лука)»).
 */
export function pickImageCard(
  guide: GuideRow,
  cards: CardRow[],
  /** Банк: препараты и электронограммы не смешиваются в одном задании. */
  bank: "preparation" | "electronogram" = "preparation",
): CardRow | null {
  const inBank = cards.filter((card) =>
    bank === "electronogram"
      ? card.mode_set === "electronogram"
      : card.mode_set !== "electronogram",
  );
  const withImage = inBank.filter(hasImage);
  // `preparationNames` включает алиасы: препарат в банке может называться иначе
  // («Кровь мазок» для методички «Мазок крови»), см. PREPARATION_ALIASES.
  const names = preparationNames(guide);

  const exact = withImage.find((card) => names.includes(preparationKey(card?.preparation?.name)));
  if (exact) return exact;

  // Вхождение в любую сторону и только от MIN_MATCH_LENGTH: карточка без
  // названия больше не совпадает с первым гидом подряд.
  const usable = names.filter((name) => name.length >= MIN_MATCH_LENGTH);
  if (!usable.length) return null;
  return (
    withImage.find((card) =>
      usable.some((name) => preparationContains(name, card?.preparation?.name)),
    ) ?? null
  );
}

/**
 * Электронограммы — отдельный банк без методичек: вопрос строится прямо по
 * карточкам `mode_set = electronogram`, варианты берутся из названий других
 * электронограмм. Ключ ответа — id карточки, подпись — название структуры.
 */
export function buildElectronogramQuestion(
  cards: CardRow[],
  random: () => number = Math.random,
): { question: Question; answers: AnswerKey; section: string; guideKey: string } | null {
  const byName = new Map<string, CardRow>();
  for (const card of cards) {
    if (card.mode_set !== "electronogram" || !card.id || !hasImage(card)) continue;
    const name = text(card.preparation?.name);
    if (!name) continue;
    // Одно название — один вариант: дубли-карточки не должны давать два
    // одинаковых ответа в одной строке.
    const key = normalizeName(name);
    if (!byName.has(key)) byName.set(key, card);
  }
  const unique = [...byName.values()];
  if (unique.length < 4) return null;

  const target = sample(unique, 1, random)[0];
  const distractors = sample(
    unique.filter((card) => card !== target),
    3,
    random,
  );

  return {
    question: {
      prompt: "Что это за структура на электронограмме?",
      image_card_id: String(target.id),
      parts: [
        {
          id: "preparation",
          kind: "single",
          title: "Название структуры",
          options: shuffle(
            [target, ...distractors].map((card) => ({
              id: String(card.id),
              label: text(card.preparation?.name),
            })),
            random,
          ),
        },
      ],
    },
    answers: {
      parts: {
        preparation: {
          correct: [String(target.id)],
          explanation: text(target.preparation?.name),
        },
      },
    },
    section: "Электронограммы",
    // Префикс отделяет попытки ЭМ от методичек препаратов в одной таблице.
    guideKey: `em:${String(target.id)}`,
  };
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
  bank?: "preparation" | "electronogram";
  structureTitles?: Record<string, string>;
  random?: () => number;
  /**
   * Конкретная карточка: нужна «своей серии», где студент выбрал препараты сам.
   * Без неё карточка подбирается по названию гида.
   */
  card?: CardRow;
}): { question: Question; answers: AnswerKey } | null {
  const random = input.random ?? Math.random;
  const { guide, mode } = input;
  const card = input.card ?? pickImageCard(guide, input.cards, input.bank ?? "preparation");
  if (!card?.id) return null;

  const title = (slug: string) => input.structureTitles?.[slug] || slug.replace(/-/g, " ");
  const others = input.guides.filter((item) => item.key !== guide.key);
  const sameSection = others.filter(
    (item) => normalizeName(item.section) === normalizeName(guide.section),
  );
  const distractorPool = sameSection.length >= 3 ? sameSection : others;

  return buildModeQuestion({
    guide,
    mode,
    others,
    sameSection,
    distractorPool,
    title,
    random,
    base: { image_card_id: String(card.id) },
  });
}