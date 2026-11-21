import { describe, expect, it } from "vitest";

import {
  EM_ATLAS_GROUP,
  atlasCardName,
  atlasStats,
  dedupeAtlasCards,
  difficultyLabel,
  filterAtlasCards,
  flattenAtlasGroups,
  groupAtlasCards,
  guideFacets,
  guideForCard,
  indexGuides,
  preparationKey,
  type PreparationGuide,
} from "@/lib/histologyAtlas";

const card = (overrides: Record<string, unknown> = {}) => {
  const id = String(overrides.id ?? "c1");
  return {
    id,
    plan_topic_title: "Неделя 2 · Эпителии",
    preparation: { name: "Многослойный плоский эпителий" },
    tags: ["эпителий"],
    mode_set: "preparation",
    source_key: `histology/prep-${id}.jpg`,
    ...overrides,
  };
};

describe("atlasCardName", () => {
  it("берёт название препарата, затем заголовок карточки", () => {
    expect(atlasCardName(card())).toBe("Многослойный плоский эпителий");
    expect(atlasCardName({ preparation: { name: "  " }, title: "Резерв" })).toBe("Резерв");
    expect(atlasCardName({})).toBe("Препарат");
  });
});

describe("filterAtlasCards", () => {
  it("в режиме «препараты» не пропускает электронограммы", () => {
    const items = [
      card(),
      card({ id: "c2", mode_set: "electronogram", preparation: { name: "Митохондрии" } }),
      card({ id: "c3", tags: ["электронограмма"], preparation: { name: "Ядро и ядрышко" } }),
    ];
    expect(filterAtlasCards(items, { kind: "preparation" }).map((x) => x.id)).toEqual(["c1"]);
    expect(filterAtlasCards(items, { kind: "electronogram" }).map((x) => x.id)).toEqual(["c2", "c3"]);
    expect(filterAtlasCards(items, { kind: "all" })).toHaveLength(3);
  });

  it("ищет по всем словам запроса в названии, теме и подписях", () => {
    const items = [
      card({ id: "blood", preparation: { name: "Мазок крови", captions: ["нейтрофилы"] } }),
      card({ id: "kidney", plan_topic_title: "Неделя 5 · Мочевая система", preparation: { name: "Почка" } }),
    ];
    expect(filterAtlasCards(items, { query: "кровь мазок" }).map((x) => x.id)).toEqual(["blood"]);
    expect(filterAtlasCards(items, { query: "нейтрофил" }).map((x) => x.id)).toEqual(["blood"]);
    expect(filterAtlasCards(items, { query: "неделя 5" }).map((x) => x.id)).toEqual(["kidney"]);
    expect(filterAtlasCards(items, { query: "почка кровь" })).toHaveLength(0);
  });

  it("фильтрует по занятию", () => {
    const items = [card(), card({ id: "c2", plan_topic_title: "Неделя 3 · Кровь" })];
    expect(filterAtlasCards(items, { lesson: "Неделя 3 · Кровь" }).map((x) => x.id)).toEqual(["c2"]);
  });
});

describe("dedupeAtlasCards", () => {
  it("убирает повтор по id, но сохраняет карточки без id", () => {
    const items = [card(), card(), card({ id: "", preparation: { name: "Почка" }, source_key: "" })];
    expect(dedupeAtlasCards(items)).toHaveLength(2);
  });

  it("сохраняет разные препараты одного занятия", () => {
    const items = [card({ id: "a" }), card({ id: "b", preparation: { name: "Почка" } })];
    expect(dedupeAtlasCards(items)).toHaveLength(2);
  });

  it("убирает дубль по пути к фото", () => {
    const items = [card(), card({ id: "c2", source_key: "histology/prep-c1.jpg" })];
    expect(dedupeAtlasCards(items)).toHaveLength(1);
  });

  it("схлопывает одинаковые электронограммы по названию", () => {
    const items = [
      card({ id: "e1", mode_set: "electronogram", source_key: "", preparation: { name: "Митохондрии" } }),
      card({ id: "e2", mode_set: "electronogram", source_key: "", preparation: { name: "Митохондрии" } }),
    ];
    expect(dedupeAtlasCards(items)).toHaveLength(1);
  });
});

