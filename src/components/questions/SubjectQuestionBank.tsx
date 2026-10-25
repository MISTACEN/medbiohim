"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, ChevronLeft, ChevronRight, Eye, EyeOff, Loader2, MessageSquare, Search, Sparkles } from "lucide-react";
import { listQuestions } from "@/lib/api";
import { ChemRichText } from "@/components/chemistry/ChemRichText";
import QuestionComments from "@/components/questions/QuestionComments";
import { loadTicketBank, type PortalTicketBank } from "@/lib/portalContent";

const PAGE_SIZE = 20;

const KINDS = [
  { value: "", label: "Все" },
  { value: "mcq", label: "Тесты" },
  { value: "open", label: "Открытые" },
  { value: "theory", label: "Теория" },
];

function plain(value?: string | null) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function optionText(option: any) {
  if (option == null) return "";
  if (typeof option === "string") return plain(option);
  return plain(option.text ?? option.label ?? option.value ?? option.title ?? "");
}

function typeLabel(type?: string | null) {
  const map: Record<string, string> = { mcq: "Тест", mc: "Тест", open: "Открытый", theory: "Теория" };
  return map[String(type || "")] || "";
}

/** «Спросить ИИ»: копируем формулировку вопроса в буфер и открываем DeepSeek —
 *  ответ человек получает в своём личном AI-чате, наш API не расходуется. */
