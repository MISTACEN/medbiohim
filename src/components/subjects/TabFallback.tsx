"use client";

/**
 * Общий запасной блок вкладок «Материалы / Тренажёры / Микропрепараты»:
 * для предметов без подключённого контента предлагаем базу вопросов и тесты.
 * Раньше этот блок повторялся три раза прямо в page.tsx — вынесен сюда,
 * чтобы вёрстка и связки вкладок не расходились.
 */
export default function TabFallback({
  title,
  description,
  onOpenTab,
}: {
  title: string;
  description: string;
  onOpenTab: (tab: "practice" | "tests") => void;
}) {
  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => onOpenTab("practice")} className="btn-primary inline-flex">
          Открыть базу вопросов
        </button>
        <button
          type="button"
          onClick={() => onOpenTab("tests")}
          className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:border-indigo-300"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          Перейти к тестам
        </button>
      </div>
    </section>
  );
}
