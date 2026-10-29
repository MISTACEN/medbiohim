import { describe, expect, it } from "vitest";

import { resolveLinkReturn } from "@/lib/auth/link-return";

describe("возврат после привязки Google", () => {
  it("успешная привязка ведёт в настройки, где состояние проверяется по identities", () => {
    expect(resolveLinkReturn("?linked=google")).toEqual({
      kind: "linked",
      target: "/settings?linked=1",
      message: "Привязка завершена. Проверяем аккаунт…",
    });
    expect(resolveLinkReturn("?linked=1").kind).toBe("linked");
  });

  it("ошибка OAuth важнее флага linked и передаётся текстом", () => {
    const result = resolveLinkReturn("?linked=google&error=access_denied&error_description=User%20denied");
    expect(result.kind).toBe("error");
    expect(result.target).toBe("/settings?error=User%20denied");
    expect(result.message).toContain("User denied");
  });

  it("обычный вход без параметров привязки не меняет маршрут", () => {
    expect(resolveLinkReturn("")).toEqual({ kind: "none", target: "/", message: "" });
    expect(resolveLinkReturn("?recovery=1").kind).toBe("none");
  });
});
