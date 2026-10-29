import { describe, expect, it } from "vitest";

import { csvFilename, toCsv } from "@/lib/chemistry/export";

describe("CSV-экспорт", () => {
  const columns = [
    { key: "topic", label: "Тема" },
    { key: "answer", label: "Ответ" },
    { key: "note", label: "Примечание" },
  ];

  it("начинается с BOM и использует CRLF для Excel", () => {
    const csv = toCsv([{ topic: "pH", answer: 7, note: "" }], columns);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Тема,Ответ,Примечание");
    expect(csv).toContain("\r\n");
  });

  it("экранирует кавычки, запятые и переводы строк", () => {
    const csv = toCsv(
      [{ topic: 'кислота, "сильная"', answer: 1.5, note: "первая строка\nвторая" }],
      columns,
    );
    expect(csv).toContain('"кислота, ""сильная"""');
    expect(csv).toContain('"первая строка\nвторая"');
  });

  it("не оставляет NaN/undefined в тексте", () => {
    const csv = toCsv(
      [{ topic: "тест", answer: 0, note: null }],
      columns,
    );
    expect(csv).not.toMatch(/NaN|undefined|null/);
  });

  it("строит безопасное имя файла с датой", () => {
    expect(csvFilename("medbiohim", "practice/a b", new Date(2026, 9, 29))).toBe(
      "medbiohim-practice-a-b-2026-10-29.csv",
    );
  });
});
