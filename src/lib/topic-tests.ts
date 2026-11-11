/**
 * Подбор теста к занятию — только по явным связям.
 *
 * Раньше тест искался по совпадению слов в названии темы, и к «Гидроксисоединениям»
 * подмешивался общий тест «Тема 3. Строение и химические свойства основных
 * классов»: слова «строение», «свойства», «классы» есть почти в каждой теме.
 * Поэтому порядок строго такой:
 *
 *  1. `test_id`, подписанный в кафедральном плане (public/content/<slug>/plan-*.json);
 *  2. тест, привязанный в БД к той же теме занятия (`tests.topic_id` = тема недели);
 *  3. объявленная таблица «класс соединений → тест» — для предметов, где
 *     привязки в плане ещё нет.
 *
 * Если ни одна связь не сработала, теста у темы нет — страница так и пишет,
 * вместо того чтобы предлагать случайно похожий тест.
 */

/** Минимальный набор полей теста, нужный для выбора. */
export type TopicTestRow = {
  id: string;
  title?: string | null;
  topic_id?: string | null;
};

/**
 * Класс соединений в теме занятия → фрагмент названия теста. Это объявленная
 * карта тем, а не поиск по словам: срабатывает только пара «тема занятия» и
 * «тест класса», обе заданы здесь вручную.
 */
export const TOPIC_TEST_ALIASES: ReadonlyArray<{ topic: RegExp; test: RegExp }> = [
  { topic: /галоген/i, test: /галоген/i },
  { topic: /арен|аромат|бензол|нафталин/i, test: /арен/i },
  { topic: /спирт|фенол|эфир/i, test: /спирты|фенолы/i },
  { topic: /альдегид|кетон|оксо/i, test: /альдегид/i },
  { topic: /карбонов/i, test: /карбонов/i },
  { topic: /амин/i, test: /амин/i },
  { topic: /диазо/i, test: /диазо/i },
];

/**
 * Общий тест курса («Тема 3. …») проверяет весь раздел, а не занятие: в
 * подбор по классу соединений он не попадает.
 */
const GENERAL_TEST_TITLE = /^\s*Тема\s*\d/i;

function uniqueIds(values: unknown): string[] {
  const ids: string[] = [];
  for (const value of Array.isArray(values) ? values : []) {
    const id = String(value || "").trim();
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Тесты занятия: явные id из плана → связь по теме в БД → объявленная карта
 * классов. Порядок и состав результата предсказуемы, поэтому его можно
 * проверять тестом.
 */
export function selectTopicTests(input: {
  tests: TopicTestRow[];
  /** `test_id` из кафедрального плана для этой лекции/занятия. */
  explicitTestIds?: Array<string | null | undefined> | null;
  /** Тема занятия в БД: `tests.topic_id` должен совпасть. */
  topicId?: string | null;
  /** Название темы занятия — только для карты классов, не для поиска по словам. */
  practiceTitle?: string | null;
  /** Сколько тестов показывать (по умолчанию 4). */
  limit?: number;
}): TopicTestRow[] {
  const tests = Array.isArray(input.tests) ? input.tests : [];
  if (!tests.length) return [];
  const limit = Math.max(1, input.limit ?? 4);
  const byId = new Map(tests.map((test) => [String(test.id), test]));

  const explicit = uniqueIds(input.explicitTestIds)
    .map((id) => byId.get(id))
    .filter((test): test is TopicTestRow => Boolean(test));
  if (explicit.length) return explicit.slice(0, limit);

  const topicId = String(input.topicId || "");
  if (topicId) {
    const linked = tests.filter((test) => String(test.topic_id || "") === topicId);
    if (linked.length) return linked.slice(0, limit);
  }

  const title = String(input.practiceTitle || "");
  if (!title) return [];
  return tests
    .filter((test) => {
      const testTitle = String(test.title || "");
      if (GENERAL_TEST_TITLE.test(testTitle)) return false;
      return TOPIC_TEST_ALIASES.some((alias) => alias.topic.test(title) && alias.test.test(testTitle));
    })
    .slice(0, limit);
}
