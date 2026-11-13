"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * /atlas переехал в хаб /tools (вкладка «Атлас»): сохраняем deep-links
 * (?card=…, ?lesson=…) при редиректе. Сам вид — src/components/tools/AtlasView.tsx.
 */
function AtlasRedirectInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const search = new URLSearchParams();
    search.set("tab", "atlas");
    for (const key of ["card", "lesson"]) {
      const value = params.get(key);
      if (value) search.set(key, value);
    }
    router.replace("/tools?" + search.toString());
  }, [router, params]);

  return (
    <div className="flex items-center gap-2 p-8 text-sm text-[var(--muted)]">
      <Loader2 className="h-5 w-5 animate-spin" /> Атлас переехал в «Инструменты» — открываем…
    </div>
  );
}

export default function AtlasPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[var(--muted)]">Загружаем атлас…</div>}>
      <AtlasRedirectInner />
    </Suspense>
  );
}
