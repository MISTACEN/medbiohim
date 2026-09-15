"use client";

import { useEffect } from "react";
import { setTokens } from "@/lib/api";
import { parseOAuthTokensFromUrl } from "@/lib/supabase";

/**
 * Supabase may redirect to Site URL (/) with #access_token=...
 * instead of /auth/callback. Catch tokens on any page.
 */
export function AuthHashCatcher() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const href = window.location.href;
    if (!href.includes("access_token=") && !href.includes("error=")) return;

    const parsed = parseOAuthTokensFromUrl(href);
    if (parsed.access_token) {
      setTokens(parsed.access_token, parsed.refresh_token);
      const clean = window.location.pathname + window.location.search;
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
  }, []);

  return null;
}
