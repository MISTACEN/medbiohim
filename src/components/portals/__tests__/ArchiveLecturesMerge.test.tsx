import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ArchiveLectures from "../ArchiveLectures";

/**
 * Органическая химия раньше показывала две отдельные карточки конспектов
 * (lectures-chem.json и lectures-chem-organic.json) — два заголовка, два поиска,
 * одна и та же вкладка. Теперь это одна лента с общим поиском и без повторов.
 */

const readPortal = (name: string) =>
  readFileSync(resolve(__dirname, "../../../../public/content/portals", name), "utf8");

describe("ArchiveLectures: несколько наборов в одной ленте", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const file = String(url).replace("/content/portals/", "");
      return new Response(readPortal(file), { status: 200 });
    }));
  });

  it("химия: 8 + 14 конспектов сливаются в одну ленту без дублей", async () => {
    const { container } = render(<ArchiveLectures sets={["chem", "chem-organic"]} />);

    await waitFor(() => {
      expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(22);
    }, { timeout: 5000 });

    const chips = screen.getAllByRole("button")
      .filter((button) => button.tagName === "BUTTON")
      .map((button) => button.textContent || "");
    expect(chips.length).toBe(22);
    expect(new Set(chips).size).toBe(chips.length);

    // Один поиск и один заголовок на всю вкладку.
    expect(screen.getAllByPlaceholderText("Поиск конспекта по названию…")).toHaveLength(1);
    const headings = container.querySelectorAll("h2");
    expect(headings).toHaveLength(1);
    expect(container.textContent).toContain("Физическая химия");
    expect(container.textContent).toContain("Органическая химия");
  });

  it("один набор работает как раньше", async () => {
    render(<ArchiveLectures setId="latin" />);
    await waitFor(() => {
      expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(10);
    }, { timeout: 5000 });
    expect(screen.getAllByPlaceholderText("Поиск конспекта по названию…")).toHaveLength(1);
  });
});
