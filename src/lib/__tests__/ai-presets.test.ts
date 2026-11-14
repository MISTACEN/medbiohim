import { describe, expect, it } from "vitest";

import {
  AI_PRESETS,
  PRESET_EXCERPT_LIMIT,
  buildPresetMessage,
  presetById,
  type AiPresetId,
} from "@/lib/ai/presets";

describe("ИИ-действия по лекции", () => {
  it("содержит пять разных пресетов с непустыми подписями", () => {
    expect(AI_PRESETS).toHaveLength(5);
    const ids = new Set(AI_PRESETS.map((preset) => preset.id));
    expect(ids.size).toBe(5);
    for (const preset of AI_PRESETS) {
      expect(preset.label.trim().length).toBeGreaterThan(2);
      expect(preset.instruction.trim().length).toBeGreaterThan(20);
    }
    const instructions = new Set(AI_PRESETS.map((preset) => preset.instruction));
    expect(instructions.size).toBe(5);
  });

  it("сообщение содержит тему, предмет и запрет на выдумки", () => {
    const message = buildPresetMessage(presetById("exam"), {
      title: "Физиология сердца",
      subjectSlug: "physiology",
      excerpt: "Сердечный цикл состоит из систолы и диастолы.",
    });
    expect(message).toContain("Тема: «Физиология сердца»");
    expect(message).toContain("предмет: physiology");
    expect(message).toContain("Сердечный цикл");
    expect(message).toContain("Опирайся только на материалы курса");
  });

  it("обрезает фрагмент лекции, чтобы не отправлять весь текст", () => {
    const message = buildPresetMessage(presetById("mnemonic"), {
      title: "Тема",
      excerpt: "слово ".repeat(2000),
    });
    expect(message.length).toBeLessThan(PRESET_EXCERPT_LIMIT + 400);
    expect(message).toContain("Фрагмент лекции:");
  });

  it("схема просит именно блок mermaid, а не текст", () => {
    const scheme = presetById("scheme");
    const message = buildPresetMessage(scheme, { title: "Гемостаз" });
    expect(scheme.instruction).toContain("mermaid");
    expect(message).toContain("```mermaid");
    expect(message).toContain("flowchart TD");
  });

  it("без темы и фрагмента сообщение остаётся корректным", () => {
    const message = buildPresetMessage(presetById("child"), { title: "   " });
    expect(message).toContain("Тема: «текущая тема»");
    expect(message).not.toContain("Фрагмент лекции");
    expect(message).not.toContain("\n\n\n");
  });

  it("неизвестный id не ломает выбор пресета", () => {
    const fallback = presetById("unknown" as AiPresetId);
    expect(fallback.id).toBe(AI_PRESETS[0].id);
  });
});
