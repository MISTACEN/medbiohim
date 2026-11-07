import { describe, expect, it } from "vitest";
import { SUBJECT_CATEGORY_FALLBACK, subjectCategory } from "@/lib/subjectCategories";

describe("subjectCategory", () => {
  it("относит химию и биологию к естественно-научным", () => {
    expect(subjectCategory("Неорганическая химия")).toBe("Естественно-научные");
    expect(subjectCategory("Общая биохимия")).toBe("Естественно-научные");
    expect(subjectCategory("Микробиология, вирусология")).toBe("Естественно-научные");
    expect(subjectCategory("Гистология, цитология")).toBe("Естественно-научные");
  });

  it("не путает физкультуру с физикой", () => {
    expect(subjectCategory("Элективные курсы по физической культуре и спорту")).toBe("Элективы");
    expect(subjectCategory("Физическая культура и спорт")).toBe("Элективы");
    expect(subjectCategory("Оптика, атомная физика")).toBe("Естественно-научные");
  });

  it("выделяет математику и IT", () => {
    expect(subjectCategory("Информатика, медицинская информатика")).toBe("Математика и IT");
    expect(subjectCategory("Математический анализ")).toBe("Математика и IT");
    expect(subjectCategory("Теория вероятности и математическая статистика")).toBe("Математика и IT");
  });

  it("выделяет клинические дисциплины", () => {
    expect(subjectCategory("Пропедевтика внутренних болезней")).toBe("Клинические навыки");
    expect(subjectCategory("Клиническая лабораторная диагностика")).toBe("Клинические навыки");
    expect(subjectCategory("Первая медицинская помощь")).toBe("Клинические навыки");
  });

  it("выделяет гуманитарные дисциплины", () => {
    expect(subjectCategory("История России")).toBe("Гуманитарные");
    expect(subjectCategory("Латинский язык")).toBe("Гуманитарные");
    expect(subjectCategory("Медицинское право")).toBe("Гуманитарные");
  });

  it("относит практики и дисциплины по выбору к элективам", () => {
    expect(subjectCategory("Производственная практика, клиническая практика, лаборантская, 5 з.е.")).toBe("Элективы");
    expect(subjectCategory("Б1.В.ДВ.03 МБХ (Не выбрана из набора)")).toBe("Элективы");
  });

  it("возвращает безопасный fallback без названия", () => {
    expect(subjectCategory(null, null)).toBe(SUBJECT_CATEGORY_FALLBACK);
    expect(subjectCategory("Безопасность жизнедеятельности")).toBe(SUBJECT_CATEGORY_FALLBACK);
  });
});
