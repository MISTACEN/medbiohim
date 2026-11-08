import { describe, expect, it } from "vitest";
import { describeTestParse, parseTestDocument } from "@/lib/tests/parseTestDocument";

/** Текст в том виде, в каком его отдаёт .docx после чтения word/document.xml. */
const SAMPLE = `**Раздел 1. Элементы теории вероятностей.**

1. Любой факт, который может произойти или не произойти в результате опыта со случайным исходом, называют:

@1. элементарным событием

#2. общим решением

#3. частным решением

2. При бросании игральной кости пространство элементарных событий включает число событий, равное:

@1. 6
#2. 1
#3. 2

3. Вероятность достоверного события равна:

@1. 1
#2. 0.5
#3. 0

4. Вопрос без отмеченного правильного варианта:

#1. первый
#2. второй

5. Любой факт, который может произойти или не произойти в результате опыта со случайным исходом, называют:

@1. элементарным событием
#2. общим решением`;

describe("parseTestDocument", () => {
  const parsed = parseTestDocument(SAMPLE, "тест1 Элементы теории вероятностей.docx");

  it("находит все вопросы и варианты", () => {
    expect(parsed.stats.questions).toBe(5);
    expect(parsed.stats.options).toBe(13);
    expect(parsed.questions[0].text).toBe(
      "Любой факт, который может произойти или не произойти в результате опыта со случайным исходом, называют:",
    );
    expect(parsed.questions[0].options).toHaveLength(3);
  });

  it("берёт правильный ответ из маркера @ и не путает его с #", () => {
    expect(parsed.questions[0].answer).toBe("элементарным событием");
    expect(parsed.questions[0].correctIndex).toBe(0);
    expect(parsed.questions[1].answer).toBe("6");
  });

  it("делает заголовок раздела темой вопросов", () => {
    expect(parsed.topic).toBe("Раздел 1. Элементы теории вероятностей.");
    expect(parsed.questions.every((question) => question.topic === parsed.topic)).toBe(true);
  });

  it("помечает вопрос без @ и дубликат, но не ломает остальные", () => {
    expect(parsed.stats.valid).toBe(3);
    expect(parsed.stats.invalid).toBe(2);
    expect(parsed.questions[3].issues).toContain("не отмечен правильный вариант (@)");
    expect(parsed.questions[4].issues.join(" ")).toContain("дубликат вопроса №1");
  });

  it("не считает разметку ошибкой и отдаёт читаемую сводку", () => {
    expect(parsed.issues.filter((issue) => issue.startsWith("Нумерация"))).toHaveLength(0);
    expect(describeTestParse(parsed)).toContain("вопросов: 5");
    expect(parsed.title).toBe("тест1 Элементы теории вероятностей");
  });

  it("предупреждает о пропуске в нумерации и вариантах без вопроса", () => {
    const broken = parseTestDocument(
      [
        "Посторонняя строка до первого вопроса",
        "@1. вариант-сирота",
        "1. Первый вопрос:",
        "@1. верно",
        "#2. неверно",
        "3. Третий вопрос:",
        "@1. верно",
        "#2. неверно",
      ].join("\n"),
      "",
    );
    expect(broken.issues.join(" ")).toContain("после №1 идёт №3");
    expect(broken.issues.join(" ")).toContain("Вариант без вопроса");
    expect(broken.issues.join(" ")).toContain("Строка вне вопроса");
  });

  it("склеивает перенесённый вариант и поддерживает @ без номера", () => {
    const multiline = parseTestDocument(
      ["1. Вопрос с формулой", "@ Формула:", "вторая строка формулы", "# другой вариант", "# третий"].join("\n"),
      "",
    );
    expect(multiline.questions[0].options[0].text).toBe("Формула: вторая строка формулы");
    expect(multiline.questions[0].answer).toBe("Формула: вторая строка формулы");
    expect(multiline.stats.valid).toBe(1);
  });

  it("сообщает, когда вопросов не нашлось", () => {
    const empty = parseTestDocument("Просто текст без разметки", "документ.txt");
    expect(empty.stats.questions).toBe(0);
    expect(empty.issues.join(" ")).toContain("нет вопросов");
    expect(empty.title).toBe("документ");
  });
});
