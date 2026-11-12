import { describe, expect, it } from "vitest";
import {
  KR_RISK,
  addDays,
  buildAiPrompt,
  buildStudyPlan,
  classify,
  dateInText,
  dayLabel,
  krGrade,
  parseAiPlan,
  parseBrief,
} from "@/lib/study/plan";import type { MyAssignment } from "@/lib/api";

const TODAY = new Date(2026, 10, 12); // чт 12.11.2026
const brief = [
  "Дз на 06.11 — не сдано",
  "ТЕМА: Цитология. Ядро, жизненный цикл клетки.",
  "1. Лекцию учим: § 2 целиком.",
  "2. Написать файлик «1. Цитология» с ядра до конца.",
  "3. Схема ЖЦК — § 4.",
  "4. Сделать рисунки.",
  "5. Распечатать электронограммы в порядке стенда.",
  "",
  "Дз на 13.11 — не сдано",
  "ТЕМА: Нервная ткань. Синапсы и нервные окончания.",
  "1. Учить § 9.6 — синапсы.",
  "2. Учить § 10.3 и § 10.6 — нервные окончания.",
  "3. Рисунок нервно-мышечного синапса с подписями.",
  "4. Электронограмма нервно-мышечного синапса: название и подписи.",
  "",
  "Дз на 20.11 — КР",
  "ТЕМА: Контрольная работа по цитологии и нервной ткани.",
  "1. 17.11 — открытые тесты, все 45 вопросов.",
  "2. 19.11 — § 6, вопросы-ответы.",
  "3. 11 электронограмм: название, подписи, теория.",
  "4. 20 минут, 4 варианта, одна электронограмма.",
].join("\n");

const assignment = (patch: Partial<MyAssignment>): MyAssignment => ({
  id: patch.id ?? "a1",
  subject: patch.subject ?? "Гистология",
  topic: patch.topic ?? "Отработка препаратов",
  due_date: patch.due_date ?? null,
  status: patch.status ?? "pending",
  grade: null,
  note: null,
  source: "manual",
});

describe("parseBrief", () => {
  it("разбирает три блока с темами и датами", () => {
    const blocks = parseBrief(brief, TODAY);
    expect(blocks).toHaveLength(3);
    expect(blocks.map((block) => block.date)).toEqual(["2026-11-06", "2026-11-13", "2026-11-20"]);
    expect(blocks[0].theme).toBe("Цитология. Ядро, жизненный цикл клетки");
    expect(blocks[0].tasks).toHaveLength(5);
    expect(blocks[2].status).toBe("control");
  });

  it("не принимает § 9.6 за 9 июня", () => {
    expect(dateInText("Учить § 9.6 — синапсы", TODAY)).toBeNull();
    expect(dateInText("17.11 — открытые тесты", TODAY)).toBe("2026-11-17");
  });

  it("классифицирует пункты по механизмам", () => {
    expect(classify("Распечатать электронограммы в порядке стенда")).toBe("electronograms");
    expect(classify("17.11 — открытые тесты, все 45 вопросов")).toBe("tests");
    expect(classify("Рисунок нервно-мышечного синапса с подписями")).toBe("drawing");
    expect(classify("Написать файлик «1. Цитология»")).toBe("file");
    expect(classify("Учить § 9.6 — синапсы")).toBe("lecture");
  });
});