async function askAi(questionText: string, options?: string[]) {
  const prompt = ["Разбери вопрос для подготовки к экзамену в медвузе:", questionText, ...(options?.length ? ["Варианты ответа:", ...options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`)] : []), "Дай правильный ответ с объяснением простым языком."].filter(Boolean).join("\n");
  try {
    await navigator.clipboard.writeText(prompt);
  } catch {
    /* буфер недоступен — просто открываем чат */
  }
  window.open("https://chat.deepseek.com/", "_blank", "noreferrer noopener");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Архивный билетный банк кафедры (questions_by_subject) — тот же список,
 *  но целиком клиентский: поиск, фильтр по типу и постраничный вывод. */
function ArchiveBankView({ bank }: { bank: PortalTicketBank }) {
  const [kind, setKind] = useState("");
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [opened, setOpened] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const timer = setTimeout(() => setSearch(term.trim().toLowerCase()), 250);
    return () => clearTimeout(timer);
  }, [term]);

  const filtered = useMemo(() => {
    return bank.items.filter((it) => {
      const t = String(it.type || "").toLowerCase();
      if (kind && (kind === "mcq" ? !["mcq", "mc"].includes(t) : t !== kind)) return false;
      if (!search) return true;
      return (
        String(it.text || "").toLowerCase().includes(search) ||
        String(it.answer || "").toLowerCase().includes(search) ||
        String(it.topic || "").toLowerCase().includes(search)
      );
    });
  }, [bank, kind, search]);

  useEffect(() => {
    setPage(0);
  }, [kind, search]);

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const from = total === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min((safePage + 1) * PAGE_SIZE, total);

  const kindCounts = useMemo(() => {
    const counts: Record<string, number> = { "": bank.items.length, mcq: 0, open: 0, theory: 0 };
    for (const it of bank.items) {
      const t = String(it.type || "").toLowerCase();
      if (["mcq", "mc"].includes(t)) counts.mcq += 1;
      else if (t in counts) counts[t] += 1;
    }
    return counts;
  }, [bank]);

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {KINDS.map((option) => {
          const active = kind === option.value;
          const count = kindCounts[option.value];
          return (
            <button
              key={option.value || "all"}
              type="button"
              onClick={() => setKind(option.value)}
              className={
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition " +
                (active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
              }
            >
              {option.label}
              {count != null && count > 0 && <span className={active ? "text-indigo-100" : "text-slate-400"}>{count}</span>}
            </button>
          );
        })}
        <label className="ml-auto flex min-w-[12rem] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 sm:max-w-xs">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Найти вопрос…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
      </div>

      {total === 0 ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
          {search ? "По запросу ничего не найдено." : "В архиве банка вопросов нет."}
        </div>
      ) : (
        <ol className="mt-4 space-y-3">
          {visible.map((item, index) => {
            const id = String(item.id || index);
            const isOpen = !!opened[id];
            const answer = plain(item.answer);
            return (
              <li key={id} className="rounded-xl border border-slate-200 bg-white">
                <div className="p-4">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">№ {from + index}</span>
                    {typeLabel(item.type) && (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">{typeLabel(item.type)}</span>
                    )}
                    {item.topic && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{String(item.topic)}</span>}
                    {!answer && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">без эталона</span>}
                  </div>
                  <div className="mt-2 text-sm font-semibold leading-6 text-slate-900">
                    <ChemRichText text={String(item.text || "Вопрос")} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpened((current) => ({ ...current, [id]: !current[id] }))}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50"
                  >
                    {isOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {isOpen ? "Скрыть эталон" : "Показать эталон"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void askAi(String(item.text || "Вопрос"), item.options?.map(optionText))}
                    className="mt-3 ml-1.5 inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                    title="Скопируем вопрос и откроем DeepSeek — ответ получите в своём чате"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Спросить ИИ
                  </button>
                  {isOpen && (
                    <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-950">
                      {answer ? <ChemRichText text={String(item.answer)} asHtml /> : "Эталон для этого вопроса пока не заполнен."}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {total > PAGE_SIZE && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>
            Вопросы {from}–{to} из {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Назад
            </button>
            <button
              type="button"
              onClick={() => setPage(Math.min(pages - 1, safePage + 1))}
              disabled={to >= total}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40"
            >
              Вперёд <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * База вопросов предмета прямо на странице предмета: поиск, фильтр по типу,
 * постраничный список и раскрытие эталона без перехода на другую страницу.
 * Рядом — архивный билетный банк кафедры, если он есть для этого предмета.
 */
export default function SubjectQuestionBank({
  subjectId,
  subjectSlug,
  subjectName,
}: {
  subjectId?: string;
  subjectSlug?: string;
  subjectName?: string;
}) {
  const [source, setSource] = useState<"bank" | "archive">("bank");
  const [archive, setArchive] = useState<PortalTicketBank | null>(null);
  const [kind, setKind] = useState("");
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [commentsOpen, setCommentsOpen] = useState<Record<string, boolean>>({});
  const [aiCopied, setAiCopied] = useState<Record<string, boolean>>({});

  // Архивный банк грузим один раз на предмет.
  useEffect(() => {
    let cancelled = false;
    setArchive(null);
    setSource("bank");
    loadTicketBank(subjectSlug).then((bank) => {
      if (!cancelled && bank?.items?.length) setArchive(bank);
    });
    return () => {
      cancelled = true;
    };
  }, [subjectSlug]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(term.trim()), 350);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    setPage(0);
  }, [kind, search, subjectId, subjectSlug]);

  // Если в основном банке вопросов пусто, сразу показываем архив.
  useEffect(() => {
    if (!loading && !error && total === 0 && archive) setSource("archive");
  }, [loading, error, total, archive]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listQuestions({
      subject_id: subjectId || undefined,
      subject_slug: subjectId ? undefined : subjectSlug || undefined,
      kind: kind || undefined,
      q: search || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      include_answer: 1,
    })
      .then((result: any) => {
        if (cancelled) return;
        if (result?.ok) {
          setItems(result.data?.items || []);
          setTotal(Number(result.data?.total || 0));
          setError(null);
        } else {
          setItems([]);
          setTotal(0);
          setError(result?.error?.message || "Не удалось загрузить вопросы.");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
        setTotal(0);
        setError("Не удалось загрузить вопросы.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId, subjectSlug, kind, search, page]);

  // Счётчики по типам подгружаем один раз: так видно, из чего состоит банк.
  useEffect(() => {
    let cancelled = false;
    const base = {
      subject_id: subjectId || undefined,
      subject_slug: subjectId ? undefined : subjectSlug || undefined,
    };
    void Promise.all(
      KINDS.map((option) =>
        listQuestions({ ...base, kind: option.value || undefined, limit: 1, include_answer: 1 })
          .then((result: any) => [option.value, result?.ok ? Number(result.data?.total || 0) : 0] as const)
          .catch(() => [option.value, 0] as const),
      ),
    ).then((rows) => {
      if (!cancelled) setCounts(Object.fromEntries(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [subjectId, subjectSlug]);

  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">База вопросов</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            {subjectName ? subjectName + " · " : ""}
            {source === "archive" && archive
              ? `архив билетов кафедры — ${archive.count} вопросов с эталонами`
              : counts[""] != null
                ? counts[""] + " вопросов — с ответами прямо здесь, искать и открывать ничего не нужно."
                : "вопросы предмета"}
          </p>
        </div>
        <span className="rounded-xl bg-indigo-50 px-3 py-2 text-sm font-extrabold text-indigo-700">
          {source === "archive" && archive ? archive.count : total} найдено
        </span>
      </div>

      {archive && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSource("bank")}
            className={
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition " +
              (source === "bank" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")
            }
          >
            Вопросы предмета
          </button>
          <button
            type="button"
            onClick={() => setSource("archive")}
            className={
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition " +
              (source === "archive" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")
            }
          >
            <Archive className="h-3.5 w-3.5" /> Архив билетов кафедры ({archive.count})
          </button>
        </div>
      )}

      {source === "archive" && archive ? (
        <ArchiveBankView bank={archive} />
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {KINDS.map((option) => {
              const active = kind === option.value;
              const count = counts[option.value];
              return (
                <button
                  key={option.value || "all"}
                  type="button"
                  onClick={() => setKind(option.value)}
                  className={
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition " +
                    (active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                  }
                >
                  {option.label}
                  {count != null && <span className={active ? "text-indigo-100" : "text-slate-400"}>{count}</span>}
                </button>
              );
            })}
            <label className="ml-auto flex min-w-[12rem] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 sm:max-w-xs">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Найти вопрос…"
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
          </div>

          {error && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>}

          {loading ? (
            <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Загружаю вопросы…
            </div>
          ) : items.length === 0 ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              {search ? "По запросу ничего не найдено." : "Для этого предмета вопросы пока не опубликованы."}
            </div>
          ) : (
            <ol className="mt-4 space-y-3">
              {items.map((item: any, index: number) => {
                const id = String(item.id || index);
                const isOpen = !!opened[id];
                const options: any[] = Array.isArray(item.options) ? item.options : [];
                const answer = plain(item.answer);
                return (
                  <li key={id} className="rounded-xl border border-slate-200 bg-white">
                    <div className="p-4">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">№ {from + index}</span>
                        {typeLabel(item.type) && (
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">{typeLabel(item.type)}</span>
                        )}
                        {item.topic && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{String(item.topic)}</span>}
                        {!item.has_answer && answer === "" && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">без эталона</span>
                        )}
                      </div>
                      <div className="mt-2 text-sm font-semibold leading-6 text-slate-900">
                        <ChemRichText text={String(item.text || item.stem || "Вопрос")} />
                      </div>
                      {options.length > 0 && (
                        <ul className="mt-3 grid gap-1.5 text-sm text-slate-700">
                          {options.map((option: any, optionIndex: number) => (
                            <li key={optionIndex} className="flex items-start gap-2">
                              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">
                                {String.fromCharCode(65 + optionIndex)}
                              </span>
                              <span className="min-w-0 flex-1">{optionText(option)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <button
                        type="button"
                        onClick={() => setOpened((current) => ({ ...current, [id]: !current[id] }))}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50"
                      >
                        {isOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {isOpen ? "Скрыть эталон" : "Показать эталон"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void askAi(String(item.text || item.stem || "Вопрос"), Array.isArray(item.options) ? item.options.map(optionText) : undefined);
                          setAiCopied((c) => ({ ...c, [id]: true }));
                        }}
                        className="mt-3 ml-1.5 inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                        title="Скопируем вопрос и откроем DeepSeek — ответ получите в своём чате"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {aiCopied[id] ? "Вопрос скопирован" : "Спросить ИИ"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCommentsOpen((c) => ({ ...c, [id]: !c[id] }))}
                        className="mt-3 ml-1.5 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-indigo-300 hover:bg-indigo-50"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Обсуждение
                      </button>
                      {isOpen && (
                        <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-950">
                          {answer ? <ChemRichText text={String(item.answer)} asHtml /> : "Эталон для этого вопроса пока не заполнен."}
                        </div>
                      )}
                      {commentsOpen[id] && UUID_RE.test(id) && <QuestionComments questionId={id} />}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {total > PAGE_SIZE && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
              <span>
                Вопросы {from}–{to} из {total}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={page === 0 || loading}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Назад
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={to >= total || loading}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40"
                >
                  Вперёд <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
