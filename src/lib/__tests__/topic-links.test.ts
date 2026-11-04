import { describe, expect, it } from "vitest";
import { moduleById, type SubjectAreaKey } from "@/lib/learning/modules";
import {
  isAggregateTopic,
  matchTopicForModule,
  matchTopics,
  normalizeTopicTitle,
  topicTestHref,
  type TopicRef,
} from "@/lib/learning/topicLinks";

const PHYSIOLOGY_TOPICS: TopicRef[] = [
  { id: "t-cell", title: "Физиология клетки. Биоэлектрические явления в живых тканях. Механизмы формирования потенциала покоя и потенциала действия." },
  { id: "t-resp", title: "Внешнее дыхание. Биомеханизм вдоха и выдоха. Методы исследования внешнего дыхания. Транспорт газов кровью." },
  { id: "t-kidney", title: "Физиология выделительной системы" },
  { id: "t-final", title: "Итоговое занятие" },
  { id: "t-final-cell", title: "Итоговое занятие по потенциалу покоя" },
];

const CHEMISTRY_TOPICS: TopicRef[] = [
  { id: "c-acid", title: "1.4 · Кислотность и основность" },
  { id: "c-stereo", title: "1.3 · Энантиомерия и диастереомерия" },
  { id: "c-aggregate", title: "Сводный блок · Теоретические основы органической химии" },
];

const HISTOLOGY_TOPICS: TopicRef[] = [
  { id: "h-cell", title: "Неделя 1 · Лекция 1 · Введение. Клетка и клеточная теория" },
  { id: "h-extra", title: "Вне текущего 3 семестра / дополнительные препараты" },
];

function area(key: SubjectAreaKey) {
  return key;
}

describe("связь модулей с темами", () => {
  it("нормализует названия и распознаёт сводные темы", () => {
    expect(normalizeTopicTitle("1.4 · Кислотность и основность")).toBe("1 4 кислотность и основность");
    expect(isAggregateTopic("Сводный блок · Основные классы")).toBe(true);
    expect(isAggregateTopic("Итоговое занятие")).toBe(true);
    expect(isAggregateTopic("1.4 · Кислотность и основность")).toBe(false);
  });

  it("находит реальную тему потенциала покоя для модели мембранного потенциала", () => {
    const match = matchTopicForModule(moduleById("sim.membrane-potential")!, area("physiology"), PHYSIOLOGY_TOPICS);
    expect(match?.id).toBe("t-cell");
  });

  it("находит тему транспорта газов для модели гемоглобина", () => {
    const match = matchTopicForModule(moduleById("sim.oxygen-hemoglobin")!, area("physiology"), PHYSIOLOGY_TOPICS);
    expect(match?.id).toBe("t-resp");
  });

  it("находит тему выделения для модели осмоса", () => {
    const match = matchTopicForModule(moduleById("sim.osmosis")!, area("physiology"), PHYSIOLOGY_TOPICS);
    expect(match?.id).toBe("t-kidney");
  });

  it("связывает калькулятор растворов с темой кислотности и основности", () => {
    const match = matchTopicForModule(moduleById("chemistry.solutions")!, area("chemistry_organic_physical"), CHEMISTRY_TOPICS);
    expect(match?.id).toBe("c-acid");
  });

  it("связывает редактор структур с темой стереохимии", () => {
    const match = matchTopicForModule(moduleById("chemistry.workbench")!, area("chemistry_organic_physical"), CHEMISTRY_TOPICS);
    expect(match?.id).toBe("c-stereo");
  });

  it("не выбирает сводную или итоговую тему", () => {
    const aggregateOnly: TopicRef[] = [
      { id: "c-aggregate", title: "Сводный блок · Теоретические основы органической химии" },
    ];
    expect(matchTopicForModule(moduleById("chemistry.workbench")!, area("chemistry_organic_physical"), aggregateOnly)).toBeNull();
    const finalOnly: TopicRef[] = [{ id: "t-final-cell", title: "Итоговое занятие по потенциалу покоя" }];
    expect(matchTopicForModule(moduleById("sim.membrane-potential")!, area("physiology"), finalOnly)).toBeNull();
  });

  it("не придумывает связь для чужого предмета или модуля без ключевых слов", () => {
    expect(matchTopicForModule(moduleById("sim.membrane-potential")!, area("pharmacology"), PHYSIOLOGY_TOPICS)).toBeNull();
    expect(matchTopicForModule(moduleById("library.materials")!, area("physiology"), PHYSIOLOGY_TOPICS)).toBeNull();
    expect(matchTopics(moduleById("sim.osmosis")!, area("physiology"), [])).toEqual([]);
  });

  it("отдаёт лучшую тему первой по весу совпадения", () => {
    const topics: TopicRef[] = [
      { id: "weak", title: "Кровь" },
      { id: "strong", title: "Транспорт газов кровью и гемоглобин" },
    ];
    const matches = matchTopics(moduleById("sim.oxygen-hemoglobin")!, area("physiology"), topics);
    expect(matches[0]?.topic.id).toBe("strong");
  });

  it("строит ссылку на вкладку тестов с темой", () => {
    expect(topicTestHref("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222")).toBe(
      "/subjects/11111111-1111-4111-8111-111111111111?tab=tests&topic=22222222-2222-4222-8222-222222222222",
    );
  });

  it("использует темы гистологии для атласа", () => {
    const match = matchTopicForModule(moduleById("atlas.histology")!, area("histology"), HISTOLOGY_TOPICS);
    expect(match?.id).toBe("h-cell");
  });
});
