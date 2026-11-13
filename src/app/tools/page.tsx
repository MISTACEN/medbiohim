"use client";

/**
 * Инструменты — единый хаб: Атлас, Калькуляторы и ИИ-тьютор в одном месте
 * вместо трёх отдельных страниц в меню. Старые маршруты (/atlas, /calculators,
 * /tutor) редиректят сюда с сохранением параметров (?card=, ?q=, ?tab=).
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Bot, Calculator, Microscope } from "lucide-react";
import clsx from "clsx";
import { AtlasView } from "@/components/tools/AtlasView";
import { CalculatorsView } from "@/components/tools/CalculatorsView";
import { StudyAssistant } from "@/components/study/StudyAssistant";

type Tab = "atlas" | "calculators" | "tutor";

const TABS: Array<{ id: Tab; label: string; icon: typeof Bot; hint: string }> = [
  { id: "atlas", label: "Атлас", icon: Microscope, hint: "препараты и электронограммы" },
  { id: "calculators", label: "Калькуляторы", icon: Calculator, hint: "клиника, лаборатория, дозы" },
  { id: "tutor", label: "ИИ-тьютор", icon: Bot, hint: "чат с контекстом предметов" },
];

function isValidTab(value: string | null): value is Tab {
  return value === "atlas" || value === "calculators" || value === "tutor";
}

function ToolsPageInner() {
  const search = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const fromUrl = search.get("tab");
    return isValidTab(fromUrl) ? fromUrl : "atlas";
  });

  useEffect(() => {
    const fromUrl = search.get("tab");
    if (isValidTab(fromUrl) && fromUrl !== tab) setTab(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      {tab === "atlas" ? <AtlasView /> : null}
      {tab === "calculators" ? <CalculatorsView /> : null}
      {tab === "tutor" ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            Полный чат с историей и выбором предмета — <Link href="/tutor" className="font-semibold text-[var(--primary)]">на странице тьютора</Link>. Здесь — быстрый ассистент.
          </p>
          <StudyAssistant />
        </div>
      ) : null}
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
