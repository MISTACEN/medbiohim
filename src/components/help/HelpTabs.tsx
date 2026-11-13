"use client";

/**
 * Табы «Справка / Что нового» для /help: страница помощи и changelog
 * объединены, чтобы не плодить два полупустых раздела в меню.
 */
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { HelpCircle, Sparkles } from "lucide-react";
import clsx from "clsx";

type Tab = "faq" | "news";

function isValidTab(value: string | null): value is Tab {
  return value === "faq" || value === "news";
}

function HelpTabsInner({ initialTab, faqSection, newsSection }: {
  initialTab: Tab;
  faqSection: React.ReactNode;
  newsSection: React.ReactNode;
}) {
  const search = useSearchParams();
  const [tab, setTab] = useState<Tab>(initialTab);

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
    <>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Разделы помощи">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "faq"}
          onClick={() => switchTab("faq")}
          className={clsx(
            "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition",
            tab === "faq"
              ? "border-transparent bg-[var(--primary)] text-white"
              : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]",
          )}
        >
          <HelpCircle className="h-4 w-4" /> Справка
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "news"}
          onClick={() => switchTab("news")}
          className={clsx(
            "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition",
            tab === "news"
              ? "border-transparent bg-[var(--primary)] text-white"
              : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]",
          )}
        >
          <Sparkles className="h-4 w-4" /> Что нового
        </button>
      </div>
      {tab === "faq" ? faqSection : newsSection}
    </>
  );
}

export function HelpTabs(props: { initialTab: Tab; faqSection: React.ReactNode; newsSection: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <HelpTabsInner {...props} />
    </Suspense>
  );
}
