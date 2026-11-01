/** Юнит-проверка чистых модулей «Подготовка к самостоятельной» и «Режим экзамена».
 *
 *  Покрываются контрактные модули (их не меняем — T1/T2 только наполняют):
 *   - openAnswerCheck.ts   — нормализация, токенизация, матчинг, проверка ответа/подписей;
 *   - examGrade.ts         — оценка 3/4/5 и пояснения;
 *   - selfWorkProgress.ts  — локальный прогресс (node без DOM + с window-заглушкой);
 *   - selfWorkTopics.ts    — реестр тем (не зависит от наполнения контента T1).
 *
 *  Тесты намеренно не зависят от содержимого embryologySelfWork.ts (T1 может
 *  наполнять его параллельно): для темы проверяем только lectureId/наличие.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SELF_WORK_PASS_RATIO,
  checkSelfWorkAnswer,
  checkSelfWorkLabels,
  matchesSelfWorkKeyPoint,
  normalizeSelfWorkText,
  selfWorkResultLabel,
  tokenizeSelfWork,
} from "../histology/openAnswerCheck";
import { computeExamGrade, examGradeLabel } from "../histology/examGrade";
import {
  SELF_WORK_PROGRESS_EVENT,
  mistakeQuestionIds,
  readSelfWorkProgress,
  recordSelfWorkResult,
  resetSelfWorkQuestion,
  selfWorkEntry,
} from "../histology/selfWorkProgress";
import { listSelfWorkTopics, selfWorkTopicForLecture } from "../histology/selfWorkTopics";
import type { SelfWorkCheckResult, SelfWorkKeyPoint } from "../histology/selfWorkTypes";

/* ── helpers ─────────────────────────────────────────────────────────────── */

function keyPoint(id: string, label: string, anyOf: string[], weight?: number): SelfWorkKeyPoint {
  return weight === undefined ? { id, label, anyOf } : { id, label, anyOf, weight };
}

/** Полный SelfWorkCheckResult — чтобы не дублировать в каждом computeExamGrade-кейсе. */
function result(overrides: Partial<SelfWorkCheckResult> = {}): SelfWorkCheckResult {
  return {
    total: 0,
    score: 0,
    max: 0,
    percent: 0,
    hits: [],
    misses: [],
    passed: false,
    complete: false,
    feedback: [],
    ...overrides,
  };
}

const complete = (score = 3): SelfWorkCheckResult =>
  result({ total: score, score, max: score, percent: 100, passed: true, complete: true });

/** Слова с различимыми первыми 4 символами — стем-матчинг не даёт ложных склеек. */
const WORDS = ["axone", "blast", "chord", "derm", "endod", "fibro", "gastr", "hypob", "impla", "jelly"];

const TEN_POINTS: SelfWorkKeyPoint[] = WORDS.map((word, index) => keyPoint(`k${index + 1}`, `Пункт ${index + 1}`, [word]));

/* ── 1. normalizeSelfWorkText / tokenizeSelfWork ─────────────────────────── */