describe("buildStudyPlan", () => {
  const plan = buildStudyPlan({ brief, today: TODAY });

  it("ставит открытые тесты и § 6 на явные даты", () => {
    const day17 = plan.days.find((day) => day.date === "2026-11-17");
    const day19 = plan.days.find((day) => day.date === "2026-11-19");
    expect(day17?.items.some((item) => /открытые тесты/i.test(item.text))).toBe(true);
    expect(day19?.items.some((item) => /§\s*6/.test(item.text))).toBe(true);
  });

  it("день КР помечен как контрольная и содержит правила", () => {
    const krDay = plan.days.find((day) => day.date === "2026-11-20");
    expect(krDay?.focus).toBe("Контрольная точка");
    expect(krDay?.items.some((item) => /20 минут/i.test(item.text))).toBe(true);
    expect(krDay?.items.some((item) => /\+0,5/.test(item.text))).toBe(true);
  });

  it("переносит просроченную отработку 06.11 после ближайшего занятия", () => {
    const early = plan.days.find((day) => day.date === "2026-11-12");
    expect(early?.items.some((item) => /Отработка за 06\.11/.test(item.text))).toBe(false);
    const overdue = plan.days.filter((day) => day.items.some((item) => /Отработка за 06\.11/.test(item.text)));
    expect(overdue).toHaveLength(1);
    expect(overdue[0].date >= "2026-11-14").toBe(true);
  });

  it("держит риск преподавателя дословно и первым", () => {
    expect(plan.risks[0]).toBe(KR_RISK);
  });

  it("не оставляет пустых дней и не раздувает день сверх 150 минут", () => {
    for (const day of plan.days) {
      expect(day.items.length).toBeGreaterThan(0);
      expect(day.load).toBeLessThanOrEqual(150);
    }
  });

  it("подмешивает личные отработки, а сданные игнорирует", () => {
    const withAssignments = buildStudyPlan({
      brief,
      today: TODAY,
      assignments: [
        assignment({ id: "retake", topic: "Кровь: мазок", due_date: "2026-11-15", status: "retake_needed" }),
        assignment({ id: "done", topic: "Эпителий", due_date: "2026-11-15", status: "passed" }),
      ],
    });
    const texts = withAssignments.days.flatMap((day) => day.items.map((item) => item.text)).join("\n");
    expect(texts).toContain("Сдать: Кровь: мазок (Гистология)");
    expect(texts).not.toContain("Эпителий");
  });

  it("честно сообщает, если дата КР не распознана", () => {
    const noDate = buildStudyPlan({
      brief: "Дз на 14.11\nТЕМА: Тесты\n1. Учить § 3.\nКР — на следующей неделе.",
      today: TODAY,
    });
    expect(noDate.risks[0]).toMatch(/Дата КР не распознана/);
  });
});

describe("AI-слой не может сдвинуть сроки", () => {
  const plan = buildStudyPlan({ brief, today: TODAY });

  it("промпт содержит все дни плана", () => {
    const prompt = buildAiPrompt(plan);
    for (const day of plan.days) expect(prompt).toContain(day.date);
  });

  it("отбрасывает выдуманные даты и markdown-обёртку", () => {
    const reply = [
      "```json",
      JSON.stringify({
        days: [
          { date: plan.days[0].date, focus: "Разобрать ядро и ЖЦК" },
          { date: "2026-12-31", focus: "Придуманный день" },
        ],
        advice: ["Сначала электронограммы, потом тесты"],
      }),
      "```",
    ].join("\n");
    const patch = parseAiPlan(reply, plan);
    expect(Object.keys(patch.days)).toEqual([plan.days[0].date]);
    expect(patch.advice).toHaveLength(1);
  });

  it("на мусор отвечает пустым патчем", () => {
    expect(parseAiPlan("не могу", plan)).toEqual({ days: {}, advice: [] });
  });
});

describe("даты и оценки", () => {
  it("подписывает сегодня и завтра", () => {
    expect(dayLabel("2026-11-12", "2026-11-12")).toContain("сегодня");
    expect(dayLabel("2026-11-13", "2026-11-12")).toContain("завтра");
    expect(addDays("2026-11-30", 2)).toBe("2026-12-02");
  });

  it("оценки по правилам кафедры", () => {
    expect(krGrade(0)).toBe(5);
    expect(krGrade(1)).toBe(4);
    expect(krGrade(3)).toBe(4);
    expect(krGrade(4)).toBe(3);
    expect(krGrade(6)).toBe(3);
    expect(krGrade(7)).toBe(2);
  });
});
