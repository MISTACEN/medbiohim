import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LectureView } from "@/components/lectures/LectureView";
import type { Lecture } from "@/lib/api";

// Панель химического модуля — это выдвижная панель с двумя состояниями
// (смонтирована / доехала до края), поэтому тест проверяет именно классы
// анимации и sessionStorage, а не содержимое модуля.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/lectures/LectureRenderer", () => ({
  LectureRenderer: () => <div data-testid="lecture-body" />,
}));
vi.mock("@/components/lectures/LectureBlocksNav", () => ({
  LectureBlocksNav: () => <nav data-testid="blocks-nav" />,
}));
vi.mock("@/components/lectures/LectureLearningLinks", () => ({
  LectureLearningLinks: () => null,
}));
vi.mock("@/hooks/useLectureProgress", () => ({
  useLectureProgress: () => ({}),
}));
vi.mock("@/lib/lectures/exportLecture", () => ({
  downloadLectureWord: vi.fn(),
  printLecturePdf: vi.fn(),
}));
vi.mock("@/modules/subjects/submodules/chemistry", () => ({
  ChemistryModule: () => <div data-testid="chem-module" />,
}));

const STORAGE_KEY = "mbh:chem-panel:open";

function lecture(id: string, title: string): Lecture {
  return {
    id,
    title,
    subject: "Гистология",
    subject_slug: "histology",
    body_markdown: "## 1. Блок\n\nТекст лекции.",
  } as unknown as Lecture;
}

const dialog = () => screen.queryByRole("dialog", { name: "Химический модуль" });
const panel = () => document.querySelector(".chem-panel") as HTMLElement | null;
const backdrop = () => document.querySelector(".chem-panel-backdrop") as HTMLElement | null;

describe("LectureView · панель химического модуля", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("открывается с анимацией: панель доезжает из-за края и запоминается в sessionStorage", async () => {
    render(<LectureView lecture={lecture("hist-09-nervnaya-tkan", "Нервная ткань")} />);

    expect(dialog()).toBeNull();
    const trigger = screen.getByRole("button", { name: /Химический модуль/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);

    // Портал появляется сразу, но панель ещё за правым краем — иначе transition не сыграет.
    expect(dialog()).not.toBeNull();
    expect(panel()).toHaveClass("translate-x-full");
    expect(panel()).not.toHaveClass("translate-x-0");
    expect(backdrop()).toHaveClass("opacity-0");

    // Двойной rAF (или страховочный таймер) переводит панель в конечную позицию.
    await waitFor(() => expect(panel()).toHaveClass("translate-x-0"));
    expect(panel()).not.toHaveClass("translate-x-full");
    expect(backdrop()).toHaveClass("opacity-100");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe("1");
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("закрывается по Escape: панель уезжает, но остаётся в DOM до конца анимации", async () => {
    render(<LectureView lecture={lecture("hist-09-nervnaya-tkan", "Нервная ткань")} />);
    fireEvent.click(screen.getByRole("button", { name: /Химический модуль/ }));
    await waitFor(() => expect(panel()).toHaveClass("translate-x-0"));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(panel()).toHaveClass("translate-x-full");
    expect(dialog()).not.toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    // Прокрутка фона снимается только когда панель ушла из DOM.
    await waitFor(() => expect(dialog()).toBeNull());
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("закрывается кнопкой и по клику на фон", async () => {
    render(<LectureView lecture={lecture("hist-09-nervnaya-tkan", "Нервная ткань")} />);

    fireEvent.click(screen.getByRole("button", { name: /Химический модуль/ }));
    await waitFor(() => expect(panel()).toHaveClass("translate-x-0"));
    fireEvent.click(screen.getByRole("button", { name: "Закрыть химический модуль" }));
    expect(panel()).toHaveClass("translate-x-full");
    await waitFor(() => expect(dialog()).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /Химический модуль/ }));
    await waitFor(() => expect(panel()).toHaveClass("translate-x-0"));
    fireEvent.click(backdrop()!);
    expect(panel()).toHaveClass("translate-x-full");
    await waitFor(() => expect(dialog()).toBeNull());
  });

  it("открытая панель переживает переход к следующей лекции", async () => {
    const first = render(<LectureView lecture={lecture("hist-09-nervnaya-tkan", "Нервная ткань")} />);
    fireEvent.click(screen.getByRole("button", { name: /Химический модуль/ }));
    await waitFor(() => expect(panel()).toHaveClass("translate-x-0"));

    // Переход на другую лекцию: компонент монтируется заново.
    first.unmount();
    expect(dialog()).toBeNull();

    render(<LectureView lecture={lecture("hist-10-nervnaya-sistema", "Нервная система")} />);

    await waitFor(() => expect(dialog()).not.toBeNull());
    await waitFor(() => expect(panel()).toHaveClass("translate-x-0"));
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe("1");
  });

  it("не открывается сама, если панель закрыли перед переходом", async () => {
    const first = render(<LectureView lecture={lecture("hist-09-nervnaya-tkan", "Нервная ткань")} />);
    fireEvent.click(screen.getByRole("button", { name: /Химический модуль/ }));
    await waitFor(() => expect(panel()).toHaveClass("translate-x-0"));
    fireEvent.click(screen.getByRole("button", { name: "Закрыть химический модуль" }));
    await waitFor(() => expect(dialog()).toBeNull());

    first.unmount();
    render(<LectureView lecture={lecture("hist-10-nervnaya-sistema", "Нервная система")} />);

    expect(dialog()).toBeNull();
    expect(screen.getByRole("button", { name: /Химический модуль/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