describe("normalizeSelfWorkText / tokenizeSelfWork", () => {
  it("приводит регистр к нижнему", () => {
    expect(normalizeSelfWorkText("ЦИТОПЛАЗМА")).toBe(normalizeSelfWorkText("цитоплазма"));
  });

  it("приравнивает «ё» и «е»", () => {
    expect(normalizeSelfWorkText("ЁЖ")).toBe(normalizeSelfWorkText("еж"));
  });

  it("сводит латинско-кириллические омоглифы к одной форме", () => {
    // «хорда» кириллицей и «xopдa» латиницей (x, o, p, a) — одна и та же строка.
    expect(normalizeSelfWorkText("ХОРДА")).toBe(normalizeSelfWorkText("xopдa"));
    expect(matchesSelfWorkKeyPoint("xopдa", keyPoint("k", "Хорда", ["хорда"]))).toBe(true);
  });

  it("игнорирует пунктуацию и лишние пробелы", () => {
    expect(normalizeSelfWorkText("Хорда,  нервная   трубка!")).toBe(normalizeSelfWorkText("хорда нервная трубка"));
    expect(normalizeSelfWorkText("  хорда \n трубка  ")).toBe("xopдa tpyбka");
  });

  it("нормализует запись формулы «9 х 2 + 2» → «9x2+2»", () => {
    expect(normalizeSelfWorkText("9 х 2 + 2")).toBe("9x2+2");
    expect(normalizeSelfWorkText("9 × 2 + 2")).toBe("9x2+2");
    expect(normalizeSelfWorkText("(9+2)х2")).toBe("(9+2)x2");
    expect(checkSelfWorkAnswer("9 х 2 + 2 = 20", [keyPoint("f", "Формула", ["9x2+2"])]).complete).toBe(true);
    expect(checkSelfWorkAnswer("(9+2)х2 = 22", [keyPoint("f", "Другой вариант", ["(9+2)x2"])]).complete).toBe(true);
  });

  it("токенизирует слова и формулы, отбрасывая короткие служебные слова", () => {
    expect(tokenizeSelfWork("Хорда, нервная трубка!")).toHaveLength(3);
    expect(tokenizeSelfWork("в и на хорда")).toEqual(["xopдa"]);
    expect(tokenizeSelfWork("9 х 2 + 2")).toEqual(["9x2+2"]);
  });

  it("сохраняет короткие числовые токены (числа важны для эталона)", () => {
    expect(tokenizeSelfWork("стадия 7")).toEqual(["ctaдия", "7"]);
    expect(tokenizeSelfWork("в 2")).toEqual(["2"]);
  });
});

/* ── 2. matchesSelfWorkKeyPoint / checkSelfWorkAnswer ────────────────────── */

describe("matchesSelfWorkKeyPoint", () => {
  it("принимает словоформы по основе слова", () => {
    expect(matchesSelfWorkKeyPoint("структура видна в цитоплазме", keyPoint("k", "цитоплазма", ["цитоплазма"]))).toBe(true);
  });

  it("не склеивает разные термины с общей основой («ядрышко» ≠ «ядро»)", () => {
    expect(matchesSelfWorkKeyPoint("ядрышко", keyPoint("k", "ядро", ["ядро"]))).toBe(false);
    expect(matchesSelfWorkKeyPoint("ядро", keyPoint("k", "ядро", ["ядро"]))).toBe(true);
  });

  it("сравнивает числа строго («23» ≠ «2»)", () => {
    expect(matchesSelfWorkKeyPoint("23", keyPoint("k", "хромосом", ["23"]))).toBe(true);
    expect(matchesSelfWorkKeyPoint("2", keyPoint("k", "хромосом", ["23"]))).toBe(false);
    expect(matchesSelfWorkKeyPoint("23", keyPoint("k", "хромосом", ["2"]))).toBe(false);
  });

  it("находит любой из принимаемых вариантов пункта", () => {
    const point = keyPoint("k", "Кортикальная реакция", ["кортикальная реакция", " cortical reaction "]);
    expect(matchesSelfWorkKeyPoint("произошла кортикальная реакция", point)).toBe(true);
    expect(matchesSelfWorkKeyPoint("cortical reaction", point)).toBe(true);
    expect(matchesSelfWorkKeyPoint("акросомальная реакция", point)).toBe(false);
  });

  it("не срабатывает на пустом ответе", () => {
    expect(matchesSelfWorkKeyPoint("", keyPoint("k", "ядро", ["ядро"]))).toBe(false);
    expect(matchesSelfWorkKeyPoint("   ", keyPoint("k", "ядро", ["ядро"]))).toBe(false);
  });
});

