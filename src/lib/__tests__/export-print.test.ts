import { afterEach, describe, expect, it, vi } from "vitest";

import { printCurrentView, resetPrintScope } from "@/lib/chemistry/export";

type Listener = () => void;

/**
 * Мини-окружение браузера: window.print, слушатели событий и <html> с
 * атрибутами. Нам важно проверить не рендер, а порядок: ограничение печати
 * ставится до print() и снимается после закрытия диалога.
 */
function stubEnv(options: { hasPanel: boolean }) {
  const listeners = new Map<string, Set<Listener>>();
  const attributes = new Map<string, string>();
  const print = vi.fn();
  const documentElement = {
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    removeAttribute: (name: string) => void attributes.delete(name),
  };
  vi.stubGlobal("window", {
    print,
    addEventListener: (type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    },
  });
  vi.stubGlobal("document", {
    documentElement,
    querySelector: (selector: string) =>
      options.hasPanel && selector.includes("data-chem-print-root") ? {} : null,
  });
  return {
    attributes,
    print,
    emit: (type: string) => [...(listeners.get(type) ?? [])].forEach((listener) => listener()),
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("печать химического модуля", () => {
  it("без панели печатает страницу как раньше", () => {
    const env = stubEnv({ hasPanel: false });
    expect(printCurrentView()).toBe(true);
    expect(env.print).toHaveBeenCalledTimes(1);
    expect(env.attributes.size).toBe(0);
  });

  it("с открытой панелью печатает только её", () => {
    const env = stubEnv({ hasPanel: true });
    expect(printCurrentView()).toBe(true);
    expect(env.print).toHaveBeenCalledTimes(1);
    // Атрибут выставлен до print(): print-стили должны сработать сразу.
    expect(env.attributes.get("data-print-scope")).toBe("chem-panel");
  });

  it("снимает ограничение после закрытия диалога печати", () => {
    const env = stubEnv({ hasPanel: true });
    printCurrentView();
    env.emit("afterprint");
    expect(env.attributes.size).toBe(0);
    expect(env.listenerCount("afterprint")).toBe(0);
    expect(env.listenerCount("focus")).toBe(0);
  });

  it("снимает ограничение и по focus, если afterprint не пришёл", () => {
    const env = stubEnv({ hasPanel: true });
    printCurrentView();
    env.emit("focus");
    expect(env.attributes.has("data-print-scope")).toBe(false);
  });

  it("resetPrintScope снимает ограничение при закрытии панели", () => {
    const env = stubEnv({ hasPanel: true });
    printCurrentView();
    resetPrintScope();
    expect(env.attributes.has("data-print-scope")).toBe(false);
  });
});
