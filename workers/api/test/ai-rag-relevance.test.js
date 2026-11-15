import test from "node:test";
import assert from "node:assert/strict";

import {
  MIN_RELEVANCE,
  queryStems,
  selectLectureExcerpts,
  stemRu,
} from "../src/lib/lecture-rag.ts";

// Корпус повторяет реальную проблему: лекции огромные, слово «механизм» есть
// почти в каждой, а нужная лекция называет гемолиз в именительном падеже.
const physiology = [
  {
    id: "blood-cells",
    title: "Физиология форменных элементов крови",
    body: "Эритроциты: строение и функции. Гемолиз — разрушение эритроцитов. "
      + "Осмотический гемолиз, механическая и биологическая формы гемолиза. "
      + "Гемолитическая стойкость эритроцитов.",
  },
  {
    id: "blood-chemistry",
    title: "Физико-химические свойства крови, состав и функции крови",
    body: "Осмотическое давление плазмы. Гемолиз при гипотонии. Гематокрит, вязкость крови.",
  },
  {
    id: "muscle",
    title: "Физиология мышечного сокращения. Механизмы сокращения скелетных мышц",
    body: "Механизмы сокращения мышц. Механизм электромеханического сопряжения. "
      + "Потенциал действия мышечного волокна. Механизм расслабления.",
  },
  {
    id: "reflex",
    title: "Рефлекс как элементарный акт нервной регуляции. Механизмы координации рефлекторной деятельности",
    body: "Механизмы координации рефлексов. Рефлекторная дуга. Механизм торможения в ЦНС.",
  },
  {
    id: "potentials",
    title: "Физиология клетки. Механизмы формирования потенциала покоя и потенциала действия",
    body: "Потенциал действия формируется при деполяризации мембраны. Ионные механизмы.",
  },
];

test("основа слова находит падежные формы", () => {
  assert.equal(stemRu("гемолиза"), "гемолиз");
  assert.equal(stemRu("эритроцитов"), "эритроцит");
  assert.equal(stemRu("сокращения"), "сокращ");
  assert.equal(stemRu("набухают"), "набух");
  // «Механизм» — рамка вопроса, а не тема: в основы запроса он не попадает.
  assert.deepEqual(queryStems("Объясни механизм гемолиза эритроцитов").sort(), ["гемолиз", "эритроцит"]);
});

test("на вопрос о гемолизе в источники не попадают мышцы и рефлекс", () => {
  const picked = selectLectureExcerpts(physiology, "Объясни механизм гемолиза эритроцитов");
  const ids = picked.map((entry) => entry.id);
  assert.ok(ids.includes("blood-cells"), `ожидалась лекция о форменных элементах, получено: ${ids.join(", ")}`);
  assert.ok(!ids.includes("muscle"), "мышечное сокращение — не источник ответа о гемолизе");
  assert.ok(!ids.includes("reflex"), "рефлекс — не источник ответа о гемолизе");
  for (const entry of picked) {
    assert.ok(entry.relevance >= MIN_RELEVANCE, `слишком слабая релевантность ${entry.relevance} у ${entry.id}`);
  }
});

test("совпадение в названии темы идёт первым", () => {
  const picked = selectLectureExcerpts(physiology, "Что такое потенциал действия и как он формируется?");
  assert.equal(picked[0]?.id, "potentials");
  assert.ok(picked[0].titleMatches > 0);
});

test("общие слова курса не делают лекцию источником", () => {
  // «Механизм» есть и в мышцах, и в рефлексе — но без темы вопроса этого мало.
  const picked = selectLectureExcerpts(physiology, "Объясни механизм гемолиза");
  assert.ok(!picked.some((entry) => entry.id === "muscle"));
  const onlyGeneric = selectLectureExcerpts(physiology, "Объясни механизм этого процесса");
  assert.deepEqual(onlyGeneric, [], "вопрос без темы не должен давать источники");
});

test("вопрос не по корпусу не даёт источников", () => {
  assert.deepEqual(selectLectureExcerpts(physiology, "Как настроить принтер в Windows?"), []);
  assert.deepEqual(selectLectureExcerpts(physiology, "объясни пожалуйста"), []);
  assert.deepEqual(selectLectureExcerpts([], "гемолиз эритроцитов"), []);
});

test("не больше пяти источников и только сильные хвосты", () => {
  const many = Array.from({ length: 12 }, (_, index) => ({
    id: `lecture-${index}`,
    title: `Лекция ${index} о гемолизе эритроцитов`,
    body: `Гемолиз эритроцитов, вариант ${index}. `.repeat(index + 1),
  }));
  const picked = selectLectureExcerpts(physiology.concat(many), "механизм гемолиза эритроцитов");
  assert.ok(picked.length <= 5);
  const top = Math.max(...picked.map((entry) => entry.score));
  for (const entry of picked) assert.ok(entry.score >= top * 0.6 - 1e-9);
});

test("короткая основа не цепляет другие слова", () => {
  const corpus = [
    { id: "marrow", title: "Кроветворение. Красный костный мозг", body: "Миелопоэз и лимфопоэз, стволовые клетки кроветворения." },
    { id: "blood", title: "Соединительные ткани: кровь", body: "Кровь состоит из плазмы и форменных элементов." },
  ];
  const picked = selectLectureExcerpts(corpus, "Что такое кровь и плазма?");
  assert.equal(picked[0]?.id, "blood");
});

test("случайное упоминание в огромной лекции не делает её источником", () => {
  // Лекция в 40 000 знаков упоминает «гемолиз» один раз — это не ответ на
  // вопрос о гемолизе, даже если рядом встретилось второе слово запроса.
  const noise = {
    id: "giant-lecture",
    title: "Физиология мышечного сокращения",
    body: ("Саркомер, актин и миозин. Сокращение мышечного волокна. ".repeat(600))
      + " Изредка гемолиз наблюдают при переливании эритроцитов.",
  };
  const picked = selectLectureExcerpts([noise].concat(physiology), "Объясни механизм гемолиза эритроцитов");
  assert.ok(!picked.some((entry) => entry.id === "giant-lecture"), "единичное упоминание — не источник");
  assert.ok(picked.length > 0, "остальные лекции о крови должны остаться");
});

test("лекция с темой в названии важнее частых упоминаний в тексте", () => {
  const titled = {
    id: "titled",
    title: "Гемолиз эритроцитов: виды и механизмы",
    body: "Кратко о гемолизе и эритроцитах.",
  };
  const chatter = {
    id: "chatter",
    title: "Обзор методов лабораторной диагностики",
    body: "Гемолиз эритроцитов. ".repeat(300),
  };
  // Фоновые лекции: без них оба слова запроса есть в каждой лекции корпуса и
  // выглядят «общими» — так бывает только в игрушечном корпусе из двух лекций.
  const other = [
    { id: "muscle", title: "Физиология мышечного сокращения", body: "Саркомер, актин, миозин. Потенциал действия волокна." },
    { id: "digest", title: "Пищеварение в желудке", body: "Желудочный сок, ферменты, моторика кишечника." },
  ];
  const picked = selectLectureExcerpts([chatter, titled].concat(other), "гемолиз эритроцитов");
  assert.equal(picked[0]?.id, "titled", "название темы — приоритет над повторами в тексте");
  assert.deepEqual(picked.map((entry) => entry.id), ["titled"], "лекция без темы в названии не остаётся источником");
});
