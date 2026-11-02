import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ExamModePanel } from "../ExamModePanel";
import { checkSelfWorkAnswer, checkSelfWorkLabels } from "@/lib/histology/openAnswerCheck";
import { computeExamGrade, examGradeLabel } from "@/lib/histology/examGrade";
import type { SelfWorkKeyPoint, SelfWorkTopic } from "@/lib/histology/selfWorkTypes";

/**
 * Inline-фикстура задания 6: 4 варианта, 2 электронограммы, памятка.
 * Тесты не зависят от реального контента T1; слова в anyOf подобраны так,
 * чтобы переживать нормализацию openAnswerCheck.
 *
 * v1.task3 содержит detailKeyPoints (углублённый шаг «на 5»),
 * v2.task3 — без них (фолбэк: углублённый уровень = базовый).
 */
const topic: SelfWorkTopic = {
  lectureId: "hist-test-exam",
  title: "Тестовая тема: режим экзамена",
  openQuestions: [],
  exam: {
    title: "Режим экзамена. Тестовый набор",
    intro: "Тестовое вступление.",
    variants: [
      {
        id: "v1",
        title: "Сперматозоид: осевые органы",
        focus: "Подписываем осевые органы зародыша",
        task1: {
          id: "t1-v1",
          prompt: "Задание 1 варианта 1: назовите осевые органы.",
          keyPoints: [{ id: "k1", label: "Хорда", anyOf: ["хорда"] }],
          model: "Хорда — осевой орган.",
        },
        task3: {
          id: "t3-v1",
          prompt: "Задание 3 варианта 1: расскажите про гаструляцию.",
          keyPoints: [{ id: "k1", label: "Гаструляция", anyOf: ["гаструляция"] }],
          model: "Гаструляция — образование зародышевых листков.",
          detailKeyPoints: [{ id: "d1", label: "Зародышевые листки", anyOf: ["три листка"] }],
          detailModel: "Подробно: эктодерма, мезодерма и энтодерма — три листка.",
        },
      },
      {
        id: "v2",
        title: "Яйцеклетка: осевые органы",
        focus: "Другой акцент варианта",
        task1: {
          id: "t1-v2",
          prompt: "Задание 1 варианта 2: перечислите осевые органы.",
          keyPoints: [{ id: "k1", label: "Хорда", anyOf: ["хорда"] }],
          model: "Хорда — осевой орган.",
        },
        task3: {
          id: "t3-v2",
          prompt: "Задание 3 варианта 2: что такое дробление?",
          keyPoints: [{ id: "k1", label: "Дробление", anyOf: ["бластула"] }],
          model: "Дробление приводит к бластуле.",
        },
      },
      {
        id: "v3",
        title: "Вариант 3",
        focus: "Третий акцент",
        task1: {
          id: "t1-v3",
          prompt: "Задание 1 варианта 3.",
          keyPoints: [{ id: "k1", label: "Хорда", anyOf: ["хорда"] }],
          model: "Эталон.",
        },
        task3: {
          id: "t3-v3",
          prompt: "Задание 3 варианта 3.",
          keyPoints: [{ id: "k1", label: "Гаструляция", anyOf: ["гаструляция"] }],
          model: "Эталон.",
        },
      },
      {
        id: "v4",
        title: "Вариант 4",
        focus: "Четвёртый акцент",
        task1: {
          id: "t1-v4",
          prompt: "Задание 1 варианта 4.",
          keyPoints: [{ id: "k1", label: "Хорда", anyOf: ["хорда"] }],
          model: "Эталон.",
        },
        task3: {
          id: "t3-v4",
          prompt: "Задание 3 варианта 4.",
          keyPoints: [{ id: "k1", label: "Гаструляция", anyOf: ["гаструляция"] }],
          model: "Эталон.",
        },
      },
    ],
    electronograms: [
      {
        id: "ec-sperm",
        imageUrl: "/images/test-sperm.png",
        caption: "Сперматозоид",
        prompt: "Подпишите структуры сперматозоида.",
        labels: [
          { n: 1, label: "Акросома", anyOf: ["акросома"] },
          { n: 2, label: "Хвост", anyOf: ["хвост"] },
        ],
        model: "1 — акросома, 2 — хвост.",
      },
      {
        id: "ec-ovum",
        imageUrl: "/images/test-ovum.png",
        caption: "Яйцеклетка",
        prompt: "Подпишите структуры яйцеклетки.",
        labels: [{ n: 1, label: "Мембрана", anyOf: ["мембрана"] }],
        model: "1 — мембрана.",
      },
    ],
    scale: [
      { grade: 3, when: "Три задания без ошибок", detail: "База самостоятельной." },
      { grade: 4, when: "Плюс описание клетки по памятке", detail: "Открывает «4»." },
      { grade: 5, when: "Плюс максимально подробный ответ", detail: "Открывает «5»." },
    ],
    memo: {
      title: "Памятка описания клетки",
      steps: [
        { title: "Название и окраска", hint: "Укажите название клетки" },
        { title: "Строение", hint: "Опишите строение клетки" },
      ],
      samples: [{ id: "s1", title: "Образец: нейрон", text: "Нейрон — крупная клетка." }],
    },
  },
};

