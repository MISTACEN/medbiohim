"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  adminCreateQuestion,
  adminDeleteQuestion,
  adminListQuestions,
  adminUpdateQuestion,
  type BankQuestion,
} from "@/lib/api";
import { Loader2, Plus, Trash2, Save } from "lucide-react";

export default function AdminQuestionsPage() {
  const [items, setItems] = useState<BankQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<BankQuestion> | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setLoading(true);
    const res = await adminListQuestions({ q: q || undefined, kind: kind || undefined, limit: 40 });
    setLoading(false);
    if (res.ok) {
      setItems(res.data.items);
      setTotal(res.data.total);
      setNote(null);
    } else setNote(res.error.message);
  }

  useEffect(() => {
    reload();
  }, []);

  async function save() {
    if (!edit?.text?.trim()) {
      setNote("Текст вопроса обязателен");
      return;
    }
    setBusy(true);
    const payload = {
      text: edit.text.trim(),
      subject: edit.subject || "Общий",
      subject_slug: edit.subject_slug || "general",
      topic: edit.topic || "",
      kind: edit.kind || "main",
      type: edit.type || "open",
      answer: edit.answer || "",
    };
    const res = edit.id
      ? await adminUpdateQuestion(edit.id, payload)
      : await adminCreateQuestion(payload);
    setBusy(false);
    if (!res.ok) {
      setNote(res.error.message);
      return;
    }
    setEdit(null);
    await reload();
  }

  async function remove(id: string) {
    if (!confirm("Удалить вопрос?")) return;
    const res = await adminDeleteQuestion(id);
    if (!res.ok) setNote(res.error.message);
    else await reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm text-primary">← Админ</Link>
          <h1 className="page-title">CMS · Вопросы</h1>
          <p className="page-subtitle">Редактирование банка · всего {total}</p>
        </div>
        <button type="button" className="btn-primary inline-flex items-center gap-2 text-sm" onClick={() => setEdit({ text: "", answer: "", subject: "Биология", subject_slug: "biology", kind: "main", type: "open" })}>
          <Plus className="h-4 w-4" /> Новый
        </button>
      </div>
      {note && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{note}</div>}
      <div className="flex flex-wrap gap-2">
        <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Все kind</option>
          {["main", "ticket", "mc", "theory", "practical", "task"].map((k) => (<option key={k} value={k}>{k}</option>))}
        </select>
        <button type="button" className="rounded-xl bg-slate-100 px-3 py-2 text-sm" onClick={reload}>Найти</button>
      </div>
      {edit && (
        <div className="card space-y-3 p-5">
          <h2 className="font-semibold">{edit.id ? "Редактировать" : "Создать"}</h2>
          <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Предмет" value={edit.subject || ""} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} />
          <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Тема" value={edit.topic || ""} onChange={(e) => setEdit({ ...edit, topic: e.target.value })} />
          <textarea className="min-h-[80px] w-full rounded-xl border px-3 py-2 text-sm" placeholder="Текст вопроса" value={edit.text || ""} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
          <textarea className="min-h-[100px] w-full rounded-xl border px-3 py-2 text-sm" placeholder="Эталонный ответ" value={edit.answer || ""} onChange={(e) => setEdit({ ...edit, answer: e.target.value })} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} className="btn-primary inline-flex items-center gap-2 text-sm" onClick={save}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Сохранить
            </button>
            <button type="button" className="rounded-xl bg-slate-100 px-3 py-2 text-sm" onClick={() => setEdit(null)}>Отмена</button>
          </div>
        </div>
      )}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Загрузка…</div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="card flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] uppercase text-slate-400">{item.subject} · {item.kind}</div>
                <div className="font-medium">{item.text}</div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 text-xs" onClick={() => setEdit(item)}>Edit</button>
                <button type="button" className="rounded-lg bg-rose-50 px-2 py-1 text-xs text-rose-600" onClick={() => remove(item.id)}><Trash2 className="h-3 w-3" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
