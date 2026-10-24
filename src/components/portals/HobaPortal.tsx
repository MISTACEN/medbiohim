"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronDown, FlaskConical, Loader2, PencilRuler, Search } from "lucide-react";
import { ChemRichText } from "@/components/chemistry/ChemRichText";
import {
  loadHobaPractical,
  loadHobaTasks,
  loadHobaTheory,
  type PortalHobaPractical,
  type PortalHobaTasks,
  type PortalHobaTheory,
} from "@/lib/portalContent";

type Mode = "theory" | "practical" | "tasks";

const MODES: { id: Mode; label: string; Icon: typeof BookOpen }[] = [
  { id: "theory", label: "Теория", Icon: BookOpen },
  { id: "practical", label: "Практика", Icon: FlaskConical },
  { id: "tasks", label: "Задачи", Icon: PencilRuler },
];

function useReveal() {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const reset = () => setRevealed(new Set());
  return { revealed, toggle, reset };
}

export default function HobaPortal() {
  const [theory, setTheory] = useState<PortalHobaTheory | null>(null);
  const [practical, setPractical] = useState<PortalHobaPractical | null>(null);
  const [tasks, setTasks] = useState<PortalHobaTasks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("theory");
  const [module, setModule] = useState<number | null>(null);
  const [topic, setTopic] = useState<string>("");
  const [query, setQuery] = useState("");
  const reveal = useReveal();

  useEffect(() => {
    let alive = true;
    Promise.all([loadHobaTheory(), loadHobaPractical().catch(() => null), loadHobaTasks().catch(() => null)])
      .then(([t, p, k]) => {
        if (!alive) return;
        setTheory(t);
        setPractical(p);
        setTasks(k);
      })
      .catch((e) => alive && setError(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, []);

  const activeItems = useMemo(() => {
    if (mode === "theory") return theory?.items ?? [];
    if (mode === "practical") return practical?.items ?? [];
    return tasks?.items ?? [];
  }, [mode, theory, practical, tasks]);

  const modules = useMemo(() => {
    const ids = [...new Set(activeItems.map((x: any) => Number(x.module)).filter(Boolean))].sort((a, b) => a - b);
    return ids;
  }, [activeItems]);

  const topics = useMemo(() => {
    const list = activeItems
      .filter((x: any) => module == null || Number(x.module) === module)
      .map((x: any) => String(x.topic || ""));
    return [...new Set(list)];
  }, [activeItems, module]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeItems
      .filter((x: any) => (module == null || Number(x.module) === module) && (!topic || x.topic === topic))
      .filter((x: any) => {
        if (!q) return true;
        return (
          String(x.question || x.problem || "").toLowerCase().includes(q) ||
          String(x.answer || x.solution || "").toLowerCase().includes(q)
        );
      });
  }, [activeItems, module, topic, query]);

  useEffect(() => {
    reveal.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, module, topic, query]);

  if (error) return <div className="card p-5 text-sm text-rose-600">{error}</div>;
  if (!theory) {
    return (
      <div className="card flex items-center gap-2 p-5 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Загружаем материалы ХОБА…
      </div>
    );
  }

  const subject = theory.subject;

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h2 className="text-lg font-bold">{subject}</h2>
        <p className="mt-1 text-sm text-slate-500">
          Коллоквиум: {theory.items.length} теоретических вопросов
          {practical ? `, ${practical.items.length} практических` : ""}
          {tasks ? `, ${tasks.items.length} задач с решениями` : ""}. Курс {theory.course}, семестр {theory.semester}.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {MODES.map(({ id, label, Icon }) => {
            const available = id === "theory" || (id === "practical" && practical) || (id === "tasks" && tasks);
            if (!available) return null;
            const IconC = Icon;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMode(id);
                  setModule(null);
                  setTopic("");
                }}
                className={
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition " +
                  (mode === id ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200")
                }
              >
                <IconC className="size-3.5" /> {label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-56">
            <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по вопросам и ответам…"
              className="w-full rounded-xl border bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          {modules.length > 0 && (
            <select
              value={module ?? ""}
              onChange={(e) => {
                setModule(e.target.value ? Number(e.target.value) : null);
                setTopic("");
              }}
              className="rounded-xl border bg-white px-3 py-2 text-sm"
            >
              <option value="">Все модули</option>
              {modules.map((m) => (
                <option key={m} value={m}>Модуль {m}</option>
              ))}
            </select>
          )}
        </div>
        {topics.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setTopic("")}
              className={"rounded-full px-2.5 py-1 text-xs font-semibold " + (!topic ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100")}
            >
              Все темы
            </button>
            {topics.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTopic(t === topic ? "" : t)}
                className={
                  "rounded-full px-2.5 py-1 text-xs font-semibold " +
                  (topic === t ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100")
                }
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-3">
        {filtered.length === 0 && <div className="card p-5 text-sm text-slate-500">Ничего не найдено.</div>}
        {filtered.map((item: any) => {
          const open = reveal.revealed.has(item.id);
          const isTask = mode === "tasks";
          return (
            <article key={item.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-400">
                    {[item.number ? `№ ${item.number}` : "", item.topic, isTask && item.type ? item.type : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <h3 className="mt-0.5 font-semibold text-slate-800">
                    {isTask ? item.title || "Задача" : item.question}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => reveal.toggle(item.id)}
                  className="shrink-0 inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
                >
                  <ChevronDown className={"size-3.5 transition " + (open ? "rotate-180" : "")} />
                  {open ? "Скрыть" : "Ответ"}
                </button>
              </div>
              {isTask && item.problem && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{item.problem}</p>
              )}
              {open && (
                <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
                  {isTask && item.formulas?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {item.formulas.map((f: string, i: number) => (
                        <code key={i} className="rounded bg-white px-2 py-0.5 text-xs text-indigo-700 border">{f}</code>
                      ))}
                    </div>
                  ) : null}
                  <ChemRichText text={isTask ? item.solution || "" : item.answer} asHtml />
                  {(isTask ? item.explanation : item.explanation) ? (
                    <p className="border-t pt-2 text-xs text-slate-500">{item.explanation}</p>
                  ) : null}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
