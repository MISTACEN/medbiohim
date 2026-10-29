import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PRACTICE_TOPICS } from "@/lib/chemistry/practice";
import { CHEM_PLAN_FILE, TOPIC_PLAN_LINKS, planAnchorLabel, planLinkFor } from "@/lib/chemistry/planLinks";

type PlanLesson = { n: number; title: string; topics?: string[] };
type Plan = { lectures?: PlanLesson[]; labs?: PlanLesson[]; weeks?: Array<{ lecture?: { title?: string; topics?: string[] } }> };

const plan: Plan = JSON.parse(readFileSync(join(process.cwd(), "public", "content", CHEM_PLAN_FILE), "utf8"));

function lessonText(lesson: PlanLesson): string {
  return [lesson.title, ...(lesson.topics || [])].join(" \n ");
}

describe("связь тем генератора с планом ChemPlan", () => {
  it("каждая тема генератора имеет явную запись (ссылка или честное «вне плана»)", () => {
    expect(TOPIC_PLAN_LINKS).toHaveLength(PRACTICE_TOPICS.length);
    for (const topic of PRACTICE_TOPICS) {
      const link = planLinkFor(topic.id);
      expect(link, `нет записи для темы ${topic.id}`).toBeTruthy();
      expect(link!.note.trim().length).toBeGreaterThan(10);
      if (!link!.anchor) expect(planAnchorLabel(link!.anchor)).toBe("вне плана кафедры");
    }
  });

  it("каждая ссылка подтверждается дословным фрагментом плана", () => {
    for (const link of TOPIC_PLAN_LINKS) {
      if (!link.anchor) continue;
      const list = link.anchor.kind === "lab" ? plan.labs || [] : plan.lectures || [];
      const lesson = list.find((item) => Number(item.n) === link.anchor!.n);
      expect(lesson, `${link.topic}: в плане нет занятия ${link.anchor.kind} ${link.anchor.n}`).toBeTruthy();
      expect(
        lessonText(lesson!),
        `${link.topic}: фраза «${link.anchor.quote}» не найдена в занятии ${link.anchor.n}`,
      ).toContain(link.anchor.quote);
    }
  });

  it("ссылки не дублируются между темами и помечены планом", () => {
    const anchored = TOPIC_PLAN_LINKS.filter((link) => link.anchor);
    const keys = anchored.map((link) => `${link.anchor!.kind}:${link.anchor!.n}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const link of anchored) {
      expect(planAnchorLabel(link.anchor)).toMatch(/^(лаб\.|лекция) \d+$/);
    }
  });

  it("кислотно-основная тема ведёт именно на занятие про кислотные свойства", () => {
    const link = planLinkFor("ph");
    expect(link?.anchor).toEqual({ kind: "lab", n: 4, quote: "кислотных и основных свойств" });
  });
});
