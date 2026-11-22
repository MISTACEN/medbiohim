import { describe, expect, it } from "vitest";

import {
  buildQuestion,
  pickImageCard,
  type GuideRow,
} from "../../../workers/api/src/routes/diagnosticum/model";
import {
  gradeAnswer,
  hintFor,
} from "../../../workers/api/src/routes/diagnosticum/grading";

const guide = (overrides: Partial<GuideRow> = {}): GuideRow => ({
  key: "cytology-mitosis",
  name: "Митоз",
  section: "1. Цитология",
  system: "Клетка",
  organ: "Корешок лука",
  tissue: "Образовательная",
  low_magnification: "найди зону деления",
  high_magnification: "хромосомы в метафазе",
  steps: ["Найди кончик корешка.", "Перейди на большое увеличение."],
  features: ["хромосомы", "веретено деления"],
  differential: ["от амитоза — нет веретена"],
  structures: ["chromosomes", "spindle"],
  ...overrides,
});

const cards = [
  { id: "card-mitosis", preparation: { name: "Митоз (корешок лука)", imagePath: "histology/mitosis.jpg" } },
  { id: "card-smear", preparation: { name: "Мазок крови", imagePath: "histology/smear.jpg" } },
  { id: "card-no-image", preparation: { name: "Тимус" } },
];

const guides: GuideRow[] = [
  guide(),
  guide({
    key: "ct-blood-smear",
    name: "Мазок крови",
    section: "3. Соединительная ткань",
    system: "Кровь",
    features: ["эритроциты без ядра", "лейкоциты с ядром"],
    structures: ["erythrocytes", "leukocytes"],
  }),
  guide({
    key: "ct-hyaline-cartilage",
    name: "Гиалиновый хрящ",
    section: "3. Соединительная ткань",
    system: "Опорно-двигательная",
    features: ["хондроциты в лакунах"],
    structures: ["chondrocytes", "matrix"],
  }),
];

const structureTitles = {
  chromosomes: "Хромосомы",
  spindle: "Веретено деления",
  erythrocytes: "Эритроциты",
  leukocytes: "Лейкоциты",
  chondrocytes: "Хондроциты",
  matrix: "Межклеточное вещество",
};

const build = (mode: "identify" | "structures" | "differential" | "complex" | "schema") =>
  buildQuestion({ guide: guides[0], guides, cards, mode, structureTitles, random: () => 0.42 });

describe("подбор изображения", () => {
  it("находит карточку по вхождению названия и пропускает карточки без картинки", () => {
    expect(pickImageCard(guides[0], cards)?.id).toBe("card-mitosis");
    expect(pickImageCard(guide({ name: "Тимус" }), cards)).toBeNull();
  });
});

describe("разбор препарата", () => {
  it("препарат, структуры и утверждения — одно задание и один ответ", () => {
    const built = build("complex")!;
    expect(built.question.parts.map((part) => part.id)).toEqual([
      "preparation",
      "structures",
      "statements",
    ]);
    expect(built.question.parts[0].kind).toBe("single");
    expect(built.question.parts[1].kind).toBe("multi");
    expect(built.question.parts[2].kind).toBe("multi");
    expect(Object.keys(built.answers.parts).sort()).toEqual([
      "preparation",
      "statements",
      "structures",
    ]);

    const perfect = gradeAnswer(built.answers, {
      preparation: built.answers.parts.preparation.correct,
      structures: built.answers.parts.structures.correct,
      statements: built.answers.parts.statements.correct,
    });
    expect(perfect.correct).toBe(true);
    expect(perfect.score).toBe(100);

    // Один неверный блок ломает разбор: частичный диагноз не засчитывается.
    const partial = gradeAnswer(built.answers, {
      preparation: built.answers.parts.preparation.correct,
      structures: built.answers.parts.structures.correct,
      statements: [],
    });
    expect(partial.correct).toBe(false);
    expect(partial.score).toBeLessThan(100);
  });

  it("части, для которых у препарата нет данных, не появляются", () => {
    const thin = guide({ features: ["хромосомы"], structures: [] });
    const built = buildQuestion({
      guide: thin,
      guides: [thin, ...guides.slice(1)],
      cards,
      mode: "complex",
      structureTitles,
      random: () => 0.42,
    })!;
    expect(built.question.parts.map((part) => part.id)).toEqual(["preparation"]);
    expect(Object.keys(built.answers.parts)).toEqual(["preparation"]);
  });
});

