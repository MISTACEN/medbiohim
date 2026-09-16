"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Save, Trash2, Ticket, Database } from "lucide-react";
import {
  adminCreateQuestion,
  adminDeleteQuestion,
  adminListQuestions,
  adminUpdateQuestion,
  listTicketBanks,
  type BankQuestion,
} from "@/lib/api";

const SUBJECTS = [
  ["biology", "Биология"],
  ["chemistry_organic_physical", "Органическая и физическая химия"],
  ["inorganic_chemistry", "Неорганическая химия"],
  ["physics", "Физика"],
  ["history", "История России"],
  ["математический_анализ", "Математический анализ"],
  ["physiology", "Физиология"],
] as const;

type EditState = Partial<BankQuestion>;

export default function AdminQuestionsPage() {
  const [items, setItems] = useState<BankQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [banks, setBanks] = useState<Array<{ id: string; title: string; subject: string; count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);

  const selectedSubject = useMemo(() => SUBJECTS.find(([slug]) => slug === subjectSlug)?.[1] || "", [subjectSlug]);
  const slugForBank = (subject: string) => SUBJECTS.find(([, name]) => name === subject)?.[0] || "";

  async function reload() {
    setLoading(true);
    const [questions, bankRes] = await Promise.all([
      adminListQuestions({ q: q || undefined, subject_slug: subjectSlug || undefined, kind: "ticket", limit: 100 }),
      listTicketBanks(),
    ]);
    setLoading(false);
    if (questions.ok) {
      setItems(questions.data.items);
      setTotal(questions.data.total);
      setNote(null);
    } else setNote(questions.error.message);
    if (bankRes.ok) setBanks(bankRes.data.items);
  }

  useEffect(() => { void reload(); }, []);

  async function save() {
    if (!edit?.text?.trim()) { setNote("Текст билета обязателен"); return; }
    setBusy(true);
    const payload = {
      text: edit.text.trim(),
      subject: selectedSubject || edit.subject || "Биология",
      subject_slug: subjectSlug || edit.subject_slug || "biology",
      topic: edit.topic || "",
      kind: "ticket",
      type: "open",
      answer: edit.answer || "",
      is_published: true,
    };
    const res = edit.id ? await adminUpdateQuestion(edit.id, payload) : await adminCreateQuestion(payload);
    setBusy(false);
    if (!res.ok) { setNote(res.error.message); return; }
    setEdit(null);
    await reload();
  }

  async function remove(id: string) {
    if (!confirm("Удалить экзаменационный вопрос?")) return;
    const res = await adminDeleteQuestion(id);
    if (!res.ok) setNote(res.error.message); else await reload();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-primary">← CMS</Link>
          <div className="mt-2 flex items-center gap-2"><Ticket className="h-6 w-6" style={{ color: "var(--primary)" }} /><h1 className="page-title">Экзаменационные билеты</h1></div>
          <p className="page-subtitle">Источник истины: Supabase · `exam_questions` · `kind=ticket`</p>
        </div>
        <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => { setSubjectSlug(subjectSlug || "biology"); setEdit({ text: "", answer: "", topic: "", subject: selectedSubject || "Биология", subject_slug: subjectSlug || "biology", kind: "ticket", type: "open" }); }}><Plus className="h-4 w-4" /> Новый билет</button>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="card"><div className="text-xs uppercase tracking-wide text-slate-400">В БД</div><div className="mt-1 text-2xl font-bold">{total}</div><div className="text-xs text-slate-500">в текущем фильтре</div></div>
        <div className="card"><div className="text-xs uppercase tracking-wide text-slate-400">Банки</div><div className="mt-1 text-2xl font-bold">{banks.length}</div><div className="text-xs text-slate-500">по учебным дисциплинам</div></div>
        <div className="card md:col-span-2"><div className="flex items-center gap-2 text-sm font-semibold"><Database className="h-4 w-4" /> Supabase-first CMS</div><p className="mt-1 text-xs text-slate-500">JSON на SpaceWeb используется только как fallback при отсутствии соединения с БД.</p></div>
      </div>

      <section className="card space-y-4">
        <div className="flex flex-wrap gap-2">
          <input className="min-w-64 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Поиск по билету…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={subjectSlug} onChange={(e) => setSubjectSlug(e.target.value)}><option value="">Все предметы</option>{SUBJECTS.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select>
          <button type="button" className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold" onClick={reload}>Обновить</button>
        </div>
        <div className="flex flex-wrap gap-2">{banks.map((bank) => <button key={bank.id} type="button" className="rounded-full border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50" onClick={() => { const slug = slugForBank(bank.subject); setSubjectSlug(slug); void reload(); }}>{bank.subject} · {bank.count}</button>)}</div>
      </section>

      {note && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{note}</div>}
      {edit && <section className="card space-y-3 p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">{edit.id ? "Редактирование билета" : "Новый экзаменационный билет"}</h2><p className="text-xs text-slate-500">kind=ticket · for_exam=true · for_ticket=true</p></div><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">Supabase</span></div><div className="grid gap-3 md:grid-cols-2"><select className="rounded-xl border px-3 py-2 text-sm" value={edit.subject_slug || subjectSlug} onChange={(e) => { const slug = e.target.value; setEdit({ ...edit, subject_slug: slug, subject: SUBJECTS.find(([s]) => s === slug)?.[1] || "" }); setSubjectSlug(slug); }}>{SUBJECTS.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select><input className="rounded-xl border px-3 py-2 text-sm" placeholder="Тема" value={edit.topic || ""} onChange={(e) => setEdit({ ...edit, topic: e.target.value })} /></div><textarea className="min-h-[120px] w-full rounded-xl border px-3 py-2 text-sm" placeholder="Формулировка вопроса" value={edit.text || ""} onChange={(e) => setEdit({ ...edit, text: e.target.value })} /><textarea className="min-h-[100px] w-full rounded-xl border px-3 py-2 text-sm" placeholder="Эталонный ответ (виден в режиме подготовки)" value={edit.answer || ""} onChange={(e) => setEdit({ ...edit, answer: e.target.value })} /><div className="flex gap-2"><button type="button" disabled={busy} className="btn-primary inline-flex items-center gap-2 text-sm" onClick={save}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Сохранить</button><button type="button" className="rounded-xl bg-slate-100 px-4 py-2 text-sm" onClick={() => setEdit(null)}>Отмена</button></div></section>}
      {loading ? <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Загрузка банка…</div> : <ul className="space-y-2">{items.map((item) => <li key={item.id} className="card flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap gap-2 text-[11px] uppercase text-slate-400"><span>{item.subject}</span><span>ticket</span>{item.topic && <span>{item.topic}</span>}</div><div className="font-medium leading-6">{item.text}</div></div><div className="flex shrink-0 gap-2"><button type="button" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold" onClick={() => setEdit(item)}>Изменить</button><button type="button" className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-600" onClick={() => remove(item.id)} title="Удалить"><Trash2 className="h-3.5 w-3.5" /></button></div></li>)}</ul>}
    </div>
  );
}