/** Те же пункты памятки, что собирает компонент из шагов (см. memoStepKeyPoints). */
const memoPoints: SelfWorkKeyPoint[] = [
  { id: "memo-step-1", label: "Название и окраска", anyOf: ["название", "окраска", "клетки"] },
  { id: "memo-step-2", label: "Строение", anyOf: ["строение", "клетки"] },
];

const MEMO_ANSWER = "окраска: гематоксилин; строение: мембрана и хвост";
/** Задание 2 требует и определить клетку, и подписать структуры. */
const TASK2_ANSWER = "Сперматозоид. 1 — акросома, 2 — хвост";
const TASK2_LABELS_ONLY = "1 — акросома, 2 — хвост";

function panel(testId: string) {
  return within(screen.getByTestId(testId));
}

function writeAndCheck(testId: string, value: string) {
  const scope = panel(testId);
  fireEvent.change(scope.getByLabelText("Письменный ответ"), { target: { value } });
  fireEvent.click(scope.getByRole("button", { name: "Проверить" }));
}

function checkTask2(value: string) {
  const scope = panel("exam-task2");
  fireEvent.change(scope.getByLabelText("Подписи структур (по номерам)"), { target: { value } });
  fireEvent.click(scope.getByRole("button", { name: "Проверить" }));
}

function checkMemo(value: string) {
  const scope = panel("exam-memo");
  fireEvent.change(scope.getByLabelText("Описание клетки по памятке"), { target: { value } });
  fireEvent.click(scope.getByRole("button", { name: "Проверить описание" }));
}

/** Полная база варианта 1: задания 1, 2 и 3 проверены и зачтены. */
function completeBase() {
  writeAndCheck("exam-task1", "хорда");
  checkTask2(TASK2_ANSWER);
  writeAndCheck("exam-task3", "гаструляция");
}

