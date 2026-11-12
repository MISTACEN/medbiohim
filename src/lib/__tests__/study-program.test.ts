import { describe, expect, it } from "vitest";
import {
  HISTOLOGY_PROGRAM,
  KR_RISK,
  buildAiPromptV2,
  buildRoadmap,
  buildStudyPlanV2,
  deadlineInfo,
  krGradeWithBonus,
  orderRoadmap,
  parseAiPlanV2,
  progressOf,
  toIcs,
} from "@/lib/study/program";

const TODAY = new Date(2026, 10, 12); // чт 12.11.2026
const NOW = new Date(2026, 10, 12, 21, 0); // вечер — ёмкость дня меньше
const TODAY_ISO = "2026-11-12";

const input = {
  program: HISTOLOGY_PROGRAM,
  done: {} as Record<string, boolean>,
  today: TODAY,
  now: NOW,
};

describe("сроки", () => {
  it("не путает «завтра» и «просрочено»", () => {
    expect(deadlineInfo("2026-11-13", TODAY_ISO)).toMatchObject({ urgency: "tomorrow" });
    expect(deadlineInfo("2026-11-13", TODAY_ISO).label).toMatch(/завтра · 13\.11/);
    expect(deadlineInfo("2026-11-12", TODAY_ISO)).toMatchObject({ urgency: "today" });
    expect(deadlineInfo("2026-11-12", TODAY_ISO).label).toMatch(/сегодня · 12\.11/);
    expect(deadlineInfo("2026-10-23", TODAY_ISO).urgency).toBe("overdue");
    expect(deadlineInfo(null, TODAY_ISO)).toMatchObject({ urgency: "later", label: "к КР" });
  });
});

describe("ход сдачи отработок", () => {
  it("ставит нервную ткань первой: файл закрывает и 06.11, и 13.11", () => {
    const steps = buildRoadmap({ done: {}, today: TODAY_ISO });
    expect(steps.map((step) => step.id)).toEqual(["nerve", "cyto", "skel", "kr"]);
    expect(steps[0].deadline).toBe("2026-11-13");
    expect(steps[0].pending).toHaveLength(9); // 4 задачи 06.11 + 5 задач 13.11
    expect(steps[0].pending.some((task) => /один общий на два занятия/.test(task.hint ?? ""))).toBe(true);
  });

  it("скелетные ткани честно помечены просроченными, цитология — до КР", () => {
    const steps = buildRoadmap({ done: {}, today: TODAY_ISO });
    expect(steps.find((step) => step.id === "skel")?.urgency).toBe("overdue");
    expect(steps.find((step) => step.id === "cyto")?.deadline).toBe("2026-11-19");
    expect(steps.find((step) => step.id === "kr")?.deadline).toBe("2026-11-20");
  });

  it("отметка «сдано» убирает задачу из pending, но не из прогресса", () => {
    const steps = buildRoadmap({
      done: { "nerv-file": true, "syn-drawing": true },
      today: TODAY_ISO,
    });
    const nerve = steps.find((step) => step.id === "nerve");
    expect(nerve?.doneCount).toBe(2);
    expect(nerve?.pending).toHaveLength(7);
    expect(nerve?.total).toBe(9);
  });

  it("порядок от AI применяется только к известным шагам", () => {
    const steps = buildRoadmap({ done: {}, today: TODAY_ISO });
    const ordered = orderRoadmap(steps, ["skel", "unknown", "nerve"]);
    expect(ordered).toHaveLength(steps.length);
    expect(ordered.map((step) => step.id).slice(0, 2)).toEqual(["skel", "nerve"]);
  });
});

