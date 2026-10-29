import { describe, expect, it } from "vitest";

import {
  filterSafe,
  isAnnouncement,
  isProfile,
  isScheduleRow,
  isSubjectCard,
  isTestItem,
} from "@/lib/guards";

describe("isSubjectCard", () => {
  it("пропускает карточку с id и непустым name", () => {
    expect(isSubjectCard({ id: "s1", name: "Гистология" })).toBe(true);
  });

  it("отбрасывает карточку без name и с пустым name", () => {
    expect(isSubjectCard({ id: "s1" })).toBe(false);
    expect(isSubjectCard({ id: "s1", name: "" })).toBe(false);
  });

  it("отбрасывает не-объекты", () => {
    expect(isSubjectCard(null)).toBe(false);
    expect(isSubjectCard("s1")).toBe(false);
    expect(isSubjectCard([{ id: "s1", name: "x" }])).toBe(false);
  });
});

describe("isTestItem", () => {
  it("принимает title и legacy-поле name", () => {
    expect(isTestItem({ id: "t1", title: "Контрольная" })).toBe(true);
    expect(isTestItem({ id: "t1", name: "Контрольная" })).toBe(true);
  });

  it("отбрасывает тест без заголовка", () => {
    expect(isTestItem({ id: "t1" })).toBe(false);
    expect(isTestItem({ id: "t1", title: "" })).toBe(false);
  });
});

describe("isScheduleRow", () => {
  it("принимает запись с id и ISO-датой", () => {
    expect(isScheduleRow({ id: "e1", date: "2026-10-27" })).toBe(true);
    expect(isScheduleRow({ id: "e1", date: "2026-10-27T09:00:00" })).toBe(true);
  });

  it("отбрасывает запись с не-ISO датой или без id", () => {
    expect(isScheduleRow({ id: "e1", date: "27.10.2026" })).toBe(false);
    expect(isScheduleRow({ id: "e1", date: "" })).toBe(false);
    expect(isScheduleRow({ date: "2026-10-27" })).toBe(false);
    expect(isScheduleRow({ id: "e1" })).toBe(false);
  });
});

describe("isProfile", () => {
  it("требует непустой id", () => {
    expect(isProfile({ id: "u1", email: "a@b.c" })).toBe(true);
    expect(isProfile({ id: "" })).toBe(false);
    expect(isProfile({ email: "a@b.c" })).toBe(false);
    expect(isProfile(null)).toBe(false);
  });
});

describe("isAnnouncement", () => {
  it("принимает заголовок, тело или legacy-поле text", () => {
    expect(isAnnouncement({ id: "a1", title: "Заголовок" })).toBe(true);
    expect(isAnnouncement({ id: "a1", body: "Текст" })).toBe(true);
    expect(isAnnouncement({ id: "a1", text: "Текст" })).toBe(true);
  });

  it("отбрасывает объявление без содержимого", () => {
    expect(isAnnouncement({ id: "a1" })).toBe(false);
    expect(isAnnouncement({ id: "a1", title: "" })).toBe(false);
  });
});

describe("filterSafe", () => {
  it("выбрасывает битые строки API, сохраняя валидные", () => {
    const rows = [
      { id: "s1", name: "Гистология" },
      { id: "s2" }, // без name
      null,
      "мусор",
      { id: "s3", name: "Химия" },
    ];

    expect(filterSafe(rows, isSubjectCard)).toEqual([
      { id: "s1", name: "Гистология" },
      { id: "s3", name: "Химия" },
    ]);
  });

  it("не-массив даёт пустой список, а не исключение", () => {
    expect(filterSafe(undefined, isSubjectCard)).toEqual([]);
    expect(filterSafe(null, isSubjectCard)).toEqual([]);
    expect(filterSafe({ items: [] }, isSubjectCard)).toEqual([]);
  });

  it("не мутирует исходный массив", () => {
    const rows = [{ id: "s2" }, { id: "s1", name: "Гистология" }];
    filterSafe(rows, isSubjectCard);
    expect(rows).toHaveLength(2);
  });
});
