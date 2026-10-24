"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, Search, Table2 } from "lucide-react";
import {
  loadParasitologyBank,
  type PortalMatchingBank,
  type PortalMatchingTest,
} from "@/lib/portalContent";

/** Тренажёр таблиц соответствия: колонки скрываются, ячейка открывается
 *  кликом — самопроверка по любой характеристике возбудителя. */
export default function MatchingTrainer() {
  const [bank, setBank] = useState<PortalMatchingBank | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testId, setTestId] = useState<string>("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    loadParasitologyBank()
      .then((b) => {
        if (!alive) return;
        setBank(b);
        if (b.tests[0]) setTestId(b.tests[0].id);
      })
      .catch((e) => alive && setError(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, []);

  const test: PortalMatchingTest | null = useMemo(
    () => bank?.tests.find((t) => t.id === testId) ?? null,
    [bank, testId],
  );

  const rows = useMemo(() => {
    if (!test) return [];
    const q = query.trim().toLowerCase();
    if (!q) return test.rows;
    return test.rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(q)));
  }, [test, query]);

  useEffect(() => {
    setHidden(new Set());
    setRevealed(new Set());
    setQuery("");
  }, [testId]);

  if (error) return <div className="card p-5 text-sm text-rose-600">{error}</div>;
  if (!bank) {
    return (
      <div className="card flex items-center gap-2 p-5 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Загружаем тренажёры…
      </div>
    );
  }

  function toggleColumn(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setRevealed((rv) => new Set([...rv].filter((r) => !r.endsWith(`:${key}`))));
      } else next.add(key);
      return next;
    });
  }

  function revealCell(rowIdx: number, key: string) {
    setRevealed((prev) => new Set(prev).add(`${rowIdx}:${key}`));
  }

  function hideAllExcept(key: string) {
    setHidden(new Set(test!.columns.map((c) => c.key).filter((k) => k !== key)));
    setRevealed(new Set());
  }

  if (!test) return <div className="card p-5 text-sm text-slate-500">Тренажёр не найден.</div>;

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Table2 className="size-5 text-indigo-500" /> {bank.subject}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Выберите колонку, которую хотите проверить: её ячейки скроются, а клик по ним откроет ответ.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {bank.tests.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTestId(t.id)}
              className={
                "rounded-full px-3 py-1.5 text-xs font-bold transition " +
                (testId === t.id ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200")
              }
            >
              {t.title}
            </button>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-56">
            <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по таблице…"
              className="w-full rounded-xl border bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <span className="text-xs text-slate-400">{rows.length} из {test.rows.length}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {test.columns.map((c) => {
            const isHidden = hidden.has(c.key);
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => toggleColumn(c.key)}
                title={isHidden ? "Показать колонку" : "Скрывать колонку"}
                className={
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition " +
                  (isHidden
                    ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200")
                }
              >
                {isHidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />} {c.label}
              </button>
            );
          })}
        </div>
      </section>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              {test.columns.map((c) => (
                <th key={c.key} className="px-3 py-2.5 text-xs font-bold text-slate-500">
                  <button
                    type="button"
                    onClick={() => hideAllExcept(c.key)}
                    className="hover:text-indigo-600"
                    title="Скрыть остальные колонки"
                  >
                    {c.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const realIdx = test.rows.indexOf(row);
              return (
                <tr key={realIdx} className="border-b last:border-0 align-top">
                  {test.columns.map((c, ci) => {
                    const isHiddenCol = hidden.has(c.key);
                    const isOpen = !isHiddenCol || revealed.has(`${realIdx}:${c.key}`);
                    return (
                      <td key={c.key} className={"px-3 py-2.5 " + (ci === 0 ? "font-semibold text-slate-800" : "text-slate-600")}>
                        {isOpen ? (
                          <span className="whitespace-pre-wrap">{row[c.key]}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => revealCell(realIdx, c.key)}
                            className="w-full rounded-lg bg-amber-50 px-2 py-1.5 text-left text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                          >
                            Нажмите, чтобы открыть
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