describe("план по дням", () => {
  const plan = buildStudyPlanV2(input);

  it("заканчивается днём КР и не уходит в прошлое", () => {
    expect(plan.deadline).toBe("2026-11-20");
    expect(plan.days.every((day) => day.date >= TODAY_ISO)).toBe(true);
    expect(plan.days.every((day) => day.date <= plan.deadline)).toBe(true);
    expect(plan.days.at(-1)?.date).toBe("2026-11-20");
  });

  it("держит фиксированные точки: 17.11 тесты, 19.11 § 6 и репетиция, 20.11 КР", () => {
    const day17 = plan.days.find((day) => day.date === "2026-11-17");
    const day19 = plan.days.find((day) => day.date === "2026-11-19");
    const day20 = plan.days.find((day) => day.date === "2026-11-20");
    expect(day17?.items.some((item) => /Открытые тесты/.test(item.text))).toBe(true);
    expect(day19?.items.some((item) => /§ 6/.test(item.text))).toBe(true);
    expect(day19?.items.some((item) => /репетиция/i.test(item.text))).toBe(true);
    expect(day20?.items.some((item) => /КР: тест/.test(item.text))).toBe(true);
    expect(day20?.items.some((item) => /\+0,5/.test(item.text))).toBe(true);
  });

  it("главный риск преподавателя идёт первой строкой", () => {
    expect(plan.risks[0]).toBe(KR_RISK);
  });

  it("не оставляет пустых дней и не теряет пункты", () => {
    for (const day of plan.days) {
      expect(day.items.length).toBeGreaterThan(0);
      expect(day.load).toBeGreaterThan(0);
      expect(day.items.every((item) => item.text.length > 0)).toBe(true);
    }
  });

  it("вечером честно предупреждает, что весь блок не влезет", () => {
    expect(plan.risks.some((risk) => /вечер 12\.11/i.test(risk))).toBe(true);
  });

  it("сданные задачи исчезают из плана", () => {
    const skel = HISTOLOGY_PROGRAM.blocks.find((block) => block.id === "skel-2026-10-23");
    const done = Object.fromEntries((skel?.tasks ?? []).map((task) => [task.id, true]));
    const withoutSkeleton = buildStudyPlanV2({ ...input, done });
    const texts = withoutSkeleton.days.flatMap((day) => day.items.map((item) => item.text)).join("\n");
    expect(texts).not.toContain("Файлик по костным тканям");
    expect(texts).not.toContain("Тест по теме «Скелетные ткани»");
  });

  it("переносит КР на выбранную дату и не показывает события после неё", () => {
    const moved = buildStudyPlanV2({ ...input, krDate: "2026-11-18" });
    expect(moved.days.every((day) => day.date <= "2026-11-18")).toBe(true);
    expect(moved.days.find((day) => day.date === "2026-11-18")?.items.some((item) => /КР: тест/.test(item.text))).toBe(true);
    expect(moved.days.some((day) => day.date === "2026-11-19")).toBe(false);
  });

  it("прогресс цитологии — это и есть готовность к КР", () => {
    expect(progressOf(HISTOLOGY_PROGRAM, {}, ["cyt-next-week"])).toEqual({ done: 0, total: 6, percent: 0 });
    const half = buildStudyPlanV2({
      ...input,
      done: { "cyt-lecture": true, "cyt-file": true, "cyt-drawing": true },
    });
    expect(half.readiness).toBe(50);
  });

  it("подмешивает личные отработки, но не дублирует блоки программы", () => {
    const withAssignments = buildStudyPlanV2({
      ...input,
      assignments: [
        { id: "a1", subject: "Гистология", topic: "Кровь: мазок", due_date: "2026-11-15", status: "retake_needed" },
        { id: "a2", subject: "Гистология", topic: "Скелетные ткани (23.10)", due_date: "2026-11-15", status: "retake_needed" },
        { id: "a3", subject: "Гистология", topic: "Кровь: мазок", due_date: "2026-11-15", status: "passed" },
      ],
    });
    const day15 = withAssignments.days.find((day) => day.date === "2026-11-15");
    expect(day15?.items.some((item) => item.text.includes("Отработать: Кровь: мазок"))).toBe(true);
    expect(day15?.items.some((item) => item.text.includes("Отработать: Скелетные ткани"))).toBe(false);
    expect(withAssignments.days.flatMap((day) => day.items).filter((item) => item.text.includes("Кровь: мазок"))).toHaveLength(1);
  });
});

describe("AI-слой не может сдвинуть сроки", () => {
  const plan = buildStudyPlanV2(input);
  const roadmap = buildRoadmap({ done: {}, today: TODAY_ISO });

  it("промпт содержит все дни плана и все блоки", () => {
    const prompt = buildAiPromptV2(plan, roadmap);
    for (const day of plan.days) expect(prompt).toContain(day.date);
    for (const step of roadmap) expect(prompt).toContain(`[${step.id}]`);
  });

  it("отбрасывает выдуманные даты, блоки и markdown-обёртку", () => {
    const reply = [
      "```json",
      JSON.stringify({
        days: [
          { date: plan.days[0].date, focus: "Разобрать файл по нервной ткани" },
          { date: "2026-12-31", focus: "Придуманный день" },
        ],
        priority: ["cyto", "fake-block"],
        advice: ["Сначала электронограммы, потом тесты"],
        cut: ["Файл по цитологии"],
      }),
      "```",
    ].join("\n");
    const patch = parseAiPlanV2(reply, plan, roadmap);
    expect(Object.keys(patch.days)).toEqual([plan.days[0].date]);
    expect(patch.priority).toEqual(["cyto"]);
    expect(patch.advice).toHaveLength(1);
    expect(patch.cut).toEqual(["Файл по цитологии"]);
  });

  it("на мусор отвечает пустым патчем", () => {
    expect(parseAiPlanV2("не могу", plan, roadmap)).toEqual({ days: {}, advice: [], priority: [], cut: [] });
  });
});

describe("оценка и календарь", () => {
  it("+0,5 аннулирует одну ошибку, но без теории «5» не ставит", () => {
    expect(krGradeWithBonus(1, true, true)).toBe(5);
    expect(krGradeWithBonus(1, false, true)).toBe(4);
    expect(krGradeWithBonus(0, false, true)).toBe(5);
    expect(krGradeWithBonus(0, false, false)).toBe(4);
    expect(krGradeWithBonus(7, true, true)).toBe(3);
    expect(krGradeWithBonus(8, true, true)).toBe(2);
  });

  it("экспортирует по событию на день", () => {
    const plan = buildStudyPlanV2(input);
    const ics = toIcs(plan);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics.split("BEGIN:VEVENT")).toHaveLength(plan.days.length + 1);
    expect(ics.endsWith("\r\n")).toBe(true);
  });
});