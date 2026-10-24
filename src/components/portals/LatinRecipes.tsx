"use client";

import { useEffect, useMemo, useState } from "react";
import { Languages, Loader2, Search } from "lucide-react";
import { loadLatinRecipes, type PortalLatinRecipes } from "@/lib/portalContent";

/** «100 рецептов» по латинскому языку (по Чернявскому): фильтр по разделам,
 *  поиск по тексту рецепта, карточки с формой рецепта. */
export default function LatinRecipes({ embedded = false }: { embedded?: boolean }) {
  const [data, setData] = useState<PortalLatinRecipes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    loadLatinRecipes()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.recipes.filter(
      (r) =>
        (!group || r.group === group) &&
        (!q || r.lines.some((l) => l.toLowerCase().includes(q)) || String(r.num) === q),
    );
  }, [data, group, query]);

  const labelOf = (id: string) => data?.groups.find((g) => g.id === id)?.label || id;

  if (error) return <div className="card p-5 text-sm text-rose-600">{error}</div>;
  if (!data) {
    return (
      <div className="card flex items-center gap-2 p-5 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Загружаем рецепты…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Languages className="size-5 text-indigo-500" /> {data.subject}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Все 100 рецептов с латинскими формулировками: сборы, мази, настойки, инъекции, свечи, плёнки и химические элементы.
        </p>
        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск: лекарства, форма (Rp., Signa), номер…"
            className="w-full rounded-xl border bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-indigo-400"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setGroup("")}
            className={
              "rounded-full px-2.5 py-1 text-xs font-semibold " +
              (!group ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100")
            }
          >
            Все ({data.recipes.length})
          </button>
          {data.groups.map((g) => {
            const count = data.recipes.filter((r) => r.group === g.id).length;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setGroup(g.id === group ? "" : g.id)}
                className={
                  "rounded-full px-2.5 py-1 text-xs font-semibold " +
                  (group === g.id ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100")
                }
              >
                {g.label} ({count})
              </button>
            );
          })}
        </div>
      </section>

      {!embedded && filtered.length === 0 && (
        <div className="card p-5 text-sm text-slate-500">Ничего не найдено.</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((r) => (
          <article key={r.num} className="card p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold uppercase tracking-wide">№ {r.num} · {labelOf(r.group)}</span>
              {r.isNew && <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-bold text-indigo-600">новый</span>}
            </div>
            <div className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-mono text-[13px] leading-relaxed text-slate-700">
              {r.lines.join("\n")}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
