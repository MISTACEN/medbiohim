import { describe, expect, it } from "vitest";
import {
  LEARNING_MODULES,
  moduleById,
  moduleHref,
  modulesForSubject,
  resolveSubjectAreaKey,
  simulationSlugsForArea,
  type SubjectAreaKey,
} from "@/lib/learning/modules";
import {
  MODULE_PROGRESS_KEY,
  readVisits,
  recordModuleVisit,
  summarizeVisits,
  type StorageLike,
} from "@/lib/learning/moduleProgress";
import { SIMULATIONS } from "@/lib/sim/catalog";

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
  };
}

function ids(key: SubjectAreaKey): string[] {
  return modulesForSubject(key).map((module) => module.id);
}

describe("межпредметные модули", () => {
  it("химический модуль доступен во всех химических дисциплинах", () => {
    for (const key of ["chemistry_organic_physical", "inorganic_chemistry"] as const) {
      expect(ids(key)).toContain("chemistry.elements");
      expect(ids(key)).toContain("chemistry.solutions");
      expect(ids(key)).toContain("chemistry.lab");
      expect(simulationSlugsForArea(key)).toContain("buffer-titration");
      expect(simulationSlugsForArea(key)).toContain("osmosis");
    }
    expect(simulationSlugsForArea("chemistry_organic_physical")).toContain("enzyme-kinetics");
  });

  it("релевантные химические инструменты доступны в биохимии", () => {
    const list = ids("biochemistry");
    expect(list).toContain("chemistry.solutions");
    expect(list).toContain("chemistry.lab");
    expect(list).toContain("chemistry.elements");
    expect(simulationSlugsForArea("biochemistry")).toContain("enzyme-kinetics");
    expect(simulationSlugsForArea("biochemistry")).toContain("oxygen-hemoglobin");
  });

  it("физиологические инструменты доступны в физиологии и связанных дисциплинах", () => {
    expect(simulationSlugsForArea("physiology")).toEqual(
      expect.arrayContaining(["membrane-potential", "oxygen-hemoglobin", "osmosis"]),
    );
    expect(simulationSlugsForArea("pathophysiology")).toContain("membrane-potential");
    expect(simulationSlugsForArea("biophysics")).toContain("membrane-potential");
    expect(ids("physiology")).toContain("labs.virtual");
    expect(ids("physiology")).toContain("progress.learning");
  });

  it("нерелевантные инструменты не отображаются", () => {
    const history = resolveSubjectAreaKey({ slug: "history", name: "История России" });
    expect(history).toBeNull();
    expect(modulesForSubject(history)).toEqual([]);
    expect(resolveSubjectAreaKey({ name: "Философия" })).toBeNull();
    expect(ids("physiology")).not.toContain("chemistry.elements");
    expect(ids("physiology")).not.toContain("chemistry.practice");
    expect(ids("biology")).not.toContain("chemistry.lab");
  });

  it("дубли дисциплин не создают дубли модулей", () => {
    const biochemistry = resolveSubjectAreaKey({ name: "Биохимия" });
    const generalBiochemistry = resolveSubjectAreaKey({ name: "Общая биохимия" });
    const longBiochemistry = resolveSubjectAreaKey({
      name: "Медицинская биохимия: Принципы измерительных технологий в биохимии. Патохимия, диагностика",
    });
    expect(biochemistry).toBe("biochemistry");
    expect(generalBiochemistry).toBe(biochemistry);
    expect(longBiochemistry).toBe(biochemistry);

    const list = modulesForSubject(biochemistry);
    expect(new Set(list.map((module) => module.id)).size).toBe(list.length);
    expect(modulesForSubject(generalBiochemistry).map((module) => module.id)).toEqual(
      list.map((module) => module.id),
    );
    expect(modulesForSubject(longBiochemistry).map((module) => module.id)).toEqual(
      list.map((module) => module.id),
    );
  });

  it("прогресс не теряется при переходе между предметами", () => {
    const storage = memoryStorage();
    recordModuleVisit("chemistry.solutions", "chemistry_organic_physical", new Date("2026-11-04T10:00:00Z"), storage);
    recordModuleVisit("chemistry.solutions", "biochemistry", new Date("2026-11-04T10:05:00Z"), storage);

    const visits = readVisits(storage);
    expect(visits).toHaveLength(1);
    expect(visits[0].moduleId).toBe("chemistry.solutions");
    expect(visits[0].visits).toBe(2);
    expect(visits[0].lastSubject).toBe("biochemistry");
    expect(visits[0].subjects).toEqual(["chemistry_organic_physical", "biochemistry"]);
    expect(summarizeVisits(visits)).toMatchObject({ modules: 1, visits: 2, lastSubject: "biochemistry" });
    expect(storage.getItem(MODULE_PROGRESS_KEY)).toContain("chemistry.solutions");
  });

  it("старые маршруты сохраняются, а контекст добавляется параметром", () => {
    const solutions = moduleById("chemistry.solutions")!;
    expect(solutions.base).toBe("/chemistry/tools");
    expect(moduleHref(solutions)).toBe("/chemistry/tools");
    expect(moduleHref(solutions, { subjectKey: "biochemistry" })).toBe(
      "/chemistry/tools?subject=biochemistry",
    );

    const membrane = moduleById("sim.membrane-potential")!;
    expect(membrane.base).toBe("/labs/simulations?slug=membrane-potential");
    expect(moduleHref(membrane, { subjectKey: "physiology" })).toBe(
      "/labs/simulations?slug=membrane-potential&subject=physiology",
    );

    for (const entry of LEARNING_MODULES) {
      expect(entry.base.startsWith("/")).toBe(true);
      if (entry.functions.includes("simulation")) {
        expect(entry.simulationSlug, entry.id).toBeTruthy();
        expect(SIMULATIONS.some((simulation) => simulation.slug === entry.simulationSlug)).toBe(true);
      }
    }
  });
});
