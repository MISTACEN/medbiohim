import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ArchiveLectures from "../ArchiveLectures";

/**
 * Рендер портальных лекций на реальном контенте:
 * lecture set загружается через fetch → рендерится LectureRenderer'ом.
 * Ловит регрессии санитайзера (раньше он вырезал lec-math классы) и интеграции.
 */

const readPortal = (name: string) =>
  readFileSync(resolve(__dirname, "../../../../public/content/portals", name), "utf8");

describe("ArchiveLectures (реальный контент)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const file = String(url).replace("/content/portals/", "");
      return new Response(readPortal(file), { status: 200 });
    }));
  });

  it("органическая химия: 14 лекций, def/simple блоки доходят до HTML", async () => {
    const { container } = render(<ArchiveLectures setId="chem-organic" />);
    await waitFor(() => {
      expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(14);
    }, { timeout: 5000 });

    const html = container.innerHTML;
    expect(html).toContain("lec-def");
    expect(html).toContain("lec-simple");
    expect(html).toContain("lec-math");
    // KaTeX-обёртки не вырезаны
    expect(html).toMatch(/h2/);
  });

  it("биология: новые конспекты рендерятся с заголовками", async () => {
    const { container } = render(<ArchiveLectures setId="bio" />);
    await waitFor(() => {
      expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(20);
    }, { timeout: 5000 });
    expect(container.innerHTML).toContain("h2");
  });

  it("поиск фильтрует конспекты по названию", async () => {
    const { container } = render(<ArchiveLectures setId="bio" />);
    const search = await screen.findByPlaceholderText("Поиск конспекта по названию…", {}, { timeout: 5000 });
    const before = screen.getAllByRole("button").filter((b) => b.tagName === "BUTTON").length;
    fireEvent.change(search, { target: { value: "менделя" } });
    const after = screen.getAllByRole("button").filter((b) => b.tagName === "BUTTON").length;
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
    expect(container.innerHTML).toMatch(/Менделя/i);
  });
});
