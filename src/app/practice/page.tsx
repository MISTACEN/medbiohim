"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getQuestion,
  listQuestionSubjects,
  listQuestions,
  listFavorites,
  toggleFavorite,
  listNotes,
  upsertNote,
  type BankQuestion,
} from "@/lib/api";
import { Loader2, Search, Eye, EyeOff, Star, Save } from "lucide-react";
import { QuestionReport } from "@/components/QuestionReport";
import { ChemRichText } from "@/components/chemistry/ChemRichText";

export default function PracticePage() {
  const [subjects, setSubjects] = useState<
    Array<{ subject: string; subject_slug: string; count: number }>
  >([]);
  const [items, setItems] = useState<BankQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [subjectSlug, setSubjectSlug] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<BankQuestion | null>(null);
  const [showAnswer, setShowAnswer] = useState(true);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [savedNote, setSavedNote] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 40;
  const [noteSaving, setNoteSaving] = useState(false);
  const [contextSubjectSlug, setContextSubjectSlug] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const initialSlug = params.get("subject_slug") || "";
    if (initialSlug) { setSubjectSlug(initialSlug); setContextSubjectSlug(initialSlug); }
  }, []);

  useEffect(() => {
    listQuestionSubjects().then((res) => {
      if (res.ok) setSubjects(res.data.items);
    });
  }, []);


  useEffect(() => {
    void listFavorites().then((res) => {
      if (res.ok) setFavoriteIds(new Set((res.data.items || []).filter((x:any) => x.target_type === "question").map((x:any) => String(x.target_id))));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await listQuestions({
        subject_slug: subjectSlug || undefined,
        kind: kind || undefined,
        q: q || undefined,
        limit: pageSize,
        offset: page * pageSize,
        include_answer: 1,
      });
      if (cancelled) return;
      if (res.ok) {
        setItems(res.data.items);
        setTotal(res.data.total);
        setNote(null);
      } else {
        setNote(res.error.message);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectSlug, kind, q, page]);

  useEffect(() => { setPage(0); }, [subjectSlug, kind, q]);

  async function openQuestion(id: string) {
    setShowAnswer(true);
    setDraft("");
    const res = await getQuestion(id);
    if (res.ok) {
      setSelected(res.data.question);
      const notes = await listNotes();
      if (notes.ok) {
        const mine = (notes.data.items || []).find((x:any) => x.target_type === "question" && String(x.target_id) === String(id));
        setSavedNote(String(mine?.text || ""));
      } else setSavedNote("");
    } else setNote(res.error.message);
  }


  async function toggleSelectedFavorite() {
    if (!selected) return;
    const res = await toggleFavorite("question", selected.id);
    if (!res.ok) { setNote(res.error.message); return; }
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (res.data.favorited) next.add(selected.id); else next.delete(selected.id);
      return next;
    });
  }

  async function saveSelectedNote() {
    if (!selected) return;
    setNoteSaving(true);
    const res = await upsertNote("question", selected.id, savedNote);
    setNoteSaving(false);
    if (!res.ok) { setNote(res.error.message); return; }
    setNote("Заметка сохранена");
  }

  const kinds = useMemo(
    () => [
      { value: "", label: "Все типы" },
      { value: "main", label: "Основной банк" },
      { value: "ticket", label: "Билетные" },
      { value: "mc", label: "MC-тесты" },
      { value: "theory", label: "ХОБА теория" },
      { value: "practical", label: "ХОБА практика" },
      { value: "task", label: "ХОБА задачи" },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">База вопросов{subjectSlug ? ` · ${subjects.find((s) => s.subject_slug === subjectSlug)?.subject || subjectSlug}` : ""}</h1>
        <p className="page-subtitle">
          Полная база опубликованных вопросов · {total} найдено · вопросы и правильные ответы доступны без запуска теста
        </p>
      </div>

      {note && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {note}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <select
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          value={subjectSlug}
          onChange={(e) => { if (!contextSubjectSlug) setSubjectSlug(e.target.value); }}
          disabled={!!contextSubjectSlug}
        >
          {!contextSubjectSlug && <option value="">Все предметы</option>}
          {subjects.map((s) => (
            <option key={s.subject_slug} value={s.subject_slug}>
              {s.subject} ({s.count})
            </option>
          ))}
        </select>
        <select
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {kinds.map((k) => (
            <option key={k.value || "all"} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm"
            placeholder="Поиск по тексту…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card max-h-[70vh] overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
            </div>
          ) : items.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Ничего не найдено</p>
          ) : (
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openQuestion(item.id)}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-primary/5 ${
                      selected?.id === item.id ? "bg-primary/10 font-medium" : ""
                    }`}
                  >
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">
                      {item.subject}
                      {item.kind ? ` · ${item.kind}` : ""}
                      {item.has_answer ? " · ответ есть" : " · ответ не заполнен"}
                    </div>
                    <div className="line-clamp-2">{item.text}</div>
                    {item.has_answer && item.answer && <div className="mt-1 line-clamp-2 text-xs text-emerald-700"><span className="font-semibold">Ответ:</span> {item.answer}</div>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card space-y-4 p-5">
          {!selected ? (
            <p className="text-sm text-slate-500">
              Выберите вопрос слева. Правильный ответ доступен сразу; тест запускать не нужно.
            </p>
          ) : (
            <>
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wide text-slate-400">
                  {selected.subject}
                      {selected.topic ? ` · ${selected.topic}` : ""}
                    </div>
                  </div>
                  <button type="button" onClick={() => void toggleSelectedFavorite()} className={"shrink-0 rounded-xl border px-3 py-2 text-sm " + (favoriteIds.has(selected.id) ? "border-amber-300 bg-amber-50 text-amber-700" : "bg-white text-slate-500")} title="Избранное"><Star className={"h-4 w-4 " + (favoriteIds.has(selected.id) ? "fill-current" : "")}/></button>
                </div>
                <h2 className="mt-1 text-lg font-semibold leading-snug">
                  <ChemRichText text={selected.text} />
                </h2>
              </div>
              <QuestionReport questionId={selected.id} />
              <div className="space-y-2 rounded-xl border bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Моя заметка</div>
                <textarea value={savedNote} onChange={(e) => setSavedNote(e.target.value)} rows={3} className="w-full rounded-lg border bg-white px-3 py-2 text-sm" placeholder="Что нужно запомнить по этому вопросу…"/>
                <button type="button" disabled={noteSaving} onClick={() => void saveSelectedNote()} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"><Save className="h-3.5 w-3.5"/>{noteSaving ? "Сохранение…" : "Сохранить заметку"}</button>
              </div>


              {selected.type === "mc" && selected.options?.length ? (
                <div className="space-y-2">
                  {selected.options.map((opt: any, idx: number) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setDraft(String(idx))}
                      className={`block w-full rounded-xl border px-3 py-2 text-left text-sm ${
                        draft === String(idx)
                          ? "border-primary bg-primary/10"
                          : "border-slate-200"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <textarea
                  className="min-h-[140px] w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="Ваш ответ (черновик)…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
              )}

              <button
                type="button"
                className="btn-primary inline-flex items-center gap-2 text-sm"
                onClick={() => setShowAnswer((v) => !v)}
              >
                {showAnswer ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showAnswer ? "Скрыть эталон" : "Показать эталон"}
              </button>

              {showAnswer && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-slate-800">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Официальный ответ
                  </div>
                  {selected.type === "mc" && selected.options ? (
                    <p>
                      {selected.options[selected.correct ?? 0] ?? selected.answer ?? "—"}
                    </p>
                  ) : (
                    <ChemRichText
                      text={selected.answer || "Эталон пока пуст"}
                      asHtml
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="text-sm text-slate-500">
          Страница {page + 1} · вопросы {total === 0 ? 0 : page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} из {total}
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={page === 0 || loading} onClick={() => setPage((v) => Math.max(0, v - 1))} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40">Назад</button>
          <button type="button" disabled={(page + 1) * pageSize >= total || loading} onClick={() => setPage((v) => v + 1)} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40">Далее</button>
        </div>
      </div>
    </div>
  );
}
