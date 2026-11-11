import { describe, expect, it } from "vitest";
import { selectTopicTests } from "@/lib/topic-tests";

const ARENES = { id: "t-arenes", title: "Оргхимия: 3.3. Моноядерные арены", topic_id: "topic-arenes" };
const HALOGENS = { id: "t-halogens", title: "Оргхимия: 3.4. Галогенуглеводороды", topic_id: "topic-halogens" };
const ALCOHOLS = { id: "t-alcohols", title: "Оргхимия: 3.5. Спирты. Фенолы. Простые эфиры", topic_id: "topic-alcohols" };
const GENERAL = { id: "t-general", title: "Тема 3. Строение и химические свойства основных классов", topic_id: "topic-general" };

const TESTS = [GENERAL, ARENES, HALOGENS, ALCOHOLS];

describe("selectTopicTests", () => {
  it("берёт тест, подписанный в плане кафедры, и игнорирует остальные", () => {
    const picked = selectTopicTests({ tests: TESTS, explicitTestIds: ["t-alcohols"] });
    expect(picked.map((t) => t.id)).toEqual(["t-alcohols"]);
  });

  it("не подмешивает общий тест курса к занятию", () => {
    const picked = selectTopicTests({
      tests: TESTS,
      explicitTestIds: ["t-alcohols"],
      practiceTitle: "Гидроксисоединения. Общая характеристика. Спирты. Фенолы. Простые эфиры.",
    });
    expect(picked.map((t) => t.id)).toEqual(["t-alcohols"]);
    expect(picked.some((t) => t.id === "t-general")).toBe(false);
  });

  it("использует связь по теме в БД, если в плане теста нет", () => {
    const picked = selectTopicTests({ tests: TESTS, topicId: "topic-halogens" });
    expect(picked.map((t) => t.id)).toEqual(["t-halogens"]);
  });

  it("падает на карту классов, когда явных id нет", () => {
    const picked = selectTopicTests({ tests: TESTS, practiceTitle: "Арены. Строение бензола. Ароматичность." });
    expect(picked.map((t) => t.id)).toEqual(["t-arenes"]);
  });

  it("не угадывает тест по словам: без явной связи результата нет", () => {
    const picked = selectTopicTests({
      tests: TESTS,
      practiceTitle: "Химическая связь в органических соединениях. Электронные эффекты заместителей.",
    });
    expect(picked).toEqual([]);
  });

  it("не роняет страницу, если id из плана нет в выдаче", () => {
    const picked = selectTopicTests({ tests: TESTS, explicitTestIds: ["missing", null, ""], topicId: "topic-arenes" });
    expect(picked.map((t) => t.id)).toEqual(["t-arenes"]);
  });
});
