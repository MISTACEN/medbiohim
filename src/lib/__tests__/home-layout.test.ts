import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT,
  defaultHomeLayout,
  hiddenWidgetIds,
  isDefaultLayout,
  migrateLayout,
  moveWidget,
  parseLayout,
  sanitizeLayout,
} from "../home-layout";

describe("home layout", () => {
  it("default layout starts with the combined today summary", () => {
    expect(defaultHomeLayout().map((widget) => widget.id)).toEqual([
      "today",
      "academic",
      "tests",
      "homeworkList",
      "subjects",
      "announcements",
      "debts",
    ]);
  });

  it("returns a mutable copy instead of the shared constant", () => {
    const copy = defaultHomeLayout();
    copy.pop();
    expect(copy).toHaveLength(DEFAULT_LAYOUT.length - 1);
    expect(DEFAULT_LAYOUT).toHaveLength(7);
  });

  it("drops unknown ids, duplicates and invalid spans", () => {
    const parsed = parseLayout([
      { id: "academic", span: "full" },
      { id: "academic", span: "third" },
      { id: "nope" },
      { id: "note", span: "huge" },
      null,
      "tests",
    ]);
    expect(parsed).toEqual([
      { id: "academic", span: "full" },
      { id: "note", span: "half" },
    ]);
  });

  it("falls back to the default for unusable values", () => {
    expect(parseLayout({})).toBeNull();
    expect(parseLayout([])).toBeNull();
    expect(sanitizeLayout("broken")).toEqual(defaultHomeLayout());
  });

  it("migrates the legacy layout: schedule becomes today, homework is absorbed", () => {
    const legacy = [
      { id: "academic", span: "full" },
      { id: "schedule", span: "third" },
      { id: "homework", span: "third" },
      { id: "tests", span: "third" },
      { id: "subjects", span: "full" },
      { id: "homeworkList", span: "half" },
      { id: "announcements", span: "half" },
      { id: "debts", span: "full" },
    ];
    const migrated = migrateLayout(legacy);
    expect(migrated?.map((widget) => widget.id)).toEqual([
      "academic",
      "today",
      "tests",
      "subjects",
      "homeworkList",
      "announcements",
      "debts",
    ]);
    expect(migrateLayout(legacy)).toEqual([
      { id: "academic", span: "full" },
      { id: "today", span: "full" },
      { id: "tests", span: "third" },
      { id: "subjects", span: "full" },
      { id: "homeworkList", span: "half" },
      { id: "announcements", span: "half" },
      { id: "debts", span: "full" },
    ]);
  });

  it("keeps layouts that already have the today widget", () => {
    const current = defaultHomeLayout();
    expect(migrateLayout(current)).toEqual(current);
  });

  it("does not re-add today to a custom layout without legacy blocks", () => {
    // Пользователь сам скрыл и старые, и новые блоки — миграция не навязывает виджет.
    const custom = [
      { id: "academic", span: "full" },
      { id: "note", span: "half" },
    ];
    expect(migrateLayout(custom)).toEqual(custom);
  });

  it("moves widgets and ignores out-of-range moves", () => {
    const layout = defaultHomeLayout();
    const moved = moveWidget(layout, 0, 2);
    expect(moved.map((widget) => widget.id).slice(0, 3)).toEqual(["academic", "tests", "today"]);
    expect(moveWidget(layout, -1, 2)).toBe(layout);
    expect(moveWidget(layout, 0, 99)).toBe(layout);
  });

  it("detects the original view and reacts to a note", () => {
    expect(isDefaultLayout(defaultHomeLayout())).toBe(true);
    expect(isDefaultLayout(defaultHomeLayout(), "не забыть")).toBe(false);
    expect(isDefaultLayout(moveWidget(defaultHomeLayout(), 0, 1))).toBe(false);
  });

  it("lists hidden widgets in palette order", () => {
    const layout = defaultHomeLayout().filter((widget) => widget.id !== "tests");
    expect(hiddenWidgetIds(layout)).toEqual(["tests", "note"]);
  });
});