describe("buildQuestion", () => {
  it("«определи препарат»: вариант с ответом и отвлекающие, ключ только на сервере", () => {
    const built = build("identify")!;
    const part = built.question.parts[0];
    expect(part.kind).toBe("single");
    // В фикстуре всего три препарата — вариантов столько, сколько есть.
    expect(part.options.length).toBeGreaterThanOrEqual(3);
    expect(part.options.length).toBeLessThanOrEqual(4);
    expect(part.options.map((option) => option.id)).toContain("cytology-mitosis");
    expect(built.answers.parts.preparation.correct).toEqual(["cytology-mitosis"]);
    // Вопрос для клиента не содержит правильного ответа.
    expect(JSON.stringify(built.question)).not.toContain("correct");
  });

  it("«найди структуры»: все структуры препарата плюс отвлекающие", () => {
    const built = build("structures")!;
    const part = built.question.parts[0];
    expect(part.kind).toBe("multi");
    const ids = part.options.map((option) => option.id);
    expect(ids).toEqual(expect.arrayContaining(["chromosomes", "spindle"]));
    expect(ids.length).toBeGreaterThan(2);
    expect(built.answers.parts.structures.correct).toEqual(["chromosomes", "spindle"]);
    expect(part.options.find((option) => option.id === "chromosomes")?.label).toBe("Хромосомы");
  });

  it("«отличи похожие»: ровно два варианта и ссылка на дифференциал", () => {
    const built = build("differential")!;
    const part = built.question.parts[0];
    expect(part.options).toHaveLength(2);
    expect(part.options.map((option) => option.id)).toContain("cytology-mitosis");
    expect(built.answers.parts.preparation.explanation).toContain("амитоз");
  });

  it("«схема»: сначала сверка утверждений с источником, затем вывод препарата", () => {
    const built = build("schema")!;
    expect(built.question.parts.map((part) => part.id)).toEqual(["statements", "preparation"]);

    const statements = built.question.parts[0];
    expect(statements.kind).toBe("multi");
    expect(built.answers.parts.statements.correct).toEqual(["f0", "f1"]);

    // Верные утверждения — из методички препарата, остальные — чужие признаки.
    const chosen = built.answers.parts.statements.correct.map(
      (id) => statements.options.find((option) => option.id === id)?.label,
    );
    expect(chosen).toEqual(["хромосомы", "веретено деления"]);
    expect(statements.options.length).toBe(4);
    expect(built.answers.parts.preparation.correct).toEqual(["cytology-mitosis"]);
    expect(JSON.stringify(built.question)).not.toContain("correct");
  });

  it("«схема» без признаков в источнике не строится", () => {
    const built = buildQuestion({
      guide: guide({ features: [] }),
      guides,
      cards,
      mode: "schema",
      random: () => 0.3,
    });
    expect(built).toBeNull();
  });

  it("«комплексный» — препарат, структуры и утверждения одним заданием", () => {
    const built = build("complex")!;
    expect(built.question.parts.map((part) => part.id)).toEqual([
      "preparation",
      "structures",
      "statements",
    ]);
  });

  it("без карточки с изображением задание не строится", () => {
    const built = buildQuestion({
      guide: guide({ name: "Несуществующий препарат" }),
      guides,
      cards,
      mode: "identify",
      random: () => 0.1,
    });
    expect(built).toBeNull();
  });
});

describe("gradeAnswer", () => {
  const key = {
    parts: {
      preparation: { correct: ["cytology-mitosis"], explanation: "хромосомы" },
      structures: { correct: ["chromosomes", "spindle"], explanation: "веретено" },
    },
  };

  it("точное совпадение — верно и 100 баллов", () => {
    const result = gradeAnswer(key, {
      preparation: ["cytology-mitosis"],
      structures: ["spindle", "chromosomes"],
    });
    expect(result.correct).toBe(true);
    expect(result.score).toBe(100);
  });

  it("недобор и лишние варианты показываются в разборе", () => {
    const result = gradeAnswer(key, {
      preparation: ["cytology-mitosis"],
      structures: ["chromosomes", "erythrocytes"],
    });
    expect(result.correct).toBe(false);
    expect(result.score).toBe(50);
    const structures = result.parts.find((part) => part.part_id === "structures")!;
    expect(structures.missing).toEqual(["spindle"]);
    expect(structures.extra).toEqual(["erythrocytes"]);
  });

  it("подсказки снижают балл, но не ниже нуля", () => {
    const full = { preparation: ["cytology-mitosis"], structures: ["chromosomes", "spindle"] };
    expect(gradeAnswer(key, full, 1).score).toBe(90);
    expect(gradeAnswer(key, full, 4).score).toBe(60);
    expect(gradeAnswer(key, {}, 4).score).toBe(0);
  });
});

describe("hintFor", () => {
  it("четыре уровня раскрываются по порядку и не называют ответ", () => {
    expect(hintFor(guides[0], 1)).toContain("Клетка");
    expect(hintFor(guides[0], 2, structureTitles)).toContain("Хромосомы");
    expect(hintFor(guides[0], 3)).toContain("зону деления");
    expect(hintFor(guides[0], 4)).toContain("кончик корешка");
    expect(hintFor(guides[0], 5)).toBeNull();
    for (const level of [1, 2, 3]) {
      expect(hintFor(guides[0], level, structureTitles)).not.toContain("«Митоз»");
    }
  });

  it("пустые поля дают null, а не пустую строку", () => {
    const empty = guide({
      system: "",
      section: "",
      structures: [],
      low_magnification: "",
      steps: [],
      high_magnification: "",
    });
    expect(hintFor(empty, 1)).toBeNull();
    expect(hintFor(empty, 2)).toBeNull();
    expect(hintFor(empty, 3)).toBeNull();
    expect(hintFor(empty, 4)).toBeNull();
  });
});
