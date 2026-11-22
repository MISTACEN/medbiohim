/**
 * Строка второго мнения по тестовому вопросу.
 *
 * Арбитр отвечает строгим JSON `{correct, verdict, why}`, где `verdict` — это
 * `key` (прав эталон), `user` (прав студент, ключ ошибается) или `both` (оба
 * неверны). Здесь чистая часть: из вердикта и текста разбора получается одна
 * короткая строка и признак «разбор и перепроверка расходятся». Логика вынесена
 * из компонента, чтобы её можно было проверить тестом без сети и без ИИ.
 */
import type { AiAnswerCheck } from "@/lib/features-api";

const LETTERS = ["А", "Б", "В", "Г", "Д", "Е", "Ж", "З"];

/**
 * Арбитр возвращает букву варианта («A»), а не текст. Если вариант есть в
 * вопросе, показываем его формулировку: «правильный А) Повышение СОЭ».
 */
export function correctLabel(correct: string | undefined, options?: string[]): string {
  const raw = String(correct || "").trim();
  if (!raw || !options?.length) return raw;
  const letter = raw.toUpperCase().replace(/[).].*$/, "");
  const latin = "ABCDEFGH".indexOf(letter);
  const index = latin >= 0 ? latin : LETTERS.indexOf(letter);
  const text = index >= 0 ? String(options[index] || "").trim() : "";
  return text ? `${LETTERS[index]}) ${text}` : raw;
}

/** Какой вердикт уже написан в самом разборе (первый ответ модели). */
export function statedVerdict(firstAnswer: string): AiAnswerCheck["verdict"] | null {
  if (/Оба ответа неверны/.test(firstAnswer)) return "both";
  if (/ваш ответ вернее/i.test(firstAnswer)) return "user";
  if (/Ключ верен/.test(firstAnswer)) return "key";
  return null;
}

export function arbiterLine(
  arbiter: AiAnswerCheck | null,
  firstAnswer: string,
  options?: string[],
): { text: string; disagree: boolean } | null {
  if (!arbiter) return null;
  const stated = statedVerdict(firstAnswer);
  const text = arbiter.verdict === "both"
    ? `Перепроверка: оба ответа неверны — правильный ${correctLabel(arbiter.correct, options) || "указан в разборе"}`
    : arbiter.verdict === "user"
      ? "Перепроверка: правы вы, в ключе ошибка"
      : "Перепроверка: ключ верен";
  return { text, disagree: Boolean(stated && stated !== arbiter.verdict) };
}
