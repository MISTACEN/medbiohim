import { describe, expect, it } from "vitest";

import {
  emptyDraft,
  exportDraft,
  importDraft,
  validateDraft,
  type ConstructorDraft,
} from "@/lib/constructors/constructors";

describe("конструкторы", () => {
  it("пустой черновик карточек не валиден", () => {
    const d = emptyDraft("cards");
    expect(validateDraft(d).length).toBeGreaterThan(0);
  });

  it("заполненные карточки валидны, чек-лист с пустым названием — нет", () => {
    const cards = emptyDraft("cards");
    cards.title = "Буферные системы";
    const d = cards.data as Extract<ConstructorDraft["data"], { kind: "cards" }>;
    d.items[0] = { term: "Буфер", definition: "Система, сопротивляющаяся изменению pH" };
    expect(validateDraft(cards)).toEqual([]);

    const cl = emptyDraft("checklist");
    cl.title = "Алгоритм КОС";
    expect(validateDraft(cl).length).toBeGreaterThan(0);
    (cl.data as Extract<ConstructorDraft["data"], { kind: "checklist" }>).items[0] = { text: "Измерить pH" };
    expect(validateDraft(cl)).toEqual([]);
  });

  it("экспорт → импорт возвращает тот же черновик", () => {
    const d = emptyDraft("steps");
    d.title = "Разбор задачи";
    (d.data as Extract<ConstructorDraft["data"], { kind: "steps" }>).items[0] = {
      title: "Записать дано",
      description: "Выписать известные величины",
    };
    const res = importDraft(exportDraft(d));
    expect(res.error).toBeUndefined();
    expect(res.draft?.kind).toBe("steps");
    expect(res.draft?.title).toBe("Разбор задачи");
    expect(res.draft?.data.kind).toBe("steps");
  });

  it("импорт чужого/битого JSON даёт ошибку, а не падает", () => {
    expect(importDraft("{}").error).toBeTruthy();
    expect(importDraft("не json").error).toBeTruthy();
    expect(importDraft(JSON.stringify({ format: "other", draft: {} })).error).toBeTruthy();
  });
});
