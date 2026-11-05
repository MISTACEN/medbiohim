"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, GraduationCap, Loader2, RefreshCw } from "lucide-react";
import { generateTicket, listTicketBanks } from "@/lib/api";
import { ticketBankAvailable } from "@/lib/subjectSlug";
import { loadTicketBank, type PortalTicketBank } from "@/lib/portalContent";
import { ChemRichText } from "@/components/chemistry/ChemRichText";
import { EmptyState } from "@/components/ui/EmptyState";
import { useApiRequest } from "@/hooks/useApiRequest";
import { describeApiError } from "@/lib/errors";

/**
 * Генератор экзаменационных билетов предмета: банки вопросов, ситуационные
 * задачи, препараты и архив кафедры. Раньше жил прямо в page.tsx предмета,
 * теперь это общий компонент — вкладка «Экзамен / Билеты» показывает его рядом
 * со списком вопросов к экзамену.
 */
export default function TicketGenerator({ slug, subjectName }: { slug: string; subjectName?: string }) {
  const [bankId, setBankId] = useState("");
  const [count, setCount] = useState(3);
  const [mode, setMode] = useState<"practice" | "exam">("exam");
  const [busy, setBusy] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  // Банки билетов предмета из API.
  const banksRequest = useApiRequest<any[]>(async (signal) => {
    const res = await listTicketBanks({ signal });
    if (!res.ok) throw new Error(describeApiError(res.error) || "Не удалось загрузить банки билетов.");
    return res.data.items || [];
  }, []);

  // Архивный билетный банк кафедры (статические questions_by_subject).
  const archiveRequest = useApiRequest<PortalTicketBank | null>(async () => {
    const bank = await loadTicketBank(slug);
    return bank?.items?.length ? bank : null;
  }, [slug]);

  const banks = banksRequest.data || [];
  const archiveBank = archiveRequest.data;
  const banksError = banksRequest.error;

  // Фильтр банков по предмету: сначала по slug, затем по названию.
  const subjName = (subjectName || "").toLowerCase().trim();
  const subjectBanks = banks.filter((b: any) => {
    const bankSlug = String(b.subject_slug || "").trim();
    if (bankSlug) return bankSlug === slug;
    const bankName = String(b.subject || b.subject_name || "").toLowerCase().trim();
    return !!subjName && (bankName === subjName || bankName.includes(subjName) || subjName.includes(bankName));
  });

  // Банк предмета подставляем сразу — ничего выбирать не нужно.
  useEffect(() => {
    const firstAvailableBank = subjectBanks.find((bank: any) => Number(bank.count ?? 0) > 0);
    setBankId(firstAvailableBank ? String(firstAvailableBank.id) : archiveBank ? "archive" : "");
    setQuestions([]);
    setTitle("");
    setNote(null);
    setReveal({});
    // Сброс сгенерированного билета при смене предмета.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banks, slug, archiveBank]);

  async function genTicket() {
    if (!bankId || busy) return;
    if (bankId === "archive" && archiveBank) {
      // Локальная генерация из архивного банка кафедры.
      const pool = [...archiveBank.items];
      const picked: any[] = [];
      const n = Math.min(count, pool.length);
      for (let i = 0; i < n; i += 1) {
        const idx = Math.floor(Math.random() * pool.length);
        picked.push(pool.splice(idx, 1)[0]);
      }
      setReveal({});
      setNote(null);
      setQuestions(picked);
      setTitle(`Билет · ${archiveBank.subject} · архив кафедры`);
      return;
    }
    setBusy(true);
    setReveal({});
    setNote(null);
    const res = await generateTicket(bankId, count, mode);
    setBusy(false);
    if (!res.ok) {
      setNote(describeApiError(res.error));
      return;
    }
    setQuestions(res.data.questions || []);
    setTitle(res.data.bank?.title || "");
  }

  const hasBanks = (ticketBankAvailable(slug) && subjectBanks.length) || archiveBank;

  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold">Экзаменационные билеты</h2>
      <p className="mt-1 text-sm text-slate-500">
        Генератор билетов прямо здесь — никуда переходить не нужно. Билеты — отдельный банк, с SRS не смешиваются.
        {slug && (
          <>
            {" "}
            <Link
              href={`/tickets?subject_slug=${encodeURIComponent(slug)}`}
              className="font-medium text-primary hover:underline"
            >
              Полноэкранный режим
            </Link>
          </>
        )}
      </p>
      {hasBanks ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <select
              className="rounded-xl border px-3 py-2 text-sm md:col-span-2"
              style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}
              value={bankId}
              onChange={(e) => setBankId(e.target.value)}
              aria-label="Банк билетов"
            >
              {subjectBanks.map((b: any) => (
                <option key={b.id} value={b.id} disabled={Number(b.count ?? 0) <= 0}>
                  {b.title} ({Number(b.count ?? 0) > 0 ? b.count : "нет опубликованных вопросов"})
                </option>
              ))}
              {archiveBank && <option value="archive">Архив билетов кафедры ({archiveBank.count})</option>}
            </select>
            <select
              className="rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              aria-label="Количество вопросов в билете"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n} вопрос(а)</option>
              ))}
            </select>
            <select
              className="rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}
              value={mode}
              onChange={(e) => setMode(e.target.value as "practice" | "exam")}
              aria-label="Режим генерации"
            >
              <option value="practice">Практика (с эталоном)</option>
              <option value="exam">Экзамен</option>
            </select>
            <button
              type="button"
              className="btn-primary inline-flex items-center justify-center gap-2 text-sm md:col-span-4"
              onClick={() => void genTicket()}
              disabled={busy || !bankId}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Сгенерировать билет
            </button>
          </div>
          {banksError && !banks.length && (
            <p className="mt-3 rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-4 py-3 text-sm text-[var(--status-warn-fg)]">
              {banksError}
            </p>
          )}
          {note && <div className="mt-3 rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-4 py-3 text-sm text-[var(--status-warn-fg)]">{note}</div>}
          {questions.length > 0 && (
            <>
              {title && <h3 className="mt-5 text-base font-semibold">{title}</h3>}
              <ol className="mt-3 space-y-4">
                {questions.map((qq: any, idx: number) => (
                  <li key={qq.id || idx} className="rounded-xl border bg-slate-50 p-4" style={{ borderColor: "var(--border)" }}>
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Вопрос {idx + 1}{qq.subject ? ` · ${qq.subject}` : ""}</div>
                    <div className="mt-2 font-medium leading-snug">
                      <ChemRichText text={String(qq.text || "")} />
                    </div>
                    {mode === "practice" && (qq.answer || qq.has_answer) && (
                      <div className="mt-3">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-sm text-indigo-600"
                          onClick={() => setReveal((r) => ({ ...r, [qq.id]: !r[qq.id] }))}
                        >
                          <Eye className="h-4 w-4" />
                          {reveal[qq.id] ? "Скрыть эталон" : "Показать эталон"}
                        </button>
                        {reveal[qq.id] && (
                          <div className="mt-2 rounded-xl bg-white p-3 text-sm text-slate-700" style={{ background: "var(--card)", color: "var(--text)" }}>
                            <ChemRichText text={String(qq.answer || "")} asHtml />
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      ) : banksError ? (
        <p className="mt-4 rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-sm text-[var(--status-warn-fg)]">
          {banksError}
        </p>
      ) : banksRequest.loading || archiveRequest.loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаем банки билетов…
        </p>
      ) : (
        <div className="mt-4">
          <EmptyState
            icon={GraduationCap}
            title="Банк билетов для этого предмета пока не подключён"
            description="Преподаватель ещё не привязал экзаменационные билеты к предмету — как только они появятся, генератор станет доступен здесь."
          />
        </div>
      )}
    </section>
  );
}
