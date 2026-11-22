"use client";

/**
 * Инструменты — единый хаб: Атлас, Калькуляторы и ИИ-тьютор в одном месте
 * вместо трёх отдельных страниц в меню. Старые маршруты (/atlas, /calculators,
 * /tutor) редиректят сюда с сохранением параметров (?card=, ?q=, ?tab=).
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Bot, Calculator, Languages } from "lucide-react";
import clsx from "clsx";

import { CalculatorsView } from "@/components/tools/CalculatorsView";
import { TutorWorkspace } from "@/components/tutor/TutorWorkspace";

type Tab = "calculators" | "tutor" | "languages";

/**
 * Старые адреса инструментов больше не открываются здесь: атлас — часть
 * гистологии, периодическая таблица и растворимость — часть химии.
 */
const LEGACY_TABS: Record<string, string> = {
  atlas: "/subjects/histology?tab=trainer",
  periodic: "/subjects/chemistry_organic_physical?tab=chem&section=elements",
  solubility: "/subjects/chemistry_organic_physical?tab=chem&section=solubility",
};

const TABS: Array<{ id: Tab; label: string; icon: typeof Bot; hint: string }> = [
  { id: "calculators", label: "Калькуляторы", icon: Calculator, hint: "клиника, лаборатория, дозы" },
  { id: "tutor", label: "ИИ-тьютор", icon: Bot, hint: "чат с контекстом предметов" },
  { id: "languages", label: "Языки", icon: Languages, hint: "латынь: рецепты и термины, английский: топики" },
];

function isValidTab(value: string | null): value is Tab {
  return (
    value === "calculators" ||
    value === "tutor" ||
    value === "languages"
  );
}

function ToolsPageInner() {
  const search = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const fromUrl = search.get("tab");
    return isValidTab(fromUrl) ? fromUrl : "calculators";
  });

  useEffect(() => {
    const fromUrl = search.get("tab");
    if (isValidTab(fromUrl) && fromUrl !== tab) setTab(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Старые ссылки (?tab=atlas, ?tab=periodic, ?tab=solubility) уводят в предмет,
  // которому инструмент принадлежит.
  useEffect(() => {
    const target = LEGACY_TABS[search.get("tab") || ""];
    if (target) window.location.replace(target);
  }, [search]);

  function switchTab(next: Tab) {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(null, "", url.toString());
    } catch { /* не критично */ }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Инструменты">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => switchTab(item.id)}
            className={clsx(
              "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition",
              tab === item.id
                ? "border-transparent bg-[var(--primary)] text-white"
                : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]",
            )}
            title={item.hint}
          >
            <item.icon className="h-4 w-4" /> {item.label}
          </button>
        ))}
      </div>

      {tab === "calculators" ? <CalculatorsView /> : null}
      {tab === "languages" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/latin"
            className="card flex items-start gap-3 p-4 hover:border-[var(--primary)]"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold">Латынь</span>
              <span className="mt-0.5 block text-sm text-[var(--muted)]">
                100 рецептов по Чернявскому, лексические минимумы, афоризмы, фарма-терминология,
                диагнозы.
              </span>
            </span>
          </Link>
          <Link
            href="/english"
            className="card flex items-start gap-3 p-4 hover:border-[var(--primary)]"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold">Английский</span>
              <span className="mt-0.5 block text-sm text-[var(--muted)]">
                Топики с лексикой: письмо студента-медика, будущая профессия, ДВГМУ, врач-биохимик.
              </span>
            </span>
          </Link>
        </div>
      ) : null}
      {tab === "tutor" ? <TutorWorkspace /> : null}
    </div>
  );
}

export default function ToolsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[var(--muted)]">Загружаем инструменты…</div>}>
      <ToolsPageInner />
    </Suspense>
  );
}
