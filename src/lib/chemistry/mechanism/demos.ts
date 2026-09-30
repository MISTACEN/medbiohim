import type { Mechanism } from "./types";

/** Classic SN2: HO⁻ + CH₃Br → CH₃OH + Br⁻ (schematic). */
export const sn2Mechanism: Mechanism = {
  id: "sn2-methyl-bromide",
  name: "SN2",
  reactionSummary: "HO⁻ + CH₃Br → CH₃OH + Br⁻",
  provenance: { note: "Educational schematic — not atom coordinates from RDKit" },
  steps: [
    {
      id: "sn2-1",
      title: "Шаг 1 · атака нуклеофила (concerted)",
      description: "Пара электронов HO⁻ атакует углерод с тыла; связь C–Br разрывается.",
      note: "Переходное состояние: пентакоординационный C",
      atoms: [
        { id: "o", label: "HO⁻", x: 60, y: 140 },
        { id: "c", label: "C", x: 210, y: 140 },
        { id: "br", label: "Br", x: 340, y: 140 },
        { id: "h1", label: "H", x: 210, y: 70 },
        { id: "h2", label: "H", x: 250, y: 180 },
        { id: "h3", label: "H", x: 170, y: 180 },
      ],
      bonds: [
        { id: "c-br", from: "c", to: "br", order: 1 },
        { id: "c-h1", from: "c", to: "h1", order: 1 },
        { id: "c-h2", from: "c", to: "h2", order: 1 },
        { id: "c-h3", from: "c", to: "h3", order: 1 },
      ],
      arrows: [
        {
          id: "a1",
          type: "curly",
          from: { atomId: "o" },
          to: { atomId: "c" },
          curvature: 0.25,
          label: "e⁻ pair",
        },
        {
          id: "a2",
          type: "curly",
          from: { x: 270, y: 140 },
          to: { atomId: "br" },
          curvature: -0.2,
          label: "lg",
        },
      ],
    },
    {
      id: "sn2-2",
      title: "Шаг 2 · продукты",
      description: "Инверсия Уолдена у углерода; Br⁻ уходит.",
      atoms: [
        { id: "c", label: "C", x: 180, y: 140 },
        { id: "o", label: "OH", x: 80, y: 140 },
        { id: "br", label: "Br⁻", x: 340, y: 140 },
        { id: "h1", label: "H", x: 180, y: 70 },
        { id: "h2", label: "H", x: 220, y: 190 },
        { id: "h3", label: "H", x: 140, y: 190 },
      ],
      bonds: [
        { id: "c-o", from: "c", to: "o", order: 1 },
        { id: "c-h1", from: "c", to: "h1", order: 1 },
        { id: "c-h2", from: "c", to: "h2", order: 1 },
        { id: "c-h3", from: "c", to: "h3", order: 1 },
      ],
      arrows: [],
    },
  ],
};

export const carbonylAdditionMechanism: Mechanism = {
  id: "carbonyl-addition",
  name: "Нуклеофильное присоединение к C=O",
  reactionSummary: "Nu⁻ + R₂C=O → tetrahedral intermediate",
  steps: [
    {
      id: "ca-1",
      title: "Атака по карбонильному C",
      note: "π-связь C=O → lone pair на O",
      atoms: [
        { id: "nu", label: "Nu⁻", x: 50, y: 150 },
        { id: "c", label: "C", x: 200, y: 150 },
        { id: "o", label: "O", x: 300, y: 150 },
        { id: "r1", label: "R", x: 200, y: 70 },
        { id: "r2", label: "R", x: 200, y: 230 },
      ],
      bonds: [
        { id: "c-o", from: "c", to: "o", order: 2 },
        { id: "c-r1", from: "c", to: "r1", order: 1 },
        { id: "c-r2", from: "c", to: "r2", order: 1 },
      ],
      arrows: [
        {
          id: "a1",
          type: "curly",
          from: { atomId: "nu" },
          to: { atomId: "c" },
          curvature: 0.3,
        },
        {
          id: "a2",
          type: "curly",
          from: { x: 250, y: 145 },
          to: { atomId: "o" },
          curvature: 0.35,
          label: "π e⁻",
        },
      ],
    },
  ],
};

export const mechanismDemos = [sn2Mechanism, carbonylAdditionMechanism];
