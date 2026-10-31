"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Search, Landmark } from "lucide-react";
import { DEPARTMENTS, DEPARTMENTS_CATALOG_SNAPSHOT, DEPARTMENTS_CATALOG_SOURCE } from "@/lib/university/departments";

/**
 * Каталог кафедр: снимок официальной страницы вуза (см. departments.ts —
 * почему статично). Поиск по названию; прямые ссылки на страницы кафедр.
 * Карточки с контактами/РПД — следующий шаг fixtures-first.
 */
export default function DepartmentsCatalog() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DEPARTMENTS;
    return DEPARTMENTS.filter((item) => item.name.toLowerCase().includes(q));
  }, [query]);

  return (
    <section className="card p-5" aria-labelledby="departments-heading">
      <h2 id="departments-heading" className="flex items-center gap-2 text-lg font-bold text-slate-900">
        <Landmark className="h-5 w-5 text-sky-700" />
        Кафедры
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        45 кафедр — каталог официального сайта вуза (снимок {DEPARTMENTS_CATALOG_SNAPSHOT.split("-").reverse().join(".")}).
        Контактами и материалами кафедры пополняются по мере сверки с источником.
      </p>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти кафедру — например, «гистолог» или «биохим»"
          className="w-full rounded-xl border py-2 pl-9 pr-3 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--text)" }}
          aria-label="Поиск кафедры"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">По запросу ничего не найдено.</p>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {filtered.map((item) => (
            <li key={item.slug}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 rounded-xl border p-3 text-sm transition hover:border-sky-300 hover:bg-sky-50/40"
                style={{ borderColor: "var(--border)" }}
              >
                <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 text-slate-800">{item.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-slate-400">
        Источник:{" "}
        <a href={DEPARTMENTS_CATALOG_SOURCE} target="_blank" rel="noopener noreferrer" className="underline">
          fesmu.ru/life/department
        </a>
        . Страницы кафедр открываются на сайте вуза.
      </p>
    </section>
  );
}
