import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/navigation";

describe("safeNextPath: разрешённые пути", () => {
  it("пропускает внутренний путь", () => {
    expect(safeNextPath("/ok")).toBe("/ok");
  });

  it("сохраняет query и якорь внутреннего пути", () => {
    expect(safeNextPath("/settings?tab=profile#theme")).toBe("/settings?tab=profile#theme");
  });

  it("обрезает пробелы вокруг пути", () => {
    expect(safeNextPath("  /dashboard  ")).toBe("/dashboard");
  });
});

describe("safeNextPath: защита от open redirect", () => {
  it("не пропускает protocol-relative //evil", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("//evil.com/path")).toBe("/");
  });

  it("не пропускает абсолютные http(s)-адреса", () => {
    expect(safeNextPath("http://evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com/login")).toBe("/");
  });

  it("не пропускает javascript: и другие схемы", () => {
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
    expect(safeNextPath("data:text/html,<script>alert(1)</script>")).toBe("/");
    expect(safeNextPath("mailto:a@b.c")).toBe("/");
  });

  it("не пропускает обратный слэш после ведущего /", () => {
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath("\\\\evil.com")).toBe("/");
  });

  it("не пропускает управляющие символы внутри пути", () => {
    expect(safeNextPath("/o\u0000k")).toBe("/");
    expect(safeNextPath("/ok\nSet-Cookie: x=1")).toBe("/");
  });

  it("не пропускает относительный путь без ведущего /", () => {
    expect(safeNextPath("settings")).toBe("/");
    expect(safeNextPath("../admin")).toBe("/");
  });
});

describe("safeNextPath: fallback", () => {
  it("пустое значение даёт fallback по умолчанию", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath("   ")).toBe("/");
  });

  it("использует явно переданный fallback", () => {
    expect(safeNextPath("//evil.com", "/login")).toBe("/login");
    expect(safeNextPath(null, "/login")).toBe("/login");
  });
});
