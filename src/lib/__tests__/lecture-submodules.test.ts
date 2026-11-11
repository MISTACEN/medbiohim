import { describe, expect, it } from "vitest";

import {
  groupBySubmodule,
  resolveLectureSubjectKey,
  submoduleOf,
  submodulesForSubject,
  subjectTitle,
} from "@/lib/lectures/submodules";

const HIST = [
  { id: "hist-01-citologiya-organelly", title: "Цитология", subject_slug: "histology" },
  { id: "hist-07-hryaschevye-kostnye", title: "Хрящ и кость", subject_slug: "histology" },
  { id: "hist-09-nervnaya-tkan", title: "Нервная ткань", subject_slug: "histology" },
  { id: "hist-10-nervnaya-sistema", title: "Нервная система", subject_slug: "histology" },
  { id: "hist-11-kora-mozzhechok-vns", title: "Кора и ВНС", subject_slug: "histology" },
];

describe("подмодули лекций", () => {
  it("раскладывает гистологию по трём блокам программы кафедры", () => {
    const groups = groupBySubmodule("histology", HIST);
    expect(groups.map((group) => group.title)).toEqual([
      "Цитология и эмбриология",
      "Общая гистология: ткани",
      "Частная гистология: органы и системы",
    ]);
    expect(groups[0].lectures.map((l) => l.id)).toEqual(["hist-01-citologiya-organelly"]);
    expect(groups[1].lectures.map((l) => l.id)).toEqual([
      "hist-07-hryaschevye-kostnye",
      "hist-09-nervnaya-tkan",
    ]);
    expect(groups[2].lectures.map((l) => l.id)).toEqual([
      "hist-10-nervnaya-sistema",
      "hist-11-kora-mozzhechok-vns",
    ]);
  });

  it("не теряет лекцию, которой нет в реестре", () => {
    const groups = groupBySubmodule("histology", [
      ...HIST,
      { id: "hist-99-new", title: "Новая лекция", subject_slug: "histology" },
    ]);
    const last = groups[groups.length - 1];
    expect(last.submodule).toBeNull();
    // У гистологии свой раздел для дайджестов и экзаменационных материалов.
    expect(last.title).toBe("Дайджесты недель и подготовка к экзамену");
    expect(last.lectures.map((l) => l.id)).toEqual(["hist-99-new"]);
  });

  it("неизвестный предмет без реестра получает нейтральную группу", () => {
    const groups = groupBySubmodule("astronomy", [
      { id: "a-1" },
      { id: "a-2" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("Занятия");
  });

  it("показывает название предмета вместо slug", () => {
    expect(subjectTitle("histology")).toBe("Гистология, цитология");
    expect(subjectTitle("organic_chemistry")).toBe("Органическая химия");
    expect(subjectTitle("physiology")).toBe("Физиология");
    expect(subjectTitle("unknown_subject")).toBe("Unknown subject");
    expect(subjectTitle(null, "Без модуля")).toBe("Без модуля");
  });

  it("для неизвестного предмета отдаёт один список без потерь", () => {
    const groups = groupBySubmodule("astronomy", [{ id: "a-1", title: "Звёзды" }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("Занятия");
    expect(groups[0].lectures).toHaveLength(1);
  });

  it("определяет ключ предмета по slug и по названию", () => {
    expect(resolveLectureSubjectKey({ subject_slug: "organic_chemistry" })).toBe("organic_chemistry");
    expect(resolveLectureSubjectKey({ subject: "Органическая химия" })).toBe("chemistry");
    expect(resolveLectureSubjectKey({ subject: "Физиология кровообращения" })).toBe("physiology");
    expect(resolveLectureSubjectKey({ subject: "Гистология, цитология" })).toBe("histology");
    expect(resolveLectureSubjectKey({ subject: "Астрономия" })).toBeNull();
  });

  it("находит подмодуль конкретной лекции", () => {
    expect(submoduleOf("histology", "hist-09-nervnaya-tkan")?.id).toBe("obschaya-gistologiya");
    expect(submoduleOf("histology", "hist-11-kora-mozzhechok-vns")?.id).toBe("chastnaya-gistologiya");
    expect(submoduleOf("histology", "hist-99-new")).toBeNull();
  });

  it("физиология и химия тоже разложены, а не свалены в один список", () => {
    expect(submodulesForSubject("physiology").length).toBe(6);
    expect(submodulesForSubject("chemistry").length).toBe(3);
  });
});