function gradeBadge(): string {
  return screen.getByTestId("exam-grade-badge").textContent ?? "";
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("ExamModePanel: задание 6 (режим экзамена)", () => {
  it("рендерит 4 варианта, показывает title/focus и меняет задание при выборе", () => {
    render(<ExamModePanel topic={topic} />);

    for (const n of [1, 2, 3, 4]) {
      expect(screen.getByRole("button", { name: `Вариант ${n}` })).toBeTruthy();
    }
    expect(screen.getByText("Сперматозоид: осевые органы")).toBeTruthy();
    expect(screen.getByText(/Подписываем осевые органы зародыша/)).toBeTruthy();
    expect(screen.getByText("Задание 1 варианта 1: назовите осевые органы.")).toBeTruthy();
    expect(screen.getByText("Задание 3 варианта 1: расскажите про гаструляцию.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Вариант 2" }));

    expect(screen.getByText("Задание 1 варианта 2: перечислите осевые органы.")).toBeTruthy();
    expect(screen.getByText("Задание 3 варианта 2: что такое дробление?")).toBeTruthy();
    expect(screen.queryByText("Задание 1 варианта 1: назовите осевые органы.")).toBeNull();
    expect((screen.getByRole("button", { name: "Вариант 2" }) as HTMLButtonElement).getAttribute("aria-pressed")).toBe("true");
  });

  it("задание 2: клетка не названа заранее, нужно определить её и подписать структуры", () => {
    render(<ExamModePanel topic={topic} />);

    const image = screen.getByTestId("exam-task2-image") as HTMLImageElement;
    expect(image.getAttribute("src")).toBe("/images/test-sperm.png");
    expect(image.getAttribute("alt")).toBe("Электронограмма половой клетки");
    // До проверки название клетки скрыто — иначе «определить» теряет смысл.
    expect(panel("exam-task2").queryByText("Сперматозоид")).toBeNull();
    expect(panel("exam-task2").getByText(/определите клетку/i)).toBeTruthy();

    checkTask2("ничего не подписано");
    expect(panel("exam-task2").getByText("0%")).toBeTruthy();
    expect(panel("exam-task2").getByText(/Разбор ошибок/)).toBeTruthy();

    fireEvent.click(panel("exam-task2").getByRole("button", { name: "Повторить" }));
    // Только подписи без названия клетки — задание не зачтено целиком.
    checkTask2(TASK2_LABELS_ONLY);
    expect(panel("exam-task2").getByText(/Определена половая клетка/)).toBeTruthy();
    expect(panel("exam-task2").queryByText("100%")).toBeNull();

    fireEvent.click(panel("exam-task2").getByRole("button", { name: "Повторить" }));
    checkTask2(TASK2_ANSWER);
    expect(panel("exam-task2").getByText("100%")).toBeTruthy();
    expect(panel("exam-task2").getByText("1 — акросома, 2 — хвост.")).toBeTruthy();
    // После проверки название клетки раскрывается.
    expect(panel("exam-task2").getByText("Сперматозоид")).toBeTruthy();

    // Смена электронограммы меняет картинку, подписи и снова скрывает название.
    fireEvent.click(screen.getByRole("button", { name: "Электронограмма 2" }));
    expect((screen.getByTestId("exam-task2-image") as HTMLImageElement).getAttribute("src")).toBe("/images/test-ovum.png");
    expect(panel("exam-task2").queryByText("Яйцеклетка")).toBeNull();
  });

  it("до полной базы показывает, чего не хватает, и не рисует оценку", () => {
    render(<ExamModePanel topic={topic} />);

    expect(panel("exam-grade").getByText(/До итоговой оценки не хватает/)).toBeTruthy();
    expect(panel("exam-grade").getByText(/Задание 1 \(осевые органы\)/)).toBeTruthy();
    expect(screen.queryByTestId("exam-grade-badge")).toBeNull();
    expect(screen.getByText("Шкала оценок")).toBeTruthy();

    writeAndCheck("exam-task1", "хорда");
    expect(panel("exam-grade").queryByText(/Задание 1 \(осевые органы\)/)).toBeNull();
    expect(panel("exam-grade").getByText(/Задание 2 \(электронограмма\)/)).toBeTruthy();
  });

  it("неполная памятка при полной базе — «3» и подсказка до «4»", () => {
    render(<ExamModePanel topic={topic} />);
    completeBase();
    checkMemo("окраска");

    expect(gradeBadge()).toBe("3");
    expect(screen.getByText(/До «4»: четвёртое задание \(описание клетки по памятке\) неполное/)).toBeTruthy();
  });

  it("полная база + памятка без углублённого ответа — «4» (совпадает с computeExamGrade)", () => {
    render(<ExamModePanel topic={topic} />);
    completeBase();
    checkMemo(MEMO_ANSWER);

    const expected = computeExamGrade({
      task1: checkSelfWorkAnswer("хорда", topic.exam.variants[0].task1.keyPoints),
      task2: checkSelfWorkLabels(TASK2_ANSWER, topic.exam.electronograms[0].labels),
      task3: checkSelfWorkAnswer("гаструляция", topic.exam.variants[0].task3.keyPoints),
      memo: checkSelfWorkAnswer(MEMO_ANSWER, memoPoints),
      theoryDetail: null,
    });
    expect(expected.grade).toBe(4);
    expect(gradeBadge()).toBe(examGradeLabel(expected));
    expect(screen.getByText(/Четвёртое задание \(описание клетки по памятке\) выполнено/)).toBeTruthy();

    // Углублённый шаг «на 5» появился после проверки задания 3 и ещё не пройден.
    expect(screen.getByTestId("exam-task3-detail")).toBeTruthy();
    expect(screen.getByText(/До «5»: ответь на последний теоретический вопрос/)).toBeTruthy();
  });

  it("памятка + углублённый ответ на задание 3 — «5» c detailModel", () => {
    render(<ExamModePanel topic={topic} />);
    completeBase();
    checkMemo(MEMO_ANSWER);
    expect(gradeBadge()).toBe("4");

    writeAndCheck("exam-task3-detail", "три листка");

    expect(gradeBadge()).toBe("5");
    expect(screen.getByText(/Теоретический вопрос раскрыт максимально подробно/)).toBeTruthy();
    expect(panel("exam-task3-detail").getByText(/Подробно: эктодерма, мезодерма и энтодерма/)).toBeTruthy();
  });

  it("без detailKeyPoints углублённый шаг не показывается, «5» открывает база", () => {
    render(<ExamModePanel topic={topic} />);
    fireEvent.click(screen.getByRole("button", { name: "Вариант 2" }));

    writeAndCheck("exam-task1", "хорда");
    checkTask2(TASK2_ANSWER);
    writeAndCheck("exam-task3", "бластула");
    checkMemo(MEMO_ANSWER);

    expect(screen.queryByTestId("exam-task3-detail")).toBeNull();
    expect(gradeBadge()).toBe("5");
    expect(screen.getByText(/Теоретический вопрос раскрыт максимально подробно/)).toBeTruthy();
  });

  it("«Пройти заново» сбрасывает ответы и оценку варианта", () => {
    render(<ExamModePanel topic={topic} />);
    completeBase();
    checkMemo(MEMO_ANSWER);
    writeAndCheck("exam-task3-detail", "три листка");
    expect(gradeBadge()).toBe("5");

    fireEvent.click(screen.getByRole("button", { name: "Пройти заново" }));

    expect(screen.queryByTestId("exam-grade-badge")).toBeNull();
    expect(panel("exam-grade").getByText(/До итоговой оценки не хватает/)).toBeTruthy();
    expect((panel("exam-task1").getByLabelText("Письменный ответ") as HTMLTextAreaElement).value).toBe("");
    expect((panel("exam-memo").getByLabelText("Описание клетки по памятке") as HTMLTextAreaElement).value).toBe("");
  });

  it("без контента (нет темы для лекции) рендерится заглушка", () => {
    render(<ExamModePanel lectureId="нет-такой-лекции" />);
    expect(screen.getByText(/Режим экзамена для этой лекции ещё не заполнен/)).toBeTruthy();
  });
});

