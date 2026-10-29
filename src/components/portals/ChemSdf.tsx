"use client";

import { useEffect, useMemo, useState } from "react";
import { BookMarked, ChevronDown, FileText, Loader2, ScrollText } from "lucide-react";
import { LectureRenderer } from "@/components/lectures/LectureRenderer";
import { loadChemSdf, type PortalSdf } from "@/lib/portalContent";

type Mode = "cheat" | "tests" | "tickets";

const MODES: { id: Mode; label: string; Icon: typeof ScrollText }[] = [
  { id: "cheat", label: "Шпаргалка", Icon: BookMarked },
  { id: "tests", label: "Тесты с пояснениями", Icon: ScrollText },
  { id: "tickets", label: "Билеты", Icon: FileText },
];

function TestsView({ tests }: { tests: PortalSdf["tests"] }) {
  const [testId, setTestId] = useState(tests[0]?.id ?? "");
  const [picks, setPicks] = useState<Record<string, number>>({});
  const test = tests.find((t) => t.id === testId) ?? tests[0];

  const correctCount = test
    ? test.questions.filter((q) => picks[q.id] === q.correct).length
    : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {tests.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTestId(t.id);
              setPicks({});
            }}
            className={
              "rounded-full px-3 py-1.5 text-xs font-bold transition " +
              (testId === t.id ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200")
            }
          >
            {t.title}
          </button>
        ))}
      </div>
      {test && (
        <>
          <div className="grid gap-3">
            {test.questions.map((q, qi) => {
              const pick = picks[q.id];
              const answered = pick != null;
              return (
                <article key={q.id} className="card p-4">
                  <h3 className="font-semibold text-slate-800">{qi + 1}. {q.text.replace(/^\d+\.\s*/, "")}</h3>
                  <div className="mt-3 grid gap-2">
                    {q.options.map((opt, oi) => {
                      let cls = "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40";
                      if (answered) {
                        if (oi === q.correct) cls = "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)]";
                        else if (oi === pick) cls = "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)]";
                        else cls = "border-slate-200 opacity-70";
                      }
                      return (
                        <button
                          key={oi}
                          type="button"
                          onClick={() => setPicks((p) => ({ ...p, [q.id]: oi }))}
                          className={"rounded-xl border px-3 py-2 text-left text-sm transition " + cls}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  {answered && q.explanation && (
                    <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{q.explanation}</p>
                  )}
                </article>
              );
            })}
          </div>
          <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-2xl border bg-white/95 p-3 shadow-lg backdrop-blur">
            <span className="text-sm font-semibold text-slate-600">Верных ответов: {correctCount} из {test.questions.length}</span>
            <button
              type="button"
              onClick={() => setPicks({})}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
            >
              Сбросить
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TicketsView({ tickets }: { tickets: PortalSdf["tickets"] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(tickets[0]?.id ?? null);
  const ticket = tickets.find((t) => t.id === expanded) ?? tickets[0];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {tickets.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setExpanded(t.id)}
            className={
              "rounded-full px-3 py-1.5 text-xs font-bold transition " +
              (ticket?.id === t.id ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200")
            }
          >
            {t.title}
          </button>
        ))}
      </div>
      {ticket && (
        <div className="grid gap-3">
          {ticket.items.map((item, i) => {
            const isOpen = !!open[`${ticket.id}:${i}`];
            return (
              <article key={i} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <pre className="flex-1 whitespace-pre-wrap font-sans text-sm text-slate-700">{item.q}</pre>
                  {item.solution && (
                    <button
                      type="button"
                      onClick={() => setOpen((o) => ({ ...o, [`${ticket.id}:${i}`]: !o[`${ticket.id}:${i}`] }))}
                      className="shrink-0 inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
                    >
                      <ChevronDown className={"size-3.5 transition " + (isOpen ? "rotate-180" : "")} />
                      {isOpen ? "Скрыть" : "Решение"}
                    </button>
                  )}
                </div>
                {isOpen && item.solution && (
                  <div className="mt-3 rounded-xl bg-slate-50 p-3">
                    <pre className="whitespace-pre-wrap font-sans text-sm text-slate-600">{item.solution}</pre>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ChemSdf() {
  const [data, setData] = useState<PortalSdf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("cheat");

  useEffect(() => {
    let alive = true;
    loadChemSdf()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, []);

  const stats = useMemo(() => data?.stats, [data]);

  if (error) return <div className="card p-5 text-sm text-[var(--status-critical-fg)]">{error}</div>;
  if (!data) {
    return (
      <div className="card flex items-center gap-2 p-5 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Загружаем шпаргалку и тесты…
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="card p-5">
        <h2 className="text-lg font-bold">{data.subject}</h2>
        <p className="mt-1 text-sm text-slate-500">
          Шпаргалка из {stats?.cheatSections ?? 0} разделов, {stats?.tests ?? 0} теста ({stats?.questions ?? 0} вопросов с пояснениями)
          {" "}и {stats?.tickets ?? 0} билетов рубежного контроля.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {MODES.map(({ id, label, Icon: IconC }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition " +
                (mode === id ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200")
              }
            >
              <IconC className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "cheat" && (
        <article className="card p-5">
          <LectureRenderer markdown="" html={data.cheatHtml} />
        </article>
      )}
      {mode === "tests" && <TestsView tests={data.tests} />}
      {mode === "tickets" && <TicketsView tickets={data.tickets} />}
    </section>
  );
}
