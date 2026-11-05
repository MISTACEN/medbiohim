import { describe, expect, it } from "vitest";
import { isScopeActive, isWithinTeachingScope, type TeachingScope } from "@/shared/permissions";

const activeScope: TeachingScope = {
  groupIds: ["group-1"],
  studentIds: ["student-1"],
  active: true,
};

describe("isScopeActive", () => {
  it("неактивная область не покрывает ничего", () => {
    expect(isScopeActive({ ...activeScope, active: false })).toBe(false);
  });

  it("истёкшая область закрыта", () => {
    expect(
      isScopeActive({ ...activeScope, expiresAt: "2020-01-01T00:00:00.000Z" }, new Date("2021-01-01")),
    ).toBe(false);
  });
});

describe("isWithinTeachingScope", () => {
  it("автор задания всегда в области", () => {
    expect(
      isWithinTeachingScope(activeScope, "teacher-1", { createdBy: "teacher-1" }),
    ).toBe(true);
  });

  it("явное назначение проверяющим перекрывает область", () => {
    expect(
      isWithinTeachingScope(activeScope, "teacher-1", {
        assignedTeacher: "teacher-1",
        groupIds: ["group-other"],
      }),
    ).toBe(true);
  });

  it("назначенная группа и назначенный студент входят в область", () => {
    expect(isWithinTeachingScope(activeScope, "teacher-1", { groupIds: ["group-1"] })).toBe(true);
    expect(isWithinTeachingScope(activeScope, "teacher-1", { studentIds: ["student-1"] })).toBe(true);
  });

  it("чужая группа и чужой студент вне области", () => {
    expect(isWithinTeachingScope(activeScope, "teacher-1", { groupIds: ["group-2"] })).toBe(false);
    expect(isWithinTeachingScope(activeScope, "teacher-1", { studentIds: ["student-2"] })).toBe(false);
    expect(isWithinTeachingScope(activeScope, "teacher-2", { createdBy: "teacher-1" })).toBe(false);
  });

  it("без активной области не совпадает даже автор", () => {
    expect(
      isWithinTeachingScope({ ...activeScope, active: false }, "teacher-1", { createdBy: "teacher-1" }),
    ).toBe(false);
  });
});
