import { describe, expect, it } from "vitest";

import {
  daysUntil,
  normalizeStaticPlan,
  parsePlanDate,
  sessionsFromApiPlanWeeks,
  splitPlanSessions,
} from "@/lib/subject-plan-next";

describe("subject-plan-next: ближайшее занятие", () => {
  it("parsePlanDate понимает ISO и ДД.ММ.ГГГГ", () => {
    expect(parsePlanDate("2026-11-18")).toBe("2026-11-18");
    expect(parsePlanDate("18.11.2026")).toBe("2026-11-18");
    expect(parsePlanDate("нет даты")).toBeNull();
    expect(parsePlanDate(null)).toBeNull();
  });

  it("ближайшее — первая будущая дата; сегодня считается ближайшим", () => {
    const sessions = normalizeStaticPlan({
      lectures: [
        { n: 1, date: "2026-11-01", title: "Прошедшая лекция" },
        { n: 2, date: "2026-11-20", title: "Будущая лекция" },
      ],
    }).sessions;
    const split = splitPlanSessions(sessions, "2026-11-10");
    expect(split.nextDate).toBe("2026-11-20");
    expect(split.next).toHaveLength(1);
    expect(split.past).toHaveLength(1);
    expect(split.past[0].key).toBe("lecture-1");
  });

  it("занятие «сегодня» ещё не прошло", () => {
    const sessions = normalizeStaticPlan({
      lectures: [{ n: 1, date: "2026-11-10", title: "Сегодня" }],
      labs: [{ n: 1, date: "2026-11-05", title: "Лабораторная вчера" }],
    }).sessions;
    const split = splitPlanSessions(sessions, "2026-11-10");
    expect(split.nextDate).toBe("2026-11-10");
    expect(split.past).toHaveLength(1);
  });

  it("если все занятия прошли — ближайшего нет, прошедшие отсортированы от свежих", () => {
    const sessions = normalizeStaticPlan({
      lectures: [
        { n: 1, date: "2026-09-01", title: "Старая" },
        { n: 2, date: "2026-10-01", title: "Свежая" },
      ],
    }).sessions;
    const split = splitPlanSessions(sessions, "2026-11-10");
    expect(split.nextDate).toBeNull();
    expect(split.next).toHaveLength(0);
    expect(split.past.map((s) => s.key)).toEqual(["lecture-2", "lecture-1"]);
  });

  it("занятия без даты попадают в undated и не ломают поиск", () => {
    const sessions = normalizeStaticPlan({
      lectures: [{ n: 1, date: "2026-12-01", title: "Будущая" }],
      labs: ["Лабораторная без даты"],
    }).sessions;
    const split = splitPlanSessions(sessions, "2026-11-10");
    expect(split.nextDate).toBe("2026-12-01");
    expect(split.undated).toHaveLength(1);
  });

  it("несколько занятий одной даты показываются вместе", () => {
    const sessions = normalizeStaticPlan({
      lectures: [{ n: 3, date: "2026-11-20", title: "Лекция 3" }],
      labs: [{ n: 3, date: "2026-11-20", title: "Лаба 3" }],
    }).sessions;
    const split = splitPlanSessions(sessions, "2026-11-10");
    expect(split.next).toHaveLength(2);
  });

  it("недели плана API нормализуются: дата, лекция, практика, препараты", () => {
    const sessions = sessionsFromApiPlanWeeks([
      {
        id: "w1",
        planned_date: "2026-11-20",
        item_type: "lecture",
        title: "Нервная клетка",
        lecture_id: "lec-1",
        preparations: [{ number: 1, title: "Спинной мозг" }],
        metadata: { week: 7, homework: "конспект §12" },
      },
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].date).toBe("2026-11-20");
    expect(sessions[0].lecture?.title).toBe("Нервная клетка");
    expect(sessions[0].lecture?.lectureId).toBe("lec-1");
    expect(sessions[0].week).toBe(7);
    expect(sessions[0].homework?.text).toBe("конспект §12");
    expect(sessions[0].preparations?.[0].name).toBe("Спинной мозг");
  });

  it("статический план недель (гистология) даёт занятие с лекцией и препаратами", () => {
    const plan = normalizeStaticPlan({
      meta: { subject_name: "Гистология", subject_slug: "histology" },
      weeks: [
        {
          num: 1,
          date: "2026-09-04",
          lecture: { num: 1, lecture_id: "hist-00", title: "Введение" },
          lab: { title: "Техника" },
          preparations: [{ n: 1, name: "Клетка" }],
          electronograms: ["Митохондрия"],
          homework: { items: ["зарисовать препарат"] },
        },
      ],
    });
    expect(plan.subject).toBe("Гистология");
    expect(plan.sessions[0].lecture?.lectureId).toBe("hist-00");
    expect(plan.sessions[0].preparations).toHaveLength(1);
    expect(plan.sessions[0].electronograms).toEqual(["Митохондрия"]);
    expect(plan.sessions[0].homework?.items).toEqual(["зарисовать препарат"]);
  });

  it("daysUntil считает разницу в днях", () => {
    expect(daysUntil("2026-11-10", "2026-11-10")).toBe(0);
    expect(daysUntil("2026-11-13", "2026-11-10")).toBe(3);
    expect(daysUntil("2026-11-08", "2026-11-10")).toBe(-2);
  });
});
