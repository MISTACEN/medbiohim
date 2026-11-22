import { describe, expect, it } from "vitest";

import { pickBestSubjectRow } from "../../../workers/api/src/routes/subjects-pick";

const row = (overrides: Record<string, unknown>) => ({
  id: "a",
  total_hours: 72,
  specialty_slug: null,
  created_at: "2026-09-15T00:00:00.000Z",
  ...overrides,
});

describe("выбор строки предмета", () => {
  it("берёт строку с большей нагрузкой: семестровые строки без дат не спорят", () => {
    const picked = pickBestSubjectRow([
      row({ id: "sem-1", total_hours: 72, semester: 1 }),
      row({ id: "sem-2", total_hours: 144, semester: 2 }),
    ]);
    expect(picked?.id).toBe("sem-2");
  });

  it("при равных часах выигрывает строка с кафедрой", () => {
    const picked = pickBestSubjectRow([
      row({ id: "plain" }),
      row({ id: "owned", specialty_slug: "mbh" }),
    ]);
    expect(picked?.id).toBe("owned");
  });

  it("полностью равные строки разрешаются стабильно, без 409", () => {
    const rows = [row({ id: "b" }), row({ id: "a" })];
    expect(pickBestSubjectRow(rows)?.id).toBe("a");
    expect(pickBestSubjectRow([...rows].reverse())?.id).toBe("a");
  });

  it("пустой список — это undefined, а не исключение", () => {
    expect(pickBestSubjectRow([])).toBeUndefined();
  });
});
