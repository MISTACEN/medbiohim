"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  hasToken,
  integrationImport,
  integrationImportDelete,
  integrationImports,
  type IntegrationImportInput,
  type IntegrationImportRecord,
} from "@/lib/api";

export type ImportsNotice = { tone: "ok" | "warn" | "error"; text: string } | null;

type ImportsContextValue = {
  /** true only when a MEDBIOHIM access token exists (checked after mount). */
  enabled: boolean;
  /** false until the client learned whether a token exists. */
  ready: boolean;
  items: IntegrationImportRecord[];
  loading: boolean;
  authRequired: boolean;
  error: string | null;
  notice: ImportsNotice;
  isSaving: (url: string) => boolean;
  isSaved: (url: string) => boolean;
  save: (items: IntegrationImportInput[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reload: () => Promise<void>;
  clearNotice: () => void;
};

const DISABLED: ImportsContextValue = {
  enabled: false,
  ready: false,
  items: [],
  loading: false,
  authRequired: false,
  error: null,
  notice: null,
  isSaving: () => false,
  isSaved: () => false,
  save: async () => {},
  remove: async () => {},
  reload: async () => {},
  clearNotice: () => {},
};

const ImportsContext = createContext<ImportsContextValue>(DISABLED);

const AUTH_HINT = "Нужно войти в MEDBIOHIM: сохранение работает только для вашего аккаунта.";
const UNAVAILABLE_HINT = "Сервис сохранения временно недоступен. Материалы остаются доступны по ссылкам на первоисточник.";

function isAuthError(code: string): boolean {
  return code === "UNAUTHORIZED" || code === "FORBIDDEN" || code === "INVALID_TOKEN";
}

function isDownError(code: string): boolean {
  return code === "DB_UNAVAILABLE" || code === "UPSTREAM" || code === "TIMEOUT" || code === "NETWORK" || code === "IMPORT_FAILED";
}

/** Shared save/list state for «Сохранить» actions on /university. */
export function ImportsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<IntegrationImportRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<ImportsNotice>(null);
  const [savingKeys, setSavingKeys] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!hasToken()) {
      setItems([]);
      setAuthRequired(true);
      setError(null);
      return;
    }
    setLoading(true);
    const result = await integrationImports();
    if (result.ok) {
      setItems(Array.isArray(result.data?.items) ? result.data.items : []);
      setAuthRequired(false);
      setError(null);
    } else if (isAuthError(result.error.code)) {
      setAuthRequired(true);
      setError(null);
    } else {
      setError(isDownError(result.error.code) ? UNAVAILABLE_HINT : result.error.message || "Не удалось загрузить сохранённое");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const authed = hasToken();
    setEnabled(authed);
    setReady(true);
    if (authed) void load();
  }, [load]);

  const save = useCallback(
    async (payload: IntegrationImportInput[]) => {
      if (payload.length === 0) return;
      if (!hasToken()) {
        setEnabled(false);
        setAuthRequired(true);
        setNotice({ tone: "warn", text: AUTH_HINT });
        return;
      }
      const batch = payload.slice(0, 50);
      const urls = batch.map((item) => item.url);
      setSavingKeys((previous) => [...new Set([...previous, ...urls])]);
      try {
        const result = await integrationImport(batch);
        if (result.ok) {
          const imported = Number(result.data?.imported || 0);
          const skipped = Number(result.data?.skipped || 0);
          setNotice(
            imported > 0
              ? { tone: "ok", text: skipped > 0 ? `Сохранено: ${imported}. Уже было в списке: ${skipped}.` : `Сохранено: ${imported}.` }
              : { tone: "warn", text: "Эти материалы уже есть в сохранённом." },
          );
          await load();
        } else if (isAuthError(result.error.code)) {
          setAuthRequired(true);
          setNotice({ tone: "warn", text: AUTH_HINT });
        } else {
          setNotice({ tone: "error", text: isDownError(result.error.code) ? UNAVAILABLE_HINT : result.error.message || "Не удалось сохранить материал." });
        }
      } catch {
        setNotice({ tone: "error", text: UNAVAILABLE_HINT });
      } finally {
        setSavingKeys((previous) => previous.filter((url) => !urls.includes(url)));
      }
    },
    [load],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!hasToken()) {
        setAuthRequired(true);
        setNotice({ tone: "warn", text: AUTH_HINT });
        return;
      }
      const result = await integrationImportDelete(id);
      if (result.ok) {
        setItems((previous) => previous.filter((item) => item.id !== id));
        setNotice({ tone: "ok", text: "Удалено из сохранённого." });
      } else if (isAuthError(result.error.code)) {
        setAuthRequired(true);
        setNotice({ tone: "warn", text: AUTH_HINT });
      } else {
        setNotice({ tone: "error", text: isDownError(result.error.code) ? UNAVAILABLE_HINT : result.error.message || "Не удалось удалить запись." });
      }
    },
    [],
  );

  const value = useMemo<ImportsContextValue>(
    () => ({
      enabled,
      ready,
      items,
      loading,
      authRequired,
      error,
      notice,
      isSaving: (url: string) => savingKeys.includes(url),
      isSaved: (url: string) => items.some((item) => item.url === url),
      save,
      remove,
      reload: load,
      clearNotice: () => setNotice(null),
    }),
    [enabled, ready, items, loading, authRequired, error, notice, savingKeys, save, remove, load],
  );

  return <ImportsContext.Provider value={value}>{children}</ImportsContext.Provider>;
}

export function useImports(): ImportsContextValue {
  return useContext(ImportsContext);
}