describe("checkSelfWorkAnswer", () => {
  it("на пустом ответе: 0 баллов, все пункты в misses", () => {
    for (const answer of ["", "   ", null, undefined]) {
      const check = checkSelfWorkAnswer(answer, TEN_POINTS);
      expect(check.total).toBe(10);
      expect(check.score).toBe(0);
      expect(check.max).toBe(10);
      expect(check.percent).toBe(0);
      expect(check.hits).toHaveLength(0);
      expect(check.misses).toHaveLength(10);
      expect(check.feedback).toHaveLength(10);
      expect(check.passed).toBe(false);
      expect(check.complete).toBe(false);
    }
  });

  it("частичный ответ: passed при >= 70%, но complete=false", () => {
    expect(SELF_WORK_PASS_RATIO).toBe(0.7);

    const sixty = checkSelfWorkAnswer(WORDS.slice(0, 6).join(" "), TEN_POINTS);
    expect(sixty.score).toBe(6);
    expect(sixty.percent).toBe(60);
    expect(sixty.passed).toBe(false);
    expect(sixty.complete).toBe(false);

    const seventy = checkSelfWorkAnswer(WORDS.slice(0, 7).join(" "), TEN_POINTS);
    expect(seventy.score).toBe(7);
    expect(seventy.percent).toBe(70);
    expect(seventy.passed).toBe(true);
    expect(seventy.complete).toBe(false);
    expect(seventy.misses).toHaveLength(3);
  });

  it("полный ответ: complete=true, feedback пуст", () => {
    const check = checkSelfWorkAnswer(WORDS.join(" "), TEN_POINTS);
    expect(check.score).toBe(10);
    expect(check.max).toBe(10);
    expect(check.percent).toBe(100);
    expect(check.hits).toHaveLength(10);
    expect(check.misses).toHaveLength(0);
    expect(check.feedback).toEqual([]);
    expect(check.passed).toBe(true);
    expect(check.complete).toBe(true);
  });

  it("объясняет каждый потерянный пункт (label + эталон)", () => {
    const check = checkSelfWorkAnswer("axone", [TEN_POINTS[0], TEN_POINTS[1]]);
    expect(check.feedback).toHaveLength(1);
    expect(check.feedback[0]).toContain("Пункт 2");
    expect(check.feedback[0]).toContain("blast");
    expect(check.feedback[0]).toContain("не найдено");
  });

  it("учитывает weight в score/max", () => {
    const points = [keyPoint("k1", "Хорда", ["хорда"], 2), keyPoint("k2", "Нервная трубка", ["нервная трубка"], 3)];

    const partial = checkSelfWorkAnswer("хорда", points);
    expect(partial.score).toBe(2);
    expect(partial.max).toBe(5);
    expect(partial.percent).toBe(40);
    expect(partial.passed).toBe(false);

    const full = checkSelfWorkAnswer("хорда, нервная трубка", points);
    expect(full.score).toBe(5);
    expect(full.max).toBe(5);
    expect(full.complete).toBe(true);
  });

  it("некорректный weight (0/NaN/отрицательный) считается как 1", () => {
    const points = [
      keyPoint("k1", "Хорда", ["хорда"], 0),
      keyPoint("k2", "Нервная трубка", ["нервная трубка"], Number.NaN),
      keyPoint("k3", "Сомит", ["сомит"], -5),
    ];
    const check = checkSelfWorkAnswer("хорда", points);
    expect(check.max).toBe(3);
    expect(check.score).toBe(1);
  });

  it("пустой список эталона не даёт ложного зачёта", () => {
    const check = checkSelfWorkAnswer("хорда", []);
    expect(check.total).toBe(0);
    expect(check.max).toBe(0);
    expect(check.percent).toBe(0);
    expect(check.passed).toBe(false);
    expect(check.complete).toBe(false);
  });
});

/* ── 3. checkSelfWorkLabels ──────────────────────────────────────────────── */

describe("checkSelfWorkLabels", () => {
  const labels = [
    { n: 1, label: "ядро", anyOf: ["ядро"] },
    { n: 2, label: "митохондрии", anyOf: ["митохондрии", "спиральное тело"] },
    { n: 3, label: "аксонема жгутика", anyOf: ["аксонема"] },
  ];

  it("формирует пункты из n/label (id=label-N, label=«N. текст»)", () => {
    const check = checkSelfWorkLabels("1. ядро; 2. митохондрии; 3. аксонема", labels);
    expect(check.total).toBe(3);
    expect(check.complete).toBe(true);
    expect(check.hits.map((point) => point.id)).toEqual(["label-1", "label-2", "label-3"]);
    expect(check.hits[0].label).toBe("1. ядро");
    expect(check.hits[2].label).toBe("3. аксонема жгутика");
  });

  it("сопоставляет подписи по номерам и находит частичный ответ", () => {
    const check = checkSelfWorkLabels("1. ядро", labels);
    expect(check.score).toBe(1);
    expect(check.max).toBe(3);
    expect(check.passed).toBe(false);
    expect(check.complete).toBe(false);
    expect(check.misses.map((point) => point.id)).toEqual(["label-2", "label-3"]);
  });

  it("при пустом anyOf принимает label", () => {
    const check = checkSelfWorkLabels("жгутик", [{ n: 1, label: "жгутик", anyOf: [] }]);
    expect(check.complete).toBe(true);
  });

  it("не падает на пустом списке подписей", () => {
    const check = checkSelfWorkLabels("что угодно", []);
    expect(check.total).toBe(0);
    expect(check.complete).toBe(false);
  });
});

