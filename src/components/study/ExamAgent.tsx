"use client";

/**
 * «Агент к экзамену» (фаза 2.6 карты).
 *
 * План на дату экзамена раскладывает банк вопросов кафедры по дням: ночью cron
 * готовит разборы на завтра, сегодняшние создаются сразу при запуске. Разбор —
 * эталонный ответ из банка, поэтому блок работает без ИИ.
 */
import { useCallback, useEffect, useState } from "react";
import { Bot, Check, ChevronDown, ChevronUp, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import {
  createExamAgent,
  getExamAgent,
  setExamAgentItemDone,
  type ExamAgentPlan,
} from "@/lib/api/misc";
import { listSubjects } from "@/lib/api/subjects";
import { describeApiError } from "@/lib/errors";

type SubjectOption = { slug: string; name: string };

function isoDate(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

function fmtDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "long" });
}

export default function ExamAgent() {
  const [plans, setPlans] = useState<ExamAgentPlan[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [subject, setSubject] = useState("");
  const [eventDate, setEventDate] = useState(isoDate(14));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const response = await getExamAgent();
    if (response.ok) setPlans(Array.isArray(response.data?.plans) ? response.data.plans : []);
    else setError(describeApiError(response.error));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    void listSubjects().then((response) => {
      if (!response.ok) return;
      const items = Array.isArray(response.data?.items) ? response.data.items : [];
      const options = items
        .map((item: any) => ({ slug: String(item?.slug || ""), name: String(item?.name || item?.slug || "") }))
        .filter((item: SubjectOption) => item.slug);
      setSubjects(options);
      setSubject((current) => current || options[0]?.slug || "");
    });
  }, [load]);

  async function start() {
    if (!subject || busy) return;
    setBusy(true);
    setError(null);
    const response = await createExamAgent(subject, eventDate);
    setBusy(false);
    if (!response.ok) {
      setError(describeApiError(response.error));
      return;
    }
    await load();
  }

  async function toggle(planId: string, itemId: string, done: boolean) {
    // Оптимистично: отметка должна ощущаться мгновенной, ошибка откатит.
    setPlans((current) =>
      current.map((plan) =>
        plan.id !== planId
          ? plan
          : {
              ...plan,
              today: {
                ...plan.today,
                items: plan.today.items.map((item) => (item.id === itemId ? { ...item, done } : item)),
                done: plan.today.done + (done ? 1 : -1),
              },
            },
      ),
    );
    const response = await setExamAgentItemDone(itemId, done);
    if (!response.ok) {
      setError(describeApiError(response.error));
      await load();
    }
  }

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Bot className="h-4 w-4 text-[var(--primary)]" /> Агент к экзамену
        </h2>
        <span className="text-xs text-[var(--muted)]">разборы приходят ночью, сегодняшние — сразу</span>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs" style={{ color: "var(--muted)" }}>
          Предмет
          <select
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="mt-1 block rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm"
          >
            {subjects.length === 0 && <option value="">загрузка…</option>}
            {subjects.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs" style={{ color: "var(--muted)" }}>
          Дата экзамена
          <input
            type="date"
            value={eventDate}
            min={isoDate(0)}
            max={isoDate(180)}
            onChange={(event) => setEventDate(event.target.value)}
            className="mt-1 block rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-2 text-sm"
          onClick={() => void start()}
          disabled={busy || !subject}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Запустить агента
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-[var(--status-warn-bg)] p-3 text-sm" style={{ color: "var(--status-warn-fg)" }}>
          <TriangleAlert className="mr-1.5 inline h-3.5 w-3.5" />
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-[var(--muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Проверяем планы агента…
        </p>
      ) : plans.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          Планов пока нет: выберите предмет и дату экзамена — агент разложит вопросы банка по дням.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {plans.map((plan) => (
            <article key={plan.id} className="rounded-xl border border-[var(--border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {plan.subject_slug} · экзамен {fmtDay(plan.event_date)}
                </p>
                <span className="text-xs text-[var(--muted)]">
                  {plan.days_left === 0 ? "сегодня" : `через ${plan.days_left} дн.`} · сегодня разобрано{" "}
                  {plan.today.done} из {plan.today.total}
                </span>
              </div>

              {plan.today.items.length === 0 ? (
                <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                  На сегодня разборов нет — банк вопросов по этому предмету исчерпан или ещё не загружен.
                </p>
              ) : (
                <ol className="mt-2 space-y-1.5">
                  {plan.today.items.map((item) => {
                    const expanded = open.has(item.id);
                    return (
                      <li key={item.id} className="rounded-xl border border-[var(--border)] p-2.5">
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            aria-label={item.done ? "Снять отметку" : "Отметить разобранным"}
                            aria-pressed={item.done}
                            onClick={() => void toggle(plan.id, item.id, !item.done)}
                            className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                              item.done
                                ? "border-[var(--status-ok-fg)] bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]"
                                : "border-[var(--border)]"
                            }`}
                          >
                            {item.done ? <Check className="h-3.5 w-3.5" /> : null}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm ${item.done ? "line-through opacity-60" : ""}`}>{item.question_text}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
                              {item.topic && <span className="rounded-full bg-slate-100 px-2 py-0.5">{item.topic}</span>}
                              {item.answer ? (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 font-semibold text-[var(--primary)]"
                                  aria-expanded={expanded}
                                  onClick={() =>
                                    setOpen((current) => {
                                      const next = new Set(current);
                                      if (next.has(item.id)) next.delete(item.id);
                                      else next.add(item.id);
                                      return next;
                                    })
                                  }
                                >
                                  {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                  {expanded ? "Скрыть разбор" : "Показать разбор"}
                                </button>
                              ) : (
                                <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-[var(--status-warn-fg)]">
                                  ответ готовится
                                </span>
                              )}
                            </div>
                            {expanded && item.answer && (
                              <p className="mt-2 whitespace-pre-line rounded-xl bg-slate-50 p-2.5 text-sm leading-6 text-slate-600">
                                {item.answer}
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              <p className="mt-2 text-[11px] text-[var(--muted)]">
                На завтра подготовлено: {plan.tomorrow.total} вопросов
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