/**
 * Задание 4 — вопросы открытого типа (в реальной самостоятельной именно они
 * идут после трёх заданий; описания клетки по памятке там нет).
 */
const topicWithOpen: SelfWorkTopic = {
  ...topic,
  openQuestions: [
    {
      id: "q1",
      topic: "Тест",
      prompt: "Вопрос 1: назовите осевой орган.",
      keyPoints: [{ id: "k1", label: "Хорда", anyOf: ["хорда"] }],
      model: "Хорда.",
    },
    {
      id: "q2",
      topic: "Тест",
      prompt: "Вопрос 2: где расположена нервная трубка?",
      keyPoints: [{ id: "k2", label: "Над хордой", anyOf: ["над хордой"] }],
      model: "Нервная трубка — над хордой.",
    },
  ],
  exam: {
    ...topic.exam,
    openType: {
      title: "Задание 4 · Вопросы открытого типа",
      intro: "Ответьте письменно по памяти.",
      questionIds: ["q1", "q2"],
    },
  },
};

function checkOpenQuestion(id: string, value: string) {
  const scope = panel(`open:${id}`);
  fireEvent.change(scope.getByLabelText("Письменный ответ"), { target: { value } });
  fireEvent.click(scope.getByRole("button", { name: "Проверить" }));
}

describe("ExamModePanel: задание 4 (вопросы открытого типа)", () => {
  it("показывает вопросы открытого типа вместо памятки", () => {
    render(<ExamModePanel topic={topicWithOpen} />);

    expect(screen.getByTestId("exam-open")).toBeTruthy();
    expect(screen.queryByTestId("exam-memo")).toBeNull();
    expect(panel("exam-open").getByText("Вопрос 1: назовите осевой орган.")).toBeTruthy();
    expect(panel("exam-open").getByText("Вопрос 2: где расположена нервная трубка?")).toBeTruthy();
  });

  it("база + вопросы открытого типа — «4», затем «5» с углублённым ответом", () => {
    render(<ExamModePanel topic={topicWithOpen} />);
    completeBase();

    expect(gradeBadge()).toBe("3");
    expect(screen.getByText(/До «4»: выполни четвёртое задание — вопросы открытого типа/)).toBeTruthy();

    checkOpenQuestion("q1", "хорда");
    checkOpenQuestion("q2", "нервная трубка над хордой");
    expect(gradeBadge()).toBe("4");
    expect(screen.getByText(/Четвёртое задание \(вопросы открытого типа\) выполнено/)).toBeTruthy();

    writeAndCheck("exam-task3-detail", "три листка");
    expect(gradeBadge()).toBe("5");
  });

  it("неполный ответ на вопрос открытого типа не открывает «4»", () => {
    render(<ExamModePanel topic={topicWithOpen} />);
    completeBase();
    checkOpenQuestion("q1", "хорда");
    checkOpenQuestion("q2", "мимо");

    expect(gradeBadge()).toBe("3");
    expect(screen.getByText(/четвёртое задание \(вопросы открытого типа\) неполное/)).toBeTruthy();
  });

  it("«Пройти заново» очищает ответы задания 4", () => {
    render(<ExamModePanel topic={topicWithOpen} />);
    completeBase();
    checkOpenQuestion("q1", "хорда");
    checkOpenQuestion("q2", "над хордой");
    expect(gradeBadge()).toBe("4");

    fireEvent.click(screen.getByRole("button", { name: "Пройти заново" }));
    expect((panel("open:q1").getByLabelText("Письменный ответ") as HTMLTextAreaElement).value).toBe("");
    // Сброс очищает всю попытку: база и четвёртое задание снова не выполнены.
    expect(screen.queryByTestId("exam-grade-badge")).toBeNull();
    expect(panel("exam-grade").getByText(/До итоговой оценки не хватает/)).toBeTruthy();
  });
});
