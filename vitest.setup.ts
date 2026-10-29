import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

/**
 * `AbortSignal.timeout` есть в Node, но в jsdom-окружении статический метод
 * может отсутствовать: клиентский код (`src/lib/auth/session.ts`) использует его
 * как таймаут refresh-запроса, поэтому полифилл держит тесты на реальном коде.
 */
if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout !== "function") {
  AbortSignal.timeout = (ms: number): AbortSignal => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("TimeoutError", "TimeoutError")), ms);
    return controller.signal;
  };
}

afterEach(async () => {
  // jsdom-тесты — единственные, кому нужен cleanup; в node-проекте DOM нет.
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
