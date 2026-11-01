/** Проверка письменных (открытых) ответов по пунктам эталона.
 *
 *  Задание 5 требует: «Проверка ответа с объяснением ошибок». Эталонный ответ
 *  не передаётся в банк вопросов, поэтому проверка идёт локально в браузере по
 *  списку keyPoints: каждый пункт — набор принимаемых формулировок. Матчинг
 *  терпим к словоформам (сравнение по основе слова), регистру, «ё», пунктуации,
 *  латинско-кириллическим омоглифам и формам записи формул (9 х 2 + 2 = 9x2+2).
 *
 *  Модуль чистый (без DOM) — покрыт unit-тестами в src/lib/__tests__.
 */

import type { SelfWorkCheckResult, SelfWorkKeyPoint } from "./selfWorkTypes";

/** Порог «ответ в целом верный» для мягкого зачёта. */
export const SELF_WORK_PASS_RATIO = 0.7;

/** Минимальная длина токена, который вообще учитывается при сравнении. */
const MIN_TOKEN_LENGTH = 3;

/** Длина сравнения по основе слова: «цитоплазма»/«цитоплазму» совпадают. */
const STEM_LENGTH = 4;

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  в: "b",
  е: "e",
  ё: "e",
  і: "i",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  у: "y",
  х: "x",
};

/** Приводит текст к канонической форме для сравнения. */
export function normalizeSelfWorkText(input: unknown): string {
  let text = String(input ?? "").toLowerCase();
  text = text.replace(/[×*]/g, "x");
  // «х»/«x» как знак умножения — только между цифрами или скобками,
  // поэтому «хромосомы» не превращается в формулу.
  text = text.replace(/(?<=[\d)])\s*[xх]\s*(?=[\d(])/g, "x");
  // Пробелы вокруг знаков формул: «9 x 2 + 2» → «9x2+2».
  text = text.replace(/\s*([+x])\s*/g, "$1");
  // Омоглифы: кириллические буквы, похожие на латинские, приводим к латинице.
  // Кириллица, у которой нет латинского двойника, остаётся как есть — поэтому
  // фильтр ниже обязан сохранять русские буквы, иначе слова разрушаются.
  text = text.replace(/[а-яёі]/g, (ch) => CYRILLIC_TO_LATIN[ch] ?? ch);
  text = text.replace(/[^a-zа-я0-9+()x]+/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

/** Токены для сравнения: слова и формулы. */
export function tokenizeSelfWork(input: unknown): string[] {
  return normalizeSelfWorkText(input)
    .split(" ")
    .map((token) => token.replace(/^[()]+|[()]+$/g, ""))
    .filter((token) => token.length >= MIN_TOKEN_LENGTH || /^\d/.test(token));
}

function isNumericLike(token: string): boolean {
  return /^\d/.test(token);
}

function stemsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  // Числа и формулы сравниваются строго: «23» и «2» — разные ответы.
  if (isNumericLike(a) || isNumericLike(b)) return false;
  const shortest = Math.min(a.length, b.length);
  const longest = Math.max(a.length, b.length);
  if (shortest < MIN_TOKEN_LENGTH) return false;
  // «ядро» и «ядрышко» — разные структуры, поэтому слова, отличающиеся
  // длиной больше чем на 2 буквы, не считаем словоформами одного слова.
  if (longest - shortest > 2) return false;
  const size = Math.min(STEM_LENGTH, Math.max(MIN_TOKEN_LENGTH, shortest - 1));
  return a.slice(0, size) === b.slice(0, size);
}

function containsToken(answerTokens: string[], variantTokens: string[]): boolean {
  if (!variantTokens.length) return false;
  return variantTokens.every((variantToken) => answerTokens.some((answerToken) => stemsMatch(answerToken, variantToken)));
}

function matchesVariant(normalizedAnswer: string, answerTokens: string[], variant: string): boolean {
  const variantTokens = tokenizeSelfWork(variant);
  if (!variantTokens.length) {
    // Короткие/нестандартные формулировки (нет значимых токенов) сверяем как подстроку.
    const normalizedVariant = normalizeSelfWorkText(variant);
    return normalizedVariant.length > 0 && normalizedAnswer.includes(normalizedVariant);
  }
  return containsToken(answerTokens, variantTokens);
}

/** Совпал ли ответ хотя бы с одним принимаемым вариантом пункта. */
export function matchesSelfWorkKeyPoint(answer: unknown, keyPoint: SelfWorkKeyPoint): boolean {
  const normalizedAnswer = normalizeSelfWorkText(answer);
  const answerTokens = tokenizeSelfWork(answer);
  if (!normalizedAnswer.length) return false;
  const variants = (keyPoint.anyOf ?? []).map((variant) => String(variant ?? "")).filter((variant) => variant.trim().length > 0);
  const fallback = String(keyPoint.label ?? "");
  const all = variants.length ? variants : [fallback];
  return all.some((variant) => matchesVariant(normalizedAnswer, answerTokens, variant));
}

/** Проверяет письменный ответ по пунктам эталона и объясняет промахи. */
export function checkSelfWorkAnswer(answer: unknown, keyPoints: SelfWorkKeyPoint[]): SelfWorkCheckResult {
  const points = Array.isArray(keyPoints) ? keyPoints : [];
  const hits: SelfWorkKeyPoint[] = [];
  const misses: SelfWorkKeyPoint[] = [];
  const feedback: string[] = [];
  let score = 0;
  let max = 0;

  for (const point of points) {
    const weight = Number.isFinite(point.weight) && (point.weight as number) > 0 ? Number(point.weight) : 1;
    max += weight;
    if (matchesSelfWorkKeyPoint(answer, point)) {
      score += weight;
      hits.push(point);
    } else {
      misses.push(point);
      const hint = String(point.anyOf?.[0] ?? "").trim();
      feedback.push(hint ? `${point.label} — не найдено в ответе (эталон: ${hint}).` : `${point.label} — не найдено в ответе.`);
    }
  }

  const percent = max > 0 ? Math.round((score / max) * 100) : 0;
  return {
    total: points.length,
    score,
    max,
    percent,
    hits,
    misses,
    passed: max > 0 && score / max >= SELF_WORK_PASS_RATIO,
    complete: max > 0 && score === max,
    feedback,
  };
}

/** Проверка подписей к электронограмме: те же пункты, но с номерами структур. */
export function checkSelfWorkLabels(
  answer: unknown,
  labels: Array<{ n: number; label: string; anyOf: string[] }>,
): SelfWorkCheckResult {
  const points: SelfWorkKeyPoint[] = (labels ?? []).map((label) => ({
    id: `label-${label.n}`,
    label: `${label.n}. ${label.label}`,
    anyOf: label.anyOf.length ? label.anyOf : [label.label],
  }));
  return checkSelfWorkAnswer(answer, points);
}

/** Короткая подпись результата для интерфейса. */
export function selfWorkResultLabel(result: SelfWorkCheckResult): string {
  if (!result.total) return "Нет эталона для проверки";
  if (result.complete) return "Верно — все пункты эталона на месте";
  if (result.passed) return "В целом верно, но часть пунктов потеряна";
  return "Пока неверно — разбери пропущенные пункты и попробуй ещё раз";
}
