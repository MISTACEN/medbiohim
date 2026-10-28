/**
 * MAIN-world network interceptor for the MEDBIOHIM importer.
 *
 * Injected as a `world: "MAIN"` content script at document_start, so it can wrap
 * `window.fetch` / `XMLHttpRequest` before the platform's own scripts run.
 * It never touches `chrome.*` APIs (MAIN world has none) and never breaks the
 * page: every patch passes through to the original implementation and every
 * failure is swallowed.
 *
 * Guarantees (see docs/EXTERNAL-PLATFORMS-REVERSE.md and anti-goal U9):
 * - Captures ONLY while the user pressed "Разобрать страницу" in the popup —
 *   the isolated-world content script arms it via a CustomEvent for a limited
 *   TTL and disarms it when the preview is closed. No background listening.
 * - Captures ONLY JSON responses of the current tab AND current origin:
 *   cross-origin fetches and anything that looks like auth/login/token traffic
 *   are skipped. No cookies, no tokens, no request bodies are read.
 * - Sends nothing anywhere: found list-like payloads are announced back to the
 *   content script via a CustomEvent and end up in the manual preview, where
 *   the user still picks items and confirms the import.
 */

(() => {
  "use strict";

  if (window.__medbiohimNetworkInterceptor) return;
  Object.defineProperty(window, "__medbiohimNetworkInterceptor", {
    value: true,
    enumerable: false,
  });

  const ARM_EVENT = "medbiohim:arm";
  const DISARM_EVENT = "medbiohim:disarm";
  const CAPTURE_EVENT = "medbiohim:capture";

  const DEFAULT_TTL_MS = 45000;
  const MAX_TTL_MS = 120000;
  const MAX_ITEMS = 60;
  const MAX_DEPTH = 4;
  const MAX_TITLE = 220;

  /** Endpoints that must never be inspected, even while armed. */
  const DENY_URL = /login|logout|auth|token|password|passwd|session|captcha|signin|oauth/i;
  /** Object keys that plausibly hold a human title inside platform JSON. */
  const TITLE_KEYS = ["title", "name", "question", "text", "label", "theme", "topic", "lesson", "header", "heading"];
  /** Object keys that plausibly hold a link. */
  const URL_KEYS = ["url", "link", "href", "slug"];

  const state = { armedUntil: 0 };

  function isArmed() {
    return Date.now() < state.armedUntil;
  }

  /**
   * `CustomEvent.detail` objects are not reliably readable across extension
   * worlds, so the isolated-world content script may send either a JSON string
   * or a plain number. Anything unreadable falls back to the default TTL.
   */
  function armTtl(detail) {
    let raw = detail;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = Number(raw);
      }
    }
    const ttl = Number(raw && typeof raw === "object" ? raw.ttl : raw);
    return Number.isFinite(ttl) && ttl > 0 && ttl <= MAX_TTL_MS ? ttl : DEFAULT_TTL_MS;
  }

  window.addEventListener(ARM_EVENT, (event) => {
    state.armedUntil = Date.now() + armTtl(event && event.detail);
  });

  window.addEventListener(DISARM_EVENT, () => {
    state.armedUntil = 0;
  });

  function sameOrigin(url) {
    try {
      return new URL(url, window.location.href).origin === window.location.origin;
    } catch {
      return false;
    }
  }

  function pickString(object, keys, min, max) {
    for (const key of keys) {
      const value = object ? object[key] : undefined;
      if (typeof value === "string") {
        const clean = value.replace(/\s+/g, " ").trim();
        if (clean.length >= min && clean.length <= max) return clean;
      }
    }
    return "";
  }

  /**
   * Heuristic: a "list of materials/questions" is an array (or an object
   * containing arrays) of plain objects that carry a title-ish and a link-ish
   * string. Everything else — settings, counters, user profiles — is ignored.
   * Only {title, url} pairs survive; payload content stays on the page.
   */
  function extractItems(payload) {
    const out = [];
    const seen = new Set();
    const walk = (value, depth) => {
      if (out.length >= MAX_ITEMS || depth > MAX_DEPTH) return;
      if (Array.isArray(value)) {
        for (const entry of value) walk(entry, depth + 1);
        return;
      }
      if (!value || typeof value !== "object") return;
      const title = pickString(value, TITLE_KEYS, 4, 300);
      const rawUrl = pickString(value, URL_KEYS, 1, 2000);
      if (title && rawUrl) {
        try {
          const url = new URL(rawUrl, window.location.href).toString();
          if (/^https?:/i.test(url)) {
            const key = `${url}|${title}`;
            if (!seen.has(key)) {
              seen.add(key);
              out.push({ title: title.slice(0, MAX_TITLE), url });
            }
          }
        } catch {
          /* unusable url — skip */
        }
      }
      for (const child of Object.values(value)) walk(child, depth + 1);
    };
    walk(payload, 0);
    return out;
  }

  function capture(requestUrl, payload) {
    if (!isArmed() || !payload || typeof payload !== "object") return;
    if (DENY_URL.test(requestUrl) || !sameOrigin(requestUrl)) return;
    const items = extractItems(payload);
    if (!items.length) return;
    try {
      const url = new URL(requestUrl, window.location.href).toString();
      // JSON string, not an object: only primitive/string details survive the
      // MAIN → isolated world boundary.
      window.dispatchEvent(new CustomEvent(CAPTURE_EVENT, { detail: JSON.stringify({ url, items }) }));
    } catch {
      /* reporting must never break the page */
    }
  }

  /* ------------------------------ fetch ------------------------------ */

  if (typeof window.fetch === "function" && !window.fetch.__medbiohimPatched) {
    const originalFetch = window.fetch;
    const patchedFetch = function patchedFetch(...args) {
      const promise = originalFetch.apply(this, args);
      try {
        const input = args[0];
        const url = input instanceof Request ? input.url : String(input || "");
        promise
          .then((response) => {
            try {
              if (!response || !response.ok) return;
              const type = (response.headers && response.headers.get && response.headers.get("content-type")) || "";
              if (!/json/i.test(type)) return;
              response
                .clone()
                .json()
                .then((data) => capture(url, data))
                .catch(() => {});
            } catch {
              /* ignore */
            }
          })
          .catch(() => {});
      } catch {
        /* ignore */
      }
      return promise;
    };
    patchedFetch.__medbiohimPatched = true;
    window.fetch = patchedFetch;
  }

  /* --------------------------- XMLHttpRequest ------------------------ */

  if (typeof XMLHttpRequest === "function" && !XMLHttpRequest.prototype.__medbiohimPatched) {
    const proto = XMLHttpRequest.prototype;
    const originalOpen = proto.open;
    const originalSend = proto.send;

    proto.open = function patchedOpen(method, url, ...rest) {
      try {
        this.__medbiohimUrl = String(url || "");
      } catch {
        /* ignore */
      }
      return originalOpen.call(this, method, url, ...rest);
    };

    proto.send = function patchedSend(...args) {
      if (!this.__medbiohimListener) {
        this.__medbiohimListener = true;
        this.addEventListener("load", () => {
          try {
            const type = (this.getResponseHeader && this.getResponseHeader("content-type")) || "";
            if (!/json/i.test(type)) return;
            if (this.responseType === "" || this.responseType === "text") {
              capture(this.__medbiohimUrl, JSON.parse(this.responseText));
            } else if (this.responseType === "json") {
              capture(this.__medbiohimUrl, this.response);
            }
          } catch {
            /* ignore */
          }
        });
      }
      return originalSend.apply(this, args);
    };

    proto.__medbiohimPatched = true;
  }
})();