describe("groupAtlasCards", () => {
  it("ставит занятия в порядке недель и сортирует препараты по названию", () => {
    const items = [
      card({ id: "late", plan_topic_title: "Неделя 10 · Нервная система", preparation: { name: "Спинной мозг" } }),
      card({ id: "early-b", plan_topic_title: "Неделя 2 · Эпителии", preparation: { name: "Переходный эпителий" } }),
      card({ id: "early-a", plan_topic_title: "Неделя 2 · Эпителии", preparation: { name: "Мезотелий" } }),
    ];
    const groups = groupAtlasCards(items);
    expect(groups.map((group) => group.lesson)).toEqual([
      "Неделя 2 · Эпителии",
      "Неделя 10 · Нервная система",
    ]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["early-a", "early-b"]);
    expect(flattenAtlasGroups(groups).map((item) => item.id)).toEqual(["early-a", "early-b", "late"]);
  });

  it("в блоке электронограмм соблюдает порядок атласа, а не алфавит", () => {
    const items = [
      card({ id: "nucleus", mode_set: "electronogram", source_key: "em-1", preparation: { name: "Ядро и ядрышко" } }),
      card({ id: "mito", mode_set: "electronogram", source_key: "em-2", preparation: { name: "Митохондрии" } }),
    ];
    const groups = groupAtlasCards(items, { kind: "electronogram" });
    expect(groups).toHaveLength(1);
    expect(groups[0].lesson).toBe(EM_ATLAS_GROUP);
    expect(groups[0].items.map((item) => item.id)).toEqual(["mito", "nucleus"]);
  });

  it("сортировка по названию не смешивает препараты с электронограммами по плану", () => {
    const items = [
      card({ id: "b", preparation: { name: "Бокаловидный экзокриноцит" } }),
      card({ id: "a", preparation: { name: "Аксон" } }),
    ];
    expect(groupAtlasCards(items, { sort: "name-asc" })[0].items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(groupAtlasCards(items, { sort: "name-desc" })[0].items.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("не теряет карточки без темы", () => {
    const groups = groupAtlasCards([card({ id: "x", plan_topic_title: "", plan_module_title: "", tags: [] })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items[0].id).toBe("x");
  });
});

describe("atlasStats", () => {
  it("считает препараты и электронограммы отдельно", () => {
    expect(
      atlasStats([
        card(),
        card({ id: "c2", mode_set: "electronogram" }),
        card({ id: "c3", tags: ["electron"] }),
      ]),
    ).toEqual({ total: 3, preparations: 1, electronograms: 2 });
  });
});

describe("методические карточки препаратов", () => {
  const guides: PreparationGuide[] = [
    {
      key: "cytology-mitosis",
      name: "Митоз",
      organ: "Клетка",
      tissue: "Клеточный уровень",
      difficulty: 1,
      structures: ["mitotic-figures", "chromosomes"],
    },
    {
      key: "ct-blood-smear",
      name: "Мазок крови",
      organ: "Кровь",
      tissue: "Соединительная (жидкая)",
      difficulty: 2,
      structures: ["erythrocytes", "leukocytes"],
    },
  ];
  const index = indexGuides(guides);

  it("нормализует ключ: регистр, ё, пунктуация", () => {
    expect(preparationKey("Мазок крови")).toBe("мазок-крови");
    expect(preparationKey("  Ёж — иглы! ")).toBe("еж-иглы");
    expect(preparationKey("cytology-mitosis")).toBe("cytology-mitosis");
    expect(preparationKey(null)).toBe("");
  });

  it("находит гид по ключу и по названию препарата", () => {
    expect(guideForCard(card({ preparation: { name: "Митоз" } }), index)?.key).toBe("cytology-mitosis");
    expect(guideForCard(card({ preparation: { name: "мазок крови" } }), index)?.key).toBe("ct-blood-smear");
  });

  it("находит гид, если название карточки длиннее названия методички", () => {
    const found = guideForCard(card({ preparation: { name: "Митоз (корешок лука)" } }), index);
    expect(found?.key).toBe("cytology-mitosis");
  });

  it("без индекса методичек не падает и не подменяет карточку", () => {
    expect(guideForCard(card(), null)).toBeNull();
    expect(guideForCard(card(), indexGuides([]))).toBeNull();
  });

  it("фильтрует по диагностической структуре", () => {
    const cards = [
      card({ id: "a", preparation: { name: "Митоз" } }),
      card({ id: "b", preparation: { name: "Мазок крови" } }),
    ];
    const erythrocytes = filterAtlasCards(cards, {
      guides: index,
      filters: { structure: "erythrocytes" },
    });
    expect(erythrocytes.map((item) => item.id)).toEqual(["b"]);
  });

  it("фильтры комбинируются: структура + орган + сложность", () => {
    const cards = [
      card({ id: "a", preparation: { name: "Митоз" } }),
      card({ id: "b", preparation: { name: "Мазок крови" } }),
    ];
    expect(
      filterAtlasCards(cards, {
        guides: index,
        filters: { structure: "leukocytes", organ: "Кровь", difficulty: 2 },
      }).map((item) => item.id),
    ).toEqual(["b"]);
    expect(
      filterAtlasCards(cards, {
        guides: index,
        filters: { structure: "leukocytes", difficulty: 1 },
      }),
    ).toEqual([]);
  });

  it("при активном фильтре карточки без методички не показываются", () => {
    const cards = [card({ id: "a", preparation: { name: "Неизвестный препарат" } })];
    expect(filterAtlasCards(cards, { guides: index, filters: { structure: "erythrocytes" } })).toEqual([]);
    expect(filterAtlasCards(cards, { guides: index, filters: {} })).toHaveLength(1);
  });

  it("собирает параметры фильтров и подписи сложности", () => {
    const facets = guideFacets(guides);
    expect(facets.organs).toEqual(["Клетка", "Кровь"]);
    expect(facets.difficulties).toEqual([1, 2]);
    expect(difficultyLabel(1)).toBe("Начальный");
    expect(difficultyLabel(3)).toBe("Продвинутый");
    expect(difficultyLabel(null)).toBe("Без уровня");
  });
});