/* ── 4. selfWorkResultLabel ──────────────────────────────────────────────── */

describe("selfWorkResultLabel", () => {
  it("три ветки + отсутствие эталона", () => {
    expect(selfWorkResultLabel(result({ total: 3, complete: true, passed: true }))).toContain("все пункты эталона");
    expect(selfWorkResultLabel(result({ total: 3, complete: false, passed: true }))).toContain("В целом верно");
    expect(selfWorkResultLabel(result({ total: 3, complete: false, passed: false }))).toContain("неверно");
    expect(selfWorkResultLabel(result({ total: 0 }))).toContain("Нет эталона");
  });
});

/* ── 5. computeExamGrade ─────────────────────────────────────────────────── */

describe("computeExamGrade", () => {
  it("не все три задания → grade 0, baseComplete=false, notes перечисляют незачтённые", () => {
    const grade = computeExamGrade({
      task1: complete(),
      task2: result({ total: 4, score: 2, max: 4, percent: 50, misses: [{ id: "m", label: "пункт", anyOf: ["x"] }] }),
      task3: complete(),
    });
    expect(grade.grade).toBe(0);
    expect(grade.baseComplete).toBe(false);
    expect(grade.label).toContain("Ниже «3»");
    expect(grade.notes).toHaveLength(3);
    expect(grade.notes.some((note) => note.includes("не зачтено"))).toBe(true);
    expect(grade.notes.some((note) => note.includes(" выполнено "))).toBe(true);
  });

  it("все три задания → базовая «3»", () => {
    const grade = computeExamGrade({ task1: complete(), task2: complete(), task3: complete() });
    expect(grade.grade).toBe(3);
    expect(grade.baseComplete).toBe(true);
    expect(grade.label).toBe("Оценка «3»");
    expect(grade.notes.some((note) => note.includes("базовая оценка «3»"))).toBe(true);
    expect(grade.notes.some((note) => note.includes("До «4»"))).toBe(true);
  });

  it("memo неполный → остаётся «3» и есть подсказка до «4»", () => {
    const grade = computeExamGrade({
      task1: complete(),
      task2: complete(),
      task3: complete(),
      memo: result({ total: 4, score: 2, max: 4, percent: 50 }),
    });
    expect(grade.grade).toBe(3);
    expect(grade.baseComplete).toBe(true);
    expect(grade.notes.some((note) => note.includes("До «4»") && note.includes("2/4"))).toBe(true);
  });

  it("все три задания + memo complete → «4» (без углублённого ответа)", () => {
    const grade = computeExamGrade({
      task1: complete(),
      task2: complete(),
      task3: complete(),
      memo: complete(4),
    });
    expect(grade.grade).toBe(4);
    expect(grade.baseComplete).toBe(true);
    expect(grade.label).toBe("Оценка «4»");
    expect(grade.notes.some((note) => note.includes("До «5»"))).toBe(true);
  });

  it("memo complete + theoryDetail complete → «5»", () => {
    const grade = computeExamGrade({
      task1: complete(),
      task2: complete(),
      task3: complete(),
      memo: complete(4),
      theoryDetail: complete(5),
    });
    expect(grade.grade).toBe(5);
    expect(grade.baseComplete).toBe(true);
    expect(grade.label).toBe("Оценка «5»");
    expect(grade.notes.some((note) => note.includes("максимально подробно — «5»"))).toBe(true);
  });

  it("memo complete + theoryDetail неполный → остаётся «4»", () => {
    const grade = computeExamGrade({
      task1: complete(),
      task2: complete(),
      task3: complete(),
      memo: complete(4),
      theoryDetail: result({ total: 3, score: 1, max: 3, percent: 33 }),
    });
    expect(grade.grade).toBe(4);
    expect(grade.label).toBe("Оценка «4»");
    expect(grade.notes.some((note) => note.includes("До «5»") && note.includes("1/3"))).toBe(true);
  });

  it("theoryDetail complete без memo не даёт «5» — остаётся «3»", () => {
    const grade = computeExamGrade({
      task1: complete(),
      task2: complete(),
      task3: complete(),
      theoryDetail: complete(5),
    });
    expect(grade.grade).toBe(3);
    expect(grade.label).toBe("Оценка «3»");
    expect(grade.notes.some((note) => note.includes("До «4»"))).toBe(true);
  });

  it("старый вызов без theoryDetail валиден (обратная совместимость)", () => {
    const grade = computeExamGrade({ task1: complete(), task2: complete(), task3: complete(), memo: complete(4) });
    expect(grade.grade).toBe(4);
  });

  it("memo не передан → подсказка, что описать клетку по памятке", () => {
    const grade = computeExamGrade({ task1: complete(), task2: complete(), task3: complete(), memo: null });
    expect(grade.grade).toBe(3);
    expect(grade.notes.some((note) => note.includes("по памятке"))).toBe(true);
  });

  it("examGradeLabel: 0 → «Не зачтено», иначе число", () => {
    expect(examGradeLabel({ grade: 0, label: "", notes: [], baseComplete: false })).toBe("Не зачтено");
    expect(examGradeLabel({ grade: 3, label: "", notes: [], baseComplete: true })).toBe("3");
    expect(examGradeLabel({ grade: 5, label: "", notes: [], baseComplete: true })).toBe("5");
  });
});

