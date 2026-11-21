import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ArchiveLectures from "../ArchiveLectures";
import { normalizeLectureTitle } from "@/shared/lectures/lecture-title";

/**
 * Органическая химия раньше показывала две отдельные карточки конспектов
 * (lectures-chem.json и lectures-chem-organic.json) — два заголовка, два поиска,
 * одна и та же вкладка. Теперь это одна лента с общим поиском и без повторов.
 *
 * Количество конспектов берём из самих файлов, а не из константы: контент
 * пополняется, и зашитое «8 + 14» превращало проверку слияния в проверку числа
 * лекций. Смысл теста — все конспекты обоих наборов в одной ленте, без дублей.
 */

type PortalLecture = { id?: string; title?: string };

const readPortal = (name: string) =>
  readFileSync(resolve(__dirname, "../../../../public/content/portals", name), "utf8");

const readLectures = (name: string): PortalLecture[] => {
  const parsed = JSON.parse(readPortal(name)) as { items?: PortalLecture[] } | PortalLecture[];
  return Array.isArray(parsed) ? parsed : parsed.items || [];
};

/** Подпись кнопки-конспекта: без «Тема N.» и «Лекция N:». */
const chipLabel = (title: string) =>
  title.replace(/^Тема \d+\.\s*/, "").replace(/^Лекция \d+:\s*/, "");

describe("ArchiveLectures: несколько наборов в одной ленте", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const file = String(url).replace("/content/portals/", "");
      return new Response(readPortal(file), { status: 200 });
    }));
  });

  it("химия: два набора сливаются в одну ленту без дублей", async () => {
    const chem = readLectures("lectures-chem.json");
    const organic = readLectures("lectures-chem-organic.json");
    const all = [...chem, ...organic];
    const expectedTitles = [...new Set(all.map((item) => normalizeLectureTitle(item.title)).filter(Boolean))];
    // Оба набора реально участвуют в ленте, а не подменяют друг друга.
    expect(expectedTitles.length).toBeGreaterThan(Math.max(chem.length, organic.length));

    const { container } = render(<ArchiveLectures sets={["chem", "chem-organic"]} />);

    await waitFor(() => {
      expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(expectedTitles.length);
    }, { timeout: 5000 });

    const chips = screen.getAllByRole("button")
      .filter((button) => button.tagName === "BUTTON")
      .map((button) => button.textContent || "");
    expect(chips.length).toBe(expectedTitles.length);
    expect(new Set(chips).size).toBe(chips.length);

    // Ни один конспект не потерялся при слиянии.
    for (const title of new Set(all.map((item) => chipLabel(String(item.title || ""))))) {
      expect(chips).toContain(title);
    }

    // Один поиск и один заголовок ленты на всю вкладку. Заголовки внутри текста
    // конспекта (LectureRenderer) не считаем: они принадлежат материалу, а не ленте.
    expect(screen.getAllByPlaceholderText("Поиск конспекта по названию…")).toHaveLength(1);
    const feedHeadings = [...container.querySelectorAll("h2")].filter((heading) =>
      /конспекты$/.test(String(heading.textContent || "").trim()),
    );
    expect(feedHeadings).toHaveLength(1);
    expect(container.textContent).toContain("Физическая химия");
    expect(container.textContent).toContain("Органическая химия");
  });

  it("один набор работает как раньше", async () => {
    const latin = readLectures("lectures-latin.json");
    render(<ArchiveLectures setId="latin" />);
    await waitFor(() => {
      expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(latin.length);
    }, { timeout: 5000 });
    expect(screen.getAllByPlaceholderText("Поиск конспекта по названию…")).toHaveLength(1);
  });
});
