import { describe, expect, it } from "vitest";
import {
  gradeQuestion,
  normalizeQuestion,
  questionTypeLabel,
  resolveQuestionType,
  toPublicQuestion,
  type ServerQuestionLike,
} from "@/lib/question-types";

/** Прежняя подпись из src/app/practice/page.tsx до перехода на реестр. */
const LEGACY_LABELS: Array<[string, string]> = [
  ["mc", "Тест"],
  ["mcq", "Тест"],
  ["single", "Тест"],
  ["single_choice", "Тест"],
  ["single-choice", "Тест"],
  ["open", "Открытый"],
  ["text", "Открытый"],
  ["short_answer", "Открытый"],
  ["short-answer", "Открытый"],
  ["task", "Задача"],
  ["theory", "Теория"],
  ["practical", "Практика"],
  ["main", "Основной"],
  ["ticket", "Билетный"],
  ["true_false", "Верно/неверно"],
  ["truefalse", "Верно/неверно"],
  ["true-false", "Верно/неверно"],
  ["matching", "Соответствие"],
  ["match", "Соответствие"],
  ["", ""],
  ["unknown-kind", "UNKNOWN-KIND"],
];

const closedPayload: ServerQuestionLike = {
  id: "q-1",
  type: "mcq",
  text: "Что изображено на микрофотографии?",
  answer: "1",
  options: [
    { key: "А", label: "Эритроцит", correct: true },
    { key: "Б", label: "Лейкоцит", correct: false },
    { key: "В", label: "Тромбоцит", correct: false },
  ],
  is_closed: true,
  correct_keys: ["А"],
  correct_indexes: [0],
};

describe("реестр типов", () => {
  it("сохраняет прежние подписи интерфейса", () => {
    for (const [raw, expected] of LEGACY_LABELS) {
      expect(questionTypeLabel(raw)).toBe(expected);
    }
  });

  it("разрешает легаси-написания в канонические типы", () => {
    expect(resolveQuestionType("mcq")?.id).toBe("single_choice");
    expect(resolveQuestionType("multiple-choice")?.id).toBe("multiple_choice");
    expect(resolveQuestionType("theory")?.id).toBe("open_text");
    expect(resolveQuestionType("sequence")?.id).toBe("ordering");
    expect(resolveQuestionType("nope")).toBeUndefined();
  });

  it("не выдаёт ноль проверки для типов без детерминированной проверки", () => {
    expect(resolveQuestionType("image_hotspot")?.grading).toBe("none");
    expect(resolveQuestionType("clinical_case")?.grading).toBe("none");
  });
});

describe("нормализация серверного payload", () => {
  it("переносит закрытый вопрос в единую модель", () => {
    const question = normalizeQuestion(closedPayload);
    expect(question.type).toBe("single_choice");
    expect(question.kind).toBe("closed");
    expect(question.options.map((option) => option.key)).toEqual(["А", "Б", "В"]);
    expect(question.correctKeys).toEqual(["А"]);
    expect(question.correctIndexes).toEqual([0]);
    expect(question.resolved).toBe(true);
    expect(question.answerDisplay).toBe("А) Эритроцит");
  });

  it("принимает варианты строками и JSON-строкой", () => {
    const question = normalizeQuestion({
      type: "mcq",
      text: "Вопрос",
      options: ["Первый", "Второй"],
      answer: "2",
      is_closed: true,
      correct_indexes: [1],
    });
    expect(question.options).toHaveLength(2);
    expect(question.options[0]?.key).toBe("A");
    expect(question.options[1]?.label).toBe("Второй");

    const fromJson = normalizeQuestion({
      type: "mcq",
      text: "Вопрос",
      options: JSON.stringify([{ label: "Один", correct: true }, { label: "Два" }]),
      is_closed: true,
    });
    expect(fromJson.correctIndexes).toEqual([0]);
  });

  it("открытый вопрос не превращается в закрытый", () => {
    const question = normalizeQuestion({
      type: "open",
      text: "Опишите механизм",
      answer: "Осмос — диффузия воды",
      is_closed: false,
    });
    expect(question.type).toBe("open_text");
    expect(question.kind).toBe("open");
    expect(question.resolved).toBe(true);
    expect(question.options).toEqual([]);
  });

  it("последовательность помечает requires_order", () => {
    const question = normalizeQuestion({
      type: "ordering",
      text: "Расставьте этапы",
      options: ["Первый", "Второй", "Третий"],
      is_closed: true,
      order_indexes: [0, 2, 1],
    });
    expect(question.requiresOrder).toBe(true);
    expect(question.orderIndexes).toEqual([0, 2, 1]);
  });

  it("экзаменационный вид скрывает эталон и признаки правильности", () => {
    const pub = toPublicQuestion(normalizeQuestion(closedPayload));
    expect(pub.options.every((option) => option.correct === undefined)).toBe(true);
    expect(pub.correctKeys).toEqual([]);
    expect(pub.correctIndexes).toEqual([]);
    expect(pub.answerDisplay).toBe("");
    expect(pub.answer).toBe("");
  });
});

