import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AttestationRunner from "@/components/attestations/AttestationRunner";
import { ChemRichText } from "@/components/chemistry/ChemRichText";
import type { Attestation } from "@/types/attestations";

const PHOTO = "https://example.com/ethanol.png";

/**
 * H9: химическая разметка в аттестациях. Раньше [chem:…] и ```chem
 * выводились сырым текстом, хотя в лекциях и тестах они уже работали.
 */
describe("ChemRichText", () => {
  it("рендерит инлайн-разметку как рисунок и не оставляет служебный текст", () => {
    render(<ChemRichText text={`Этанол: [chem:photoUrl=${PHOTO} alt=Этанол] — спирт.`} />);

    const image = screen.getByRole("img", { name: "Этанол" });
    expect(image.getAttribute("src")).toBe(PHOTO);
    expect(screen.queryByText(/\[chem:/)).toBeNull();
    expect(screen.getByText(/Этанол:/)).toBeTruthy();
  });

  it("рендерит ```chem блок и не ломает обычный текст", () => {
    render(<ChemRichText text={"До\n```chem\nphotoUrl=" + PHOTO + "\n```\nПосле"} />);
    expect(screen.getByRole("img")).toBeTruthy();
    expect(screen.getByText("До")).toBeTruthy();
    expect(screen.getByText("После")).toBeTruthy();
  });
});

describe("AttestationRunner · химия", () => {
  const attestation: Attestation = {
    slug: "colloquium-1",
    subject_slug: "chemistry_organic_physical",
    type: "colloquium",
    title: "Коллоквиум по химии",
    is_published: true,
    stages: [
      {
        id: "stage-1",
        title: "Этап 1",
        items: [
          {
            id: "theory-1",
            kind: "theory",
            title: "Спирты",
            body: "Строение этанола.",
            answer: `Структура: [chem:photoUrl=${PHOTO} alt=Этанол]`,
          },
          {
            id: "test-1",
            kind: "test",
            title: "Выберите спирт",
            options: [`[chem:photoUrl=${PHOTO} alt=Этанол]`, "Пропан"],
            correct: [0],
          },
        ],
      },
    ],
  };

  it("конспект ответа и варианты теста идут через ChemRichText", () => {
    render(<AttestationRunner attestation={attestation} />);

    fireEvent.click(screen.getByRole("button", { name: /Конспект ответа/ }));
    expect(screen.queryByText(/\[chem:/)).toBeNull();

    const images = screen.getAllByRole("img", { name: "Этанол" });
    expect(images.length).toBeGreaterThanOrEqual(2);
  });
});
