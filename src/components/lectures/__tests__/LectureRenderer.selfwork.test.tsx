/** Интеграция фенсов ```selfwork / ```exam в реальную лекцию.
 *
 *  Проверяем именно то, что увидит студент:
 *   - фенс с lectureId из JSON-спеки рендерит панель «Подготовка к самостоятельной»
 *     с реальным контентом темы (вопрос emb-oq-01 присутствует);
 *   - фенс ```exam рендерит «Режим экзамена» с выбором варианта;
 *   - работает фолбэк на проп lectureId, если в спеке id нет;
 *   - служебный маркер <!-- MBH:SELFWORK:... --> (нужен скрипту/миграции T3)
 *     НЕ выводится в текст лекции, а окружающий текст сохраняется.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LectureRenderer } from "../LectureRenderer";

const LECTURE_ID = "hist-03-embriologiya";

function fence(kind: "selfwork" | "exam", spec = `{"lectureId": "${LECTURE_ID}"}`): string {
  return ["```" + kind, spec, "```"].join("\n");
}

/** Мини-лекция: вводный H2 + заданный хвост. */
function lectureWith(tail: string): string {
  return ["# Основы эмбриологии", "", "## § 6. Тесты открытого типа", "", "Текст лекции.", "", tail].join("\n");
}

describe("LectureRenderer: фенс selfwork", () => {
  it("рендерит панель открытых вопросов с контентом темы", async () => {
    const markdown = lectureWith(
      ["## § 7. Подготовка к самостоятельной (открытые вопросы)", "", "Интерактив: только открытые вопросы.", "", fence("selfwork")].join("\n"),
    );
    const { container } = render(<LectureRenderer markdown={markdown} />);

    expect(await screen.findByText(/Задание 5 · Открытые вопросы/)).toBeTruthy();
    // Заголовок темы пришёл из реестра по lectureId из спеки фенса.
    expect(screen.getByText("Подготовка к самостоятельной. Эмбриология")).toBeTruthy();
    // Реальный контент T1: первый открытый вопрос отрисован.
    expect(screen.getByTestId("open-question-emb-oq-01")).toBeTruthy();
    // Сам фенс не выводится как текст.
    expect(container.textContent).not.toContain('"lectureId"');
    expect(container.textContent).not.toContain("```selfwork");
  });

  it("фолбэк: без lectureId в спеке берёт id из пропа рендерера", async () => {
    const markdown = lectureWith(["## § 7. Открытые вопросы", "", fence("selfwork", "{}")].join("\n"));
    render(<LectureRenderer markdown={markdown} lectureId={LECTURE_ID} />);

    expect(await screen.findByText(/Задание 5 · Открытые вопросы/)).toBeTruthy();
    expect(screen.getByTestId("open-question-emb-oq-01")).toBeTruthy();
  });

  it("фенс без темы в реестре не ломает рендер и не показывает вопросы", async () => {
    const markdown = lectureWith(["## § 7. Открытые вопросы", "", fence("selfwork", `{"lectureId": "hist-99-missing"}`)].join("\n"));
    render(<LectureRenderer markdown={markdown} />);

    expect(await screen.findByText(/Открытые вопросы для этой лекции ещё не заполнены/)).toBeTruthy();
    expect(screen.queryByTestId("open-question-emb-oq-01")).toBeNull();
  });
});

describe("LectureRenderer: фенс exam", () => {
  it("рендерит режим экзамена с выбором варианта", async () => {
    const markdown = lectureWith(
      ["## § 8. Режим экзамена (самостоятельная работа)", "", "Интерактив: три задания.", "", fence("exam")].join("\n"),
    );
    const { container } = render(<LectureRenderer markdown={markdown} />);

    expect(await screen.findByText(/Задание 6 · Режим экзамена/)).toBeTruthy();
    expect(screen.getByRole("group", { name: "Выбор варианта" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Вариант 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Вариант 4" })).toBeTruthy();
    expect(container.textContent).not.toContain('"lectureId"');
    expect(container.textContent).not.toContain("```exam");
  });
});

describe("LectureRenderer: служебный маркер идемпотентности", () => {
  it("HTML-комментарий не выводится как текст, окружающий markdown сохраняется", () => {
    const markdown = [
      "## § 7. Подготовка к самостоятельной",
      "",
      "<!-- MBH:SELFWORK:hist-03-embriologiya -->",
      "",
      "Видимый текст после маркера.",
      "",
      "```selfwork",
      `{"lectureId": "${LECTURE_ID}"}`,
      "```",
    ].join("\n");
    const { container } = render(<LectureRenderer markdown={markdown} />);

    // Текст вокруг маркера и сама панель на месте…
    expect(screen.getByText(/Видимый текст после маркера/)).toBeTruthy();
    expect(screen.getByText(/Задание 5 · Открытые вопросы/)).toBeTruthy();
    // …а сам комментарий не просочился ни в текст, ни в разметку.
    expect(container.textContent).not.toContain("MBH:SELFWORK");
    expect(container.textContent).not.toContain("<!--");
    expect(container.innerHTML).not.toContain("MBH:SELFWORK");
  });
});

describe("LectureRenderer: реальная добавка § 7/§ 8 целиком", () => {
  it("оба фенса и маркер: видны две панели, маркер невидим", async () => {
    // Точный текст, который добавляют scripts/apply-embryology-selfwork.mjs и миграция T3.
    const appendix = [
      "<!-- MBH:SELFWORK:hist-03-embriologiya -->",
      "## § 7. Подготовка к самостоятельной (открытые вопросы)",
      "",
      "Интерактив: только открытые вопросы без вариантов ответа — письменный ответ, проверка с разбором ошибок, образцовый ответ и повторное прохождение вопросов, где были ошибки.",
      "",
      "```selfwork",
      `{"lectureId": "${LECTURE_ID}"}`,
      "```",
      "",
      "## § 8. Режим экзамена (самостоятельная работа)",
      "",
      "Интерактив: три задания как на реальной самостоятельной — осевые органы по памяти, электронограмма половой клетки (определить и подписать структуры) и развёрнутый теоретический вопрос; оценка 3/4/5 с пояснениями.",
      "",
      "```exam",
      `{"lectureId": "${LECTURE_ID}"}`,
      "```",
    ].join("\n");
    const { container } = render(<LectureRenderer markdown={lectureWith(appendix)} />);

    expect(await screen.findByText(/Задание 5 · Открытые вопросы/)).toBeTruthy();
    expect(screen.getByText(/Задание 6 · Режим экзамена/)).toBeTruthy();
    expect(container.textContent).not.toContain("MBH:SELFWORK");
    // Порядок разделов сохранён: § 7 раньше § 8.
    expect(container.textContent!.indexOf("§ 7.")).toBeLessThan(container.textContent!.indexOf("§ 8."));
  });
});