describe("единая проверка ответа", () => {
  it("закрытый одиночный выбор", () => {
    const question = normalizeQuestion(closedPayload);
    expect(gradeQuestion(question, ["А"]).isCorrect).toBe(true);
    expect(gradeQuestion(question, "А").isCorrect).toBe(true);
    expect(gradeQuestion(question, ["Б"]).isCorrect).toBe(false);
    expect(gradeQuestion(question, []).isCorrect).toBe(false);
  });

  it("множественный выбор требует точного совпадения", () => {
    const question = normalizeQuestion({
      type: "multiple_choice",
      text: "Выберите всё верное",
      options: [{ label: "A1" }, { label: "A2" }, { label: "A3" }],
      is_closed: true,
      allow_multiple: true,
      correct_indexes: [0, 2],
    });
    expect(gradeQuestion(question, ["A", "C"]).isCorrect).toBe(true);
    expect(gradeQuestion(question, ["A", "B", "C"]).isCorrect).toBe(false);
    expect(gradeQuestion(question, ["A"]).isCorrect).toBe(false);
  });

  it("последовательность сравнивается по порядку", () => {
    const question = normalizeQuestion({
      type: "ordering",
      text: "Расставьте",
      options: ["Первый", "Второй", "Третий"],
      is_closed: true,
      order_indexes: [0, 2, 1],
    });
    expect(gradeQuestion(question, ["A", "C", "B"]).isCorrect).toBe(true);
    expect(gradeQuestion(question, "ACB").isCorrect).toBe(true);
    expect(gradeQuestion(question, ["C", "A", "B"]).isCorrect).toBe(false);
  });

  it("открытый текст проверяется нормализованно", () => {
    const question = normalizeQuestion({
      type: "short_text",
      text: "Термин",
      answer: "Осмос",
      is_closed: false,
    });
    expect(gradeQuestion(question, "осмос").isCorrect).toBe(true);
    expect(gradeQuestion(question, "  ОСМОС ").isCorrect).toBe(true);
    expect(gradeQuestion(question, "диффузия").isCorrect).toBe(false);
  });

  it("численный ответ сравнивается как число", () => {
    const question = normalizeQuestion({ type: "numeric", text: "Сколько?", answer: "5", is_closed: true });
    expect(gradeQuestion(question, "5").isCorrect).toBe(true);
    expect(gradeQuestion(question, "5,0").isCorrect).toBe(true);
    expect(gradeQuestion(question, "6").isCorrect).toBe(false);
  });

  it("без эталона и для неподдержанного типа результат null", () => {
    const unresolved = normalizeQuestion({ type: "mcq", text: "Без ключа", options: ["A", "B"], is_closed: true });
    expect(gradeQuestion(unresolved, ["A"]).isCorrect).toBeNull();
    const unsupported = normalizeQuestion({ type: "image_hotspot", text: "Клик по фото", is_closed: true });
    expect(gradeQuestion(unsupported, "A").isCorrect).toBeNull();
  });
});

describe("паритет с серверным каноном", () => {
  it("совпадает с gradeClosedAnswer на наборе ответов", async () => {
    const server = (await import("../../../integrations/cloudflare-api/src/question-format.js")) as {
      normalizeQuestion: (input: Record<string, unknown>) => Record<string, unknown>;
      gradeClosedAnswer: (question: unknown, given: unknown) => { is_correct: boolean | null };
    };

    const payloads: Array<Record<string, unknown>> = [
      { type: "mcq", text: "Один", options: ["Первый", "Второй", "Третий"], answer: "2", is_closed: true },
      { type: "multiple", text: "Несколько", options: ["A1", "A2", "A3"], answer: "1,3", is_closed: true },
      { type: "ordering", text: "Порядок", options: ["Первый", "Второй", "Третий"], answer: "132", is_closed: true },
      {
        type: "mcq",
        text: "Флаги",
        options: [{ label: "Верно", correct: true }, { label: "Неверно" }],
        is_closed: true,
      },
    ];
    const variants: unknown[][] = [
      [],
      ["1"],
      ["2"],
      ["3"],
      ["1", "2"],
      ["1", "3"],
      ["A"],
      ["Б"],
      ["В"],
      ["132"],
      ["1,3"],
    ];

    for (const payload of payloads) {
      // На входе клиента — уже нормализованный сервером вопрос, а не сырой payload.
      const serverNormalized = server.normalizeQuestion(payload);
      const question = normalizeQuestion(serverNormalized as ServerQuestionLike);
      for (const given of variants) {
        const expected = server.gradeClosedAnswer(serverNormalized, given).is_correct;
        const actual = gradeQuestion(question, given as never).isCorrect;
        expect(actual, `${payload.type} / ${JSON.stringify(given)}`).toBe(expected);
      }
    }
  });
});