/* ── 6. selfWorkProgress ─────────────────────────────────────────────────── */

type FakeStorage = {
  data: Map<string, string>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function makeFakeStorage(): FakeStorage {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key),
    clear: () => data.clear(),
  };
}

function installWindow(store: FakeStorage): { events: () => number } {
  let count = 0;
  const fakeWindow = {
    localStorage: store,
    dispatchEvent: () => {
      count += 1;
      return true;
    },
  };
  (globalThis as unknown as { window?: unknown }).window = fakeWindow;
  return { events: () => count };
}

function removeWindow(): void {
  delete (globalThis as unknown as { window?: unknown }).window;
}

const STORAGE_KEY = "mb_selfwork_v1";
const LECTURE = "hist-03-embriologiya";

describe("selfWorkProgress", () => {
  afterEach(() => removeWindow());

  it("без window readSelfWorkProgress() возвращает {} и не падает", () => {
    removeWindow();
    expect(readSelfWorkProgress()).toEqual({});
    expect(selfWorkEntry(LECTURE)).toEqual({ passed: [], mistakes: [], attempts: 0, updatedAt: 0 });
    expect(mistakeQuestionIds(LECTURE)).toEqual([]);
  });

  it("без window записи молча игнорируются", () => {
    removeWindow();
    expect(() => {
      recordSelfWorkResult(LECTURE, "q1", { complete: true, passed: true });
      resetSelfWorkQuestion(LECTURE, "q1");
    }).not.toThrow();
    expect(readSelfWorkProgress()).toEqual({});
  });

  describe("с window-заглушкой", () => {
    let store: FakeStorage;
    let events: { events: () => number };

    beforeEach(() => {
      store = makeFakeStorage();
      events = installWindow(store);
    });

    it("complete=true → вопрос в passed и удалён из mistakes", () => {
      recordSelfWorkResult(LECTURE, "q1", { complete: true, passed: true });
      const entry = selfWorkEntry(LECTURE);
      expect(entry.passed).toEqual(["q1"]);
      expect(entry.mistakes).toEqual([]);
      expect(entry.attempts).toBe(1);
      expect(entry.updatedAt).toBeGreaterThan(0);
      expect(events.events()).toBe(1);
      expect(store.data.has(STORAGE_KEY)).toBe(true);
    });

    it("passed (не complete) → вопрос в mistakes и не в passed", () => {
      recordSelfWorkResult(LECTURE, "q2", { complete: false, passed: true });
      expect(selfWorkEntry(LECTURE).passed).toEqual([]);
      expect(mistakeQuestionIds(LECTURE)).toEqual(["q2"]);
    });

    it("отрицательный результат тоже попадает в mistakes", () => {
      recordSelfWorkResult(LECTURE, "q3", { complete: false, passed: false });
      expect(mistakeQuestionIds(LECTURE)).toEqual(["q3"]);
    });

    it("mistakes → passed: повтор с полным ответом убирает вопрос из ошибок", () => {
      recordSelfWorkResult(LECTURE, "q1", { complete: false, passed: true });
      expect(mistakeQuestionIds(LECTURE)).toEqual(["q1"]);

      recordSelfWorkResult(LECTURE, "q1", { complete: true, passed: true });
      const entry = selfWorkEntry(LECTURE);
      expect(entry.passed).toEqual(["q1"]);
      expect(entry.mistakes).toEqual([]);
      expect(entry.attempts).toBe(2);
    });

    it("resetSelfWorkQuestion убирает вопрос из passed и mistakes", () => {
      recordSelfWorkResult(LECTURE, "q1", { complete: true, passed: true });
      recordSelfWorkResult(LECTURE, "q2", { complete: false, passed: true });
      resetSelfWorkQuestion(LECTURE, "q1");
      resetSelfWorkQuestion(LECTURE, "q2");
      const entry = selfWorkEntry(LECTURE);
      expect(entry.passed).toEqual([]);
      expect(entry.mistakes).toEqual([]);
    });

    it("resetSelfWorkQuestion для неизвестной лекции ничего не создаёт", () => {
      resetSelfWorkQuestion("other-lecture", "q1");
      expect(readSelfWorkProgress()["other-lecture"]).toBeUndefined();
    });

    it("несколько лекций не смешиваются, selfWorkEntry принимает готовый прогресс", () => {
      recordSelfWorkResult(LECTURE, "q1", { complete: true, passed: true });
      recordSelfWorkResult("other-lecture", "z1", { complete: false, passed: true });
      const progress = readSelfWorkProgress();
      expect(mistakeQuestionIds(LECTURE, progress)).toEqual([]);
      expect(mistakeQuestionIds("other-lecture", progress)).toEqual(["z1"]);
      expect(selfWorkEntry("other-lecture", progress).mistakes).toEqual(["z1"]);
    });

    it("событие прогресса — именованное (для подписки в UI)", () => {
      expect(SELF_WORK_PROGRESS_EVENT).toBe("mb-selfwork-progress");
    });

    it("битый JSON и мусорные записи не ломают чтение", () => {
      store.setItem(STORAGE_KEY, "{не json");
      expect(readSelfWorkProgress()).toEqual({});

      store.setItem(STORAGE_KEY, JSON.stringify({ [LECTURE]: "мусор", "bad": { passed: "нет", mistakes: [1, "", "ok"] } }));
      const progress = readSelfWorkProgress();
      expect(progress[LECTURE]).toEqual({ passed: [], mistakes: [], attempts: 0, updatedAt: 0 });
      expect(progress.bad).toEqual({ passed: [], mistakes: ["1", "ok"], attempts: 0, updatedAt: 0 });
    });

    it("массив вместо объекта в хранилище → {}", () => {
      store.setItem(STORAGE_KEY, "[]");
      expect(readSelfWorkProgress()).toEqual({});
    });
  });
});

/* ── 7. selfWorkTopics (не зависит от наполнения контента T1) ─────────────── */

describe("selfWorkTopics", () => {
  it("находит тему эмбриологии по id лекции", () => {
    const topic = selfWorkTopicForLecture("hist-03-embriologiya");
    expect(topic).not.toBeNull();
    expect(topic?.lectureId).toBe("hist-03-embriologiya");
    expect(typeof topic?.title).toBe("string");
    expect(Array.isArray(topic?.openQuestions)).toBe(true);
    expect(topic?.exam).toBeTruthy();
  });

  it("реестр содержит тему (даже если контент ещё пуст)", () => {
    expect(listSelfWorkTopics().some((topic) => topic.lectureId === "hist-03-embriologiya")).toBe(true);
  });

  it("пустой id и мусор → null", () => {
    for (const bad of ["", "   ", "hist-99-unknown", "мусор", null, undefined]) {
      expect(selfWorkTopicForLecture(bad)).toBeNull();
    }
  });
});
