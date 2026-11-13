"use client";

/**
 * Карточки: три вкладки.
 *  - «Повторение» — SRS-дека (SM-2) из банка вопросов и личных карточек;
 *  - «Мои паки» — колоды пользователя (вручную или ИИ из лекций), сессия
 *    «знаю / не знаю», публикация в мастерскую;
 *  - «Мастерская» — опубликованные паки группы, импорт к себе.
 *
 * Не экзаменационные билеты — они на /tickets.
 */
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Brain, Layers, Store } from "lucide-react";
import clsx from "clsx";
import { SrsReview } from "@/components/cards/SrsReview";
import { PacksPanel, SharedPacksPanel } from "@/components/cards/PacksPanel";

type Tab = "review" | "packs" | "workshop";

const TABS: Array<{ id: Tab; label: string; icon: typeof Brain }> = [
  { id: "review", label: "Повторение", icon: Brain },
  { id: "packs", label: "Мои паки", icon: Layers },
  { id: "workshop", label: "Мастерская", icon: Store },
];

function isValidTab(value: string | null): value is Tab {
  return value === "review" || value === "packs" || value === "workshop";
}

function CardsPageInner() {
  const search = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const fromUrl = search.get("tab");
    return isValidTab(fromUrl) ? fromUrl : "review";
  });

  // Deep-links (?tab=packs) и смена URL (кнопка назад) — синхронно с состоянием.
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
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Brain className="h-7 w-7 text-[var(--primary)]" /> Карточки
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Интервальное повторение и паки-колоды: создайте свои, соберите ИИ по лекциям или возьмите из мастерской.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Разделы карточек">
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
          >
            <item.icon className="h-4 w-4" /> {item.label}
          </button>
        ))}
      </div>

      {tab === "review" ? <SrsReview /> : null}
      {tab === "packs" ? <PacksPanel /> : null}
      {tab === "workshop" ? <SharedPacksPanel /> : null}

      <p className="text-xs text-[var(--muted)]">
        Другие форматы повторения: <Link href="/study#prep" className="font-semibold text-[var(--primary)]">подготовка к КР</Link> и <Link href="/tickets" className="font-semibold text-[var(--primary)]">экзаменационные билеты</Link>.
      </p>
    </div>
  );
}

export default function CardsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Загрузка карточек…</div>}>
      <CardsPageInner />
    </Suspense>
  );
}
