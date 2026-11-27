import { describe, expect, it } from "vitest";

import {
  buildElectronogramQuestion,
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
  it("«определи препарат»: варианты с позиционными id, ключ только на сервере", () => {
    const built = build("identify")!;
    const part = built.question.parts[0];
    expect(part.kind).toBe("single");
    // В фикстуре всего три препарата — вариантов столько, сколько есть.
    expect(part.options.length).toBeGreaterThanOrEqual(3);
    expect(part.options.length).toBeLessThanOrEqual(4);
    // id — только позиция после перемешивания: по разметке нельзя понять,
    // какой вариант верный (раньше id был ключом методички).
    expect(part.options.map((option) => option.id)).toEqual(
      part.options.map((_, index) => `a${index + 1}`),
    );
    expect(part.options.map((option) => option.label)).toContain("Митоз");
    const correct = built.answers.parts.preparation.correct;
    expect(correct).toHaveLength(1);
    expect(part.options.find((option) => option.id === correct[0])?.label).toBe("Митоз");
    // Вопрос для клиента не содержит правильного ответа.
    expect(JSON.stringify(built.question)).not.toContain("correct");
  });

  it("«найди структуры»: все структуры препарата плюс отвлекающие", () => {
    const built = build("structures")!;
    const part = built.question.parts[0];
    expect(part.kind).toBe("multi");
    expect(part.options.map((option) => option.label)).toEqual(
      expect.arrayContaining(["Хромосомы", "Веретено деления"]),
    );
    expect(part.options.length).toBeGreaterThan(2);
    const correctLabels = built.answers.parts.structures.correct.map(
      (id) => part.options.find((option) => option.id === id)?.label,
    );
    expect(correctLabels).toEqual(expect.arrayContaining(["Хромосомы", "Веретено деления"]));
    // Ключ ссылается на позиционные id, а не на слаги структур.
    expect(built.answers.parts.structures.correct).not.toContain("chromosomes");
  });

  it("«отличи похожие»: ровно два варианта и ссылка на дифференциал", () => {
    const built = build("differential")!;
    const part = built.question.parts[0];
    expect(part.options).toHaveLength(2);
    expect(part.options.map((option) => option.label)).toContain("Митоз");
    expect(part.options.map((option) => option.label)).not.toEqual(["Митоз", "Митоз"]);
    const correct = built.answers.parts.preparation.correct;
    expect(part.options.find((option) => option.id === correct[0])?.label).toBe("Митоз");
    expect(built.answers.parts.preparation.explanation).toContain("амитоз");
  });

  it("«схема»: сначала сверка утверждений с источником, затем вывод препарата", () => {
    const built = build("schema")!;
    expect(built.question.parts.map((part) => part.id)).toEqual(["statements", "preparation"]);

    const statements = built.question.parts[0];
    expect(statements.kind).toBe("multi");

    // Верные утверждения — из методички препарата, остальные — чужие признаки.
    const chosen = built.answers.parts.statements.correct.map(
      (id) => statements.options.find((option) => option.id === id)?.label,
    );
    expect(chosen).toEqual(["хромосомы", "веретено деления"]);
    expect(statements.options.length).toBe(4);
    // Ни «f», ни «x» в id: иначе правильные утверждения видны без чтения.
    expect(statements.options.every((option) => /^a\d+$/.test(option.id))).toBe(true);
    expect(built.answers.parts.preparation.correct).toHaveLength(1);
    expect(JSON.stringify(built.question)).not.toContain("correct");
  });

  it("обманки-утверждения — связные фразы, а не обрубки в одно слово", () => {
    const noisy = guide({
      key: "ct-noise",
      name: "Шумный препарат",
      section: "3. Соединительная ткань",
      features: ["Хвост", "Наружная капсула", "капсула лимфатического узла с трабекулами"],
      structures: [],
    });
    const built = buildQuestion({
      guide: guides[0],
      guides: [guides[0], noisy],
      cards,
      mode: "complex",
      structureTitles,
      random: () => 0.42,
    })!;
    const statements = built.question.parts.find((part) => part.id === "statements")!;
    const labels = statements.options.map((option) => option.label);
    expect(labels).not.toContain("Хвост");
    expect(labels).not.toContain("Наружная капсула");
    expect(labels).toContain("капсула лимфатического узла с трабекулами");
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

describe("электронограммы", () => {
  const emCards = ["Апоптоз", "Митохондрии", "Ресничка", "Сперматозоид"].map((name, index) => ({
    id: `em-card-${index}`,
    mode_set: "electronogram",
    preparation: { name, imagePath: `em/${index}.jpg` },
  }));

  it("варианты закрыты позиционными id, ключ — по названию структуры", () => {
    const built = buildElectronogramQuestion(emCards as never, () => 0.3)!;
    const part = built.question.parts[0];
    expect(part.options).toHaveLength(4);
    expect(part.options.map((option) => option.id)).toEqual(["a1", "a2", "a3", "a4"]);

    const correct = built.answers.parts.preparation.correct;
    expect(correct).toHaveLength(1);
    const label = part.options.find((option) => option.id === correct[0])?.label;
    expect(["Апоптоз", "Митохондрии", "Ресничка", "Сперматозоид"]).toContain(label);

    // guide_key по-прежнему отличает ЭМ от методичек, но в вариантах его нет.
    expect(built.guideKey).toBe(`em:${built.question.image_card_id}`);
    expect(part.options.map((option) => option.id)).not.toContain(built.question.image_card_id);
  });
});
