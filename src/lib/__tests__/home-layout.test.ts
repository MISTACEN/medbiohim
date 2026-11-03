import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT,
  defaultHomeLayout,
  hiddenWidgetIds,
  isDefaultLayout,
  moveWidget,
  parseLayout,
  sanitizeLayout,
} from "../home-layout";

describe("home layout", () => {
  it("default layout keeps the original page order", () => {
    expect(defaultHomeLayout().map((widget) => widget.id)).toEqual([
      "academic",
      "schedule",
      "homework",
      "tests",
      "subjects",
      "homeworkList",
      "announcements",
      "debts",
    ]);
  });

  it("returns a mutable copy instead of the shared constant", () => {
    const copy = defaultHomeLayout();
    copy.pop();
    expect(copy).toHaveLength(DEFAULT_LAYOUT.length - 1);
    expect(DEFAULT_LAYOUT).toHaveLength(8);
  });

  it("drops unknown ids, duplicates and invalid spans", () => {
    const parsed = parseLayout([
      { id: "schedule", span: "full" },
      { id: "schedule", span: "third" },
      { id: "nope" },
      { id: "note", span: "huge" },
      null,
      "academic",
    ]);
    expect(parsed).toEqual([
      { id: "schedule", span: "full" },
      { id: "note", span: "half" },
    ]);
  });

  it("falls back to the default for unusable values", () => {
    expect(parseLayout({})).toBeNull();
    expect(parseLayout([])).toBeNull();
    expect(sanitizeLayout("broken")).toEqual(defaultHomeLayout());
  });

  it("moves widgets and ignores out-of-range moves", () => {
    const layout = defaultHomeLayout();
    const moved = moveWidget(layout, 0, 2);
    expect(moved.map((widget) => widget.id).slice(0, 3)).toEqual(["schedule", "homework", "academic"]);
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
