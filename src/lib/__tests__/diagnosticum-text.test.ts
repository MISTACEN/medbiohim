import { afterEach, describe, expect, it, vi } from "vitest";

import { compareAnswer, normalizeAnswer, wordOverlap } from "../../../workers/api/src/routes/diagnosticum/grading-text";
import { judgeTextAnswers } from "../../../workers/api/src/routes/diagnosticum/text-answers";
import { gradeAnswer } from "../../../workers/api/src/routes/diagnosticum/grading";
import type { AnswerKey, Question } from "../../../workers/api/src/routes/diagnosticum/types";

const question: Question = {
  prompt: "Экзамен: определи препарат по изображению.",
  image_card_id: "card-1",
  parts: [
    {
      id: "preparation",
      kind: "single",
      title: "Что это за препарат?",
      options: [
        { id: "a1", label: "Митоз" },
        { id: "a2", label: "Мазок крови" },
      ],
    },
  ],
};

const answers: AnswerKey = {
  parts: { preparation: { correct: ["a1"], explanation: "хромосомы" } },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("нормализация свободного ответа", () => {
  it("регистр, ё, пунктуация и пробелы не важны", () => {
    expect(normalizeAnswer("  Гиалиновый  ХРЯЩ! ")).toBe("гиалиновый хрящ");
    expect(normalizeAnswer("Лёгкое")).toBe("легкое");
    expect(normalizeAnswer("Митоз (корешок лука)")).toBe("митоз корешок лука");
  });

  it("общие слова считаются независимо от порядка", () => {
    expect(wordOverlap("хрящ гиалиновый", "гиалиновый хрящ")).toBe(1);
    expect(wordOverlap("сухожилие", "гиалиновый хрящ")).toBe(0);
  });
});

describe("compareAnswer", () => {
  it("точное совпадение зачитывается с уверенностью 1", () => {
    const grade = compareAnswer("митоз", ["Митоз"]);
    expect(grade).toMatchObject({ verdict: "correct", source: "exact", confidence: 1 });
  });

  it("вхождение названия зачитывается — «Митоз (корешок лука)» и «митоз»", () => {
    expect(compareAnswer("митоз", ["Митоз (корешок лука)"]).verdict).toBe("correct");
    expect(compareAnswer("корешок лука митоз", ["Митоз"]).verdict).toBe("correct");
  });

  it("перестановка слов — тот же объект", () => {
    expect(compareAnswer("хрящ гиалиновый", ["Гиалиновый хрящ"]).verdict).toBe("correct");
  });

  it("другой препарат не зачитывается правилами", () => {
    const grade = compareAnswer("сухожилие", ["Гиалиновый хрящ"]);
    expect(grade.verdict).toBe("incorrect");
    expect(grade.source).toBe("none");
  });

  it("пустой ответ — не верный и без обращения к ИИ", () => {
    expect(compareAnswer("   ", ["Митоз"]).verdict).toBe("incorrect");
  });
});

describe("judgeTextAnswers", () => {
  it("без ключа ИИ проверяет правилами и отдаёт эталон в разбор", async () => {
    const result = await judgeTextAnswers({
      question,
      answers,
      submittedText: { preparation: "МИТОЗ." },
      env: {},
    });
    expect(result.verdicts).toEqual({ preparation: true });
    expect(result.outcomes.preparation).toMatchObject({
      verdict: "correct",
      source: "exact",
      target: "Митоз",
      input: "МИТОЗ.",
    });
  });

  it("неверная формулировка остаётся неверной и не выдаёт балл", async () => {
    const result = await judgeTextAnswers({
      question,
      answers,
      submittedText: { preparation: "мазок крови" },
      env: {},
    });
    expect(result.verdicts).toEqual({ preparation: false });
    expect(result.outcomes.preparation.verdict).toBe("incorrect");
  });

  it("ИИ подключается только когда правила не совпали, и один раз", async () => {
    const run = vi.fn(async () => ({
      response: '{"verdict":"correct","confidence":0.9,"reason":"тот же объект"}',
    }));

    const result = await judgeTextAnswers({
      question,
      answers,
      submittedText: { preparation: "деление клетки с хромосомами" },
      env: { AI: { run } },
    });
    expect(result.verdicts).toEqual({ preparation: true });
    expect(result.outcomes.preparation.source).toBe("ai");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("точное совпадение не тратит вызов ИИ", async () => {
    const run = vi.fn();
    await judgeTextAnswers({
      question,
      answers,
      submittedText: { preparation: "митоз" },
      env: { AI: { run } },
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("понимает односложный ответ маленькой модели: «ДА»", async () => {
    const run = vi.fn(async () => ({ response: "ДА" }));
    const result = await judgeTextAnswers({
      question,
      answers,
      submittedText: { preparation: "деление с хромосомами" },
      env: { AI: { run } },
    });
    expect(result.verdicts).toEqual({ preparation: true });
    expect(result.outcomes.preparation.source).toBe("ai");
  });

  it("понимает «НЕТ» и не зачитывает чужой объект", async () => {
    const run = vi.fn(async () => ({ response: "НЕТ" }));
    const result = await judgeTextAnswers({
      question,
      answers,
      submittedText: { preparation: "сухожилие" },
      env: { AI: { run } },
    });
    expect(result.verdicts).toEqual({ preparation: false });
    expect(result.outcomes.preparation.source).toBe("ai");
  });
});

describe("gradeAnswer с текстовыми вердиктами", () => {
  it("зачитывает часть, отвеченную словами", () => {
    const result = gradeAnswer(answers, {}, 0, { preparation: true });
    expect(result.correct).toBe(true);
    expect(result.score).toBe(100);
  });

  it("неверный свободный ответ даёт 0 и не ломает разбор", () => {
    const result = gradeAnswer(answers, {}, 0, { preparation: false });
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
    expect(result.parts[0].explanation).toBe("хромосомы");
  });

  it("подсказки снижают балл и для свободного ответа", () => {
    expect(gradeAnswer(answers, {}, 2, { preparation: true }).score).toBe(80);
  });
});
