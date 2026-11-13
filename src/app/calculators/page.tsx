"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * /calculators переехал в хаб /tools (вкладка «Калькуляторы»).
 * Сам вид — src/components/tools/CalculatorsView.tsx.
 */
function CalculatorsRedirectInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const search = new URLSearchParams();
    search.set("tab", "calculators");
    for (const key of ["calculator", "id"]) {
      const value = params.get(key);
      if (value) search.set(key, value);
    }
    router.replace("/tools?" + search.toString());
  }, [router, params]);

  return (
    <div className="flex items-center gap-2 p-8 text-sm text-[var(--muted)]">
      <Loader2 className="h-5 w-5 animate-spin" /> Калькуляторы переехали в «Инструменты» — открываем…
    </div>
  );
}

export default function CalculatorsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[var(--muted)]">Загружаем…</div>}>
      <CalculatorsRedirectInner />
    </Suspense>
  );
}
