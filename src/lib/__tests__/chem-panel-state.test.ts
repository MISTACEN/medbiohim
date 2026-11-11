import { afterEach, describe, expect, it, vi } from "vitest";

import { readChemPanelOpen, writeChemPanelOpen } from "@/lib/lectures/chemPanelState";

function stubWindow(storage?: { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void }) {
  vi.stubGlobal("window", storage ? { sessionStorage: storage } : {});
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("состояние панели химического модуля", () => {
  it("без записи панель считается закрытой", () => {
    vi.unstubAllGlobals();
    expect(readChemPanelOpen()).toBe(false);
  });

  it("запоминает открытие и закрытие", () => {
    const map = new Map<string, string>();
    stubWindow({
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => void map.set(key, value),
      removeItem: (key) => void map.delete(key),
    });

    writeChemPanelOpen(true);
    expect(map.get("mbh:chem-panel:open")).toBe("1");
    expect(readChemPanelOpen()).toBe(true);

    writeChemPanelOpen(false);
    expect(map.size).toBe(0);
    expect(readChemPanelOpen()).toBe(false);
  });

  it("не падает, если браузер запрещает storage", () => {
    stubWindow({
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    });

    expect(() => writeChemPanelOpen(true)).not.toThrow();
    expect(readChemPanelOpen()).toBe(false);
  });
});
