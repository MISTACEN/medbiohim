"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { setTokens } from "@/lib/api";
import { isOAuthCallbackHash, parseOAuthTokensFromUrl } from "@/lib/supabase";

function AuthHashCatcherInner() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const href = window.location.href;
    // Только hash-ответ OAuth. Query error=… приходит от нашего же редиректа
    // (отмена привязки Google) и разбирается страницей, а не здесь: иначе
    // получится вечная перезагрузка /login?error=… сама в себя.
    if (!isOAuthCallbackHash(href)) return;

    const parsed = parseOAuthTokensFromUrl(href);
    if (parsed.access_token) {
      setTokens(parsed.access_token, parsed.refresh_token);
      // The tokens live in the URL hash (unavailable to useSearchParams);
      // the clean URL keeps pathname and the regular query string.
      const qs = searchParams.toString();
      const clean = window.location.pathname + (qs ? `?${qs}` : "");
      window.history.replaceState({}, "", clean || "/");
      window.location.href = "/";
      return;
    }
    if (parsed.error) {
      window.history.replaceState({}, "", "/login");
      window.location.href = `/login?error=${encodeURIComponent(
        parsed.error_description || parsed.error
      )}`;
    }
  }, [searchParams]);

  return null;
}

/**
 * Supabase may redirect to Site URL (/) with #access_token=...
 * instead of /auth/callback. Catch tokens on any page.
 */
export function AuthHashCatcher() {
  return (
    <Suspense fallback={null}>
      <AuthHashCatcherInner />
    </Suspense>
  );
}
