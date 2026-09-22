"use client";

/**
 * Экзаменационные билеты — отдельно от SRS.
 * ?subject_slug= со страницы предмета; только строгий match.
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { generateTicket, listTicketBanks, type BankQuestion } from "@/lib/api";
import { Loader2, RefreshCw, Eye, ChevronLeft } from "lucide-react";
import { resolveSubjectSlug, subjectSlugMatches } from "@/lib/subjectSlug";

type Bank = {
  id: string;
  title: string;
  subject: string;
  subject_slug?: string;
  count: number;
};

function TicketsPageInner() {
  const search = useSearchParams();
  const fromSubject = useMemo(() => {
    const slug = search.get("subject_slug") || search.get("slug") || "";
    const id = search.get("subject") || "";
    return resolveSubjectSlug(slug || id);
  }, [search]);

  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankId, setBankId] = useState("");
  const [count, setCount] = useState(3);
  const [mode, setMode] = useState<"practice" | "exam">("exam");
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [title, setTitle] = useState("");
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    listTicketBanks().then((res) => {
      if (!res.ok) {
        setNote(res.error.message);
        return;
      }
      const items = (res.data.items || []) as Bank[];
      setBanks(items);
      if (fromSubject) {
        const hit = items.find((b) => subjectSlugMatches(b.subject_slug, fromSubject));
        if (hit) {
          setBankId(hit.id);
          setNote(`Банк: ${hit.title}`);
        } else {
          setBankId("");
          setNote(
            `Для «${fromSubject}» своего банка билетов нет. Чужой предмет не подставляем (гистология ≠ неорганика).`
          );
        }
      } else {
        setBankId("");
        setNote("Выберите банк билетов вручную.");
      }
    });
  }, [fromSubject]);

  async function generate() {
    if (!bankId) return;
    setLoading(true);
    setReveal({});
    const res = await generateTicket(bankId, count, mode);
    setLoading(false);
    if (!res.ok) {
      setNote(res.error.message);
      return;
    }
    setQuestions(res.data.questions);
    setTitle(res.data.bank.title);
    setNote(null);
  }

  const selected = banks.find((b) => b.id === bankId);

  return (
    <div className="space-y-6">
      {fromSubject && (
        <Link
          href={`/subjects/${encodeURIComponent(fromSubject)}`}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />К предмету
        </Link>
      )}

      <div>
        <h1 className="page-title">Экзаменационные билеты</h1>
        <p className="page-subtitle">
          Не карточки SRS. {fromSubject ? `Фильтр: ${fromSubject}` : "Выберите банк"}
        </p>
      </div>

      {note && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {note}
        </div>
      )}

      <div className="card grid gap-3 p-5 md:grid-cols-4">
        <select
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2"
          value={bankId}
          onChange={(e) => setBankId(e.target.value)}
        >
          <option value="">— выберите банк —</option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} ({b.count})
            </option>
          ))}
        </select>
        <select
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} вопрос(а)
            </option>
          ))}
        </select>
        <select
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          value={mode}
          onChange={(e) => setMode(e.target.value as "practice" | "exam")}
        >
          <option value="practice">Практика</option>
          <option value="exam">Экзамен</option>
        </select>
        <button
          type="button"
          className="btn-primary inline-flex items-center justify-center gap-2 text-sm md:col-span-4"
          onClick={() => void generate()}
          disabled={loading || !bankId}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Сгенерировать{selected ? ` · ${selected.subject}` : ""}
        </button>
      </div>

      {title && <h2 className="text-lg font-semibold">{title}</h2>}

      <ol className="space-y-4">
        {questions.map((qq, idx) => (
          <li key={qq.id} className="card p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Вопрос {idx + 1}
              {qq.subject ? ` · ${qq.subject}` : ""}
            </div>
            <p className="mt-2 font-medium leading-snug">{qq.text}</p>
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
                  <div
                    className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"
                    dangerouslySetInnerHTML={{ __html: String(qq.answer || "") }}
                  />
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function TicketsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Загрузка билетов…</div>}>
      <TicketsPageInner />
    </Suspense>
  );
}
