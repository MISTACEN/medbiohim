"use client";

/**
 * «Практика: для вас» — короткий список тестов по самым слабым темам.
 * Ничего не выдумывает: сервер ранжирует по освоенности и отдаёт готовые
 * причины, здесь только показ и переход в подготовку.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { getRecommendedTests, type RecommendedTest } from "@/lib/api/tests";

export function RecommendedTests() {
  const [items, setItems] = useState<RecommendedTest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await getRecommendedTests();
      if (cancelled) return;
      if (response.ok) setItems(Array.isArray(response.data?.items) ? response.data.items : []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Подбираем практику…
      </div>
    );
  }
  if (!items.length) return null;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-[var(--primary)]" /> Практика: для вас
        </h2>
        <span className="text-xs text-[var(--muted)]">по вашим слабым темам</span>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.test_id}>
            <Link
              href={`/tests/preparation/${encodeURIComponent(item.test_id)}?mode=prepare&count=20`}
              className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-2 transition hover:border-[var(--primary)]/50"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{item.title}</span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  {item.subject_name ? `${item.subject_name} · ` : ""}
                  {item.reason}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-[var(--primary-soft)] px-2 py-1 text-xs font-bold text-[var(--primary)]">
                {item.percent}%
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
