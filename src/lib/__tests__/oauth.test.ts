import { describe, expect, it } from "vitest";

import { isOAuthCallbackHash, parseOAuthTokensFromUrl } from "@/lib/supabase";

describe("isOAuthCallbackHash", () => {
  it("не принимает query-ошибку за OAuth-возврат", () => {
    // Именно эта ссылка уходила в бесконечную перезагрузку: перехватчик видел
    // error=… в query и снова редиректил на /login?error=…
    expect(isOAuthCallbackHash("https://medbiohim.vercel.app/login?error=access_denied")).toBe(false);
    expect(isOAuthCallbackHash("https://medbiohim.vercel.app/settings?error_description=denied")).toBe(false);
    expect(isOAuthCallbackHash("https://medbiohim.vercel.app/auth/callback?error=access_denied")).toBe(false);
  });

  it("принимает hash-ответ OAuth с токенами или ошибкой", () => {
    expect(isOAuthCallbackHash("https://site/#access_token=abc&refresh_token=def")).toBe(true);
    expect(isOAuthCallbackHash("https://site/#error=access_denied&error_description=denied")).toBe(true);
    expect(isOAuthCallbackHash("https://site/")).toBe(false);
  });
});

describe("parseOAuthTokensFromUrl", () => {
  it("читает токены и ошибку из hash", () => {
    expect(parseOAuthTokensFromUrl("https://site/#access_token=a&refresh_token=b")).toMatchObject({
      access_token: "a",
      refresh_token: "b",
    });
    expect(parseOAuthTokensFromUrl("https://site/#error=access_denied&error_description=nope")).toMatchObject({
      error: "access_denied",
      error_description: "nope",
    });
  });

  it("понимает причину отказа из query для страниц, которые её показывают", () => {
    expect(parseOAuthTokensFromUrl("https://site/auth/callback?error=access_denied")).toMatchObject({
      error: "access_denied",
    });
  });
});
