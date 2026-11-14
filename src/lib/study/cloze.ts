/**
 * Проверка ответа в конспекте с пропусками (Фаза 4 дорожной карты).
 *
 * Сравнение мягкое к форме и строгое к содержанию: регистр, ё/е, пунктуация и
 * лишние пробелы не мешают, но термин должен совпасть целиком. Эталон берётся
 * из текста лекции (сервер уже проверил дословность цитаты), а не из ответа ИИ.
 */
export function normalizeAnswer(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Верно ли заполнен пропуск: пустой ответ никогда не считается верным. */
export function isClozeAnswerCorrect(input: string, expected: string): boolean {
  const answer = normalizeAnswer(input);
  if (!answer) return false;
  return answer === normalizeAnswer(expected);
}
