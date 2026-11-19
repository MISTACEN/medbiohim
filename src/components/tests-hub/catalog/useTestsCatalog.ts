"use client";

/**
 * Данные и действия страницы «Тесты»: переключение вкладок (тесты, химия,
 * история), история попыток и банк по химии. Разметка — в компонентах
 * `TestsViewNav`, `ChemistryBank` и `AttemptsHistory` этой папки.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { getChemistryMaster, hasToken, listMyAttempts } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { useApiRequest } from "@/hooks/useApiRequest";
import { useAuth } from "@/components/auth/AuthProvider";
import type { View } from "./model";

export type TestsCatalogController = ReturnType<typeof useTestsCatalog>;

export function useTestsCatalog() {
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("view");
  // Deep-ссылка с главной (/tests?open=<id>): TestsHub подсветит карточку теста.
  // Параметр из URL не удаляем, чтобы подсветка работала и после обновления страницы.
  const openTestId = (searchParams.get("open") || "").trim();
  const { user, loading: authLoading } = useAuth();
  const [view, setView] = useState<View>("tests");
  const [chemistryPage, setChemistryPage] = useState(1);
  const [chemistryQuery, setChemistryQuery] = useState("");
  const [chemistryKind, setChemistryKind] = useState("");
  const [chemistryFormula, setChemistryFormula] = useState("");

  useEffect(() => {
    if (requestedView === "chemistry" || requestedView === "history" || requestedView === "tests") setView(requestedView);
  }, [requestedView]);

  function selectView(next: View) {
    setView(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next === "tests") url.searchParams.delete("view");
      else url.searchParams.set("view", next);
      window.history.replaceState(null, "", url.toString());
    }
  }

  // D9: история попыток через useApiRequest — ручные cancelled-флаги и
  // дублирующая ручная загрузка заменены на reload() хука.
  const {
    data: attemptsLoad,
    loading: attemptsLoading,
    error: attemptsLoadError,
    reload: reloadAttempts,
  } = useApiRequest(
    async (signal) => {
      if (authLoading || !hasToken()) return null;
      const result = await listMyAttempts(undefined, user?.groupId, { signal });
      if (!result.ok) throw new Error(describeApiError(result.error));
      return Array.isArray(result.data?.items) ? result.data.items : [];
    },
    [authLoading, user?.groupId]
  );
  const attempts = attemptsLoad ?? [];
  const attemptsError = attemptsLoadError ?? "";

  // D9: банк по химии — тот же хук; пауза 250 мс до запроса сохранена,
  // отмена при смене запроса/страницы выполняется через AbortSignal.
  const { data: chemLoad, loading: chemistryLoading, error: chemistryLoadError } = useApiRequest(
    async (signal) => {
      if (authLoading || !hasToken() || view !== "chemistry") return null;
      await new Promise((resolve) => setTimeout(resolve, 250));
      const result = await getChemistryMaster(
        {
          q: chemistryQuery,
          kind: chemistryKind,
          formula: chemistryFormula,
          page: chemistryPage,
          limit: 12,
        },
        { signal },
      );
      if (!result.ok) throw new Error(result.error?.message || "Не удалось загрузить банк по химии.");
      return result.data;
    },
    [authLoading, view, chemistryQuery, chemistryKind, chemistryFormula, chemistryPage]
  );
  const chemistryItems = chemLoad?.items ?? [];
  const chemistryTotal = Number(chemLoad?.pagination?.total || 0);
  const chemistryPages = Math.max(1, Number(chemLoad?.pagination?.pages || 1));
  const chemistryError = chemistryLoadError ?? "";

  return {
    view, selectView, openTestId, authLoading,
    attempts, attemptsError, attemptsLoading, reloadAttempts,
    chemistryPage, setChemistryPage,
    chemistryQuery, setChemistryQuery,
    chemistryKind, setChemistryKind,
    chemistryFormula, setChemistryFormula,
    chemistryItems, chemistryTotal, chemistryPages, chemistryError, chemistryLoading,
  };
}
