import { describe, expect, it } from "vitest";
import { buildAgenda, isPrepTarget, type AgendaItem } from "@/lib/study/agenda";
import type { AcademicState, MyAssignment } from "@/lib/api/types";

const today = "2026-11-14";

function academicFixture(upcoming: any[], weakTopics: any[] = []): AcademicState {
  return {
    session: null,
    plan: null,
    metrics: null,
    debts: [],
    upcoming,
    weak_topics: weakTopics,
    recommendations: [],
  } as unknown as AcademicState;
}

describe("buildAgenda", () => {
  it("объединяет расписание, ДЗ и отработки и сортирует по сроку", () => {
    const items = buildAgenda({
      academic: academicFixture([
        { id: "e1", subject_name: "Физиология", event_kind: "colloquium", date: "2026-11-20", start_time: "09:00" },
        { id: "e2", subject_name: "Гистология", event_kind: "control_work", date: "2026-11-16", start_time: "12:30", room: "301" },
      ]),
      planner: {
        homeworks: [
          { id: "h1", title: "Конспект по дыханию", due_date: "2026-11-18", subject_name: "Физиология", subject_slug: "physiology", my_status: "pending" },
        ],
      },
      assignments: [
        { id: "a1", subject: "Гистология", topic: "Эпителиальные ткани", due_date: "2026-11-15", status: "retake_needed", grade: null, note: null, source: "manual" },
      ],
      today,
    });

    expect(items.map((item) => item.id)).toEqual(["assignment-a1", "event-e2", "hw-h1", "event-e1"]);
    expect(items[0].urgent).toBe(true);
    expect(items[1].label).toBe("контрольная");
    expect(items[1].time).toBe("12:30");
    expect(items[2].label).toBe("ДЗ");
  });

  it("помечает просроченное несданное ДЗ как срочное", () => {
    const items = buildAgenda({
      planner: { homeworks: [{ id: "h1", title: "Реферат", due_date: "2026-11-10", subject_name: "Биология", subject_slug: "biology", my_status: "pending" }] },
      today,
    });
    expect(items[0].urgent).toBe(true);
    expect(items[0].meta).toBe("просрочено");
  });

  it("сданное ДЗ уходит в конец и не попадает в открытые дела", () => {
    const items = buildAgenda({
      planner: { homeworks: [{ id: "h1", title: "Тест", due_date: "2026-11-09", subject_name: "Химия", subject_slug: "chemistry", my_status: "done" }] },
      today,
    });
    expect(items[0].done).toBe(true);
    expect(items[0].urgent).toBe(false);
  });

  it("сданные отработки исключаются", () => {
    const items = buildAgenda({
      assignments: [
        { id: "a1", subject: "Гистология", topic: "Пройдено", due_date: null, status: "passed", grade: null, note: null, source: "manual" },
        { id: "a2", subject: "Гистология", topic: "Ожидает", due_date: null, status: "pending", grade: null, note: null, source: "manual" },
      ] as MyAssignment[],
      today,
    });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("assignment-a2");
  });

  it("работает без данных (пустые источники)", () => {
    expect(buildAgenda({})).toEqual([]);
  });
});

describe("isPrepTarget", () => {
  const base = { id: "x", label: "", title: "", subject: null, date: null, time: null, urgent: false } as AgendaItem;

  it("аттестационные события — цель подготовки", () => {
    expect(isPrepTarget({ ...base, kind: "exam" })).toBe(true);
    expect(isPrepTarget({ ...base, kind: "colloquium" })).toBe(true);
  });

  it("ДЗ и обычные занятия — нет", () => {
    expect(isPrepTarget({ ...base, kind: "homework" })).toBe(false);
    expect(isPrepTarget({ ...base, kind: "lesson" })).toBe(false);
  });
});
