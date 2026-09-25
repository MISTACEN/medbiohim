"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  adminDeleteLecture,
  adminGenerateLecture,
  adminListLectures,
  adminPublishLecture,
  adminRejectLecture,
  adminUpdateLecture,
  listSubjectsCatalog,
  type Lecture,
} from "@/lib/api";

export default function AdminLecturesPage() {
  const [items, setItems] = useState<Lecture[]>([]);
  const [status, setStatus] = useState("pending_review");
  const [subjects, setSubjects] = useState<Array<{ slug: string; name: string }>>([]);
  const [slug, setSlug] = useState("physiology");
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  async function reload(st = status) {
    const r: any = await adminListLectures(st === "all" ? undefined : st);
    if (r.ok) setItems((r.data.items || []) as Lecture[]);
    else setMsg(String(r.error?.message || "Ошибка"));
  }

  useEffect(() => {
    void reload();
    void listSubjectsCatalog().then((r: any) => {
      if (r.ok) {
        const list = ((r.data?.items || []) as any[])
          .map((x: any) => ({ slug: String(x.slug || "").trim(), name: String(x.name || "") }))
          .filter((x: { slug: string; name: string }): x is { slug: string; name: string } => Boolean(x.slug));
        setSubjects(list);
        if (list[0] && !slug) setSlug(list[0].slug);
      }
    });
  }, [status]);

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return setMsg("Укажите тему");
    setBusy(true);
    setMsg(null);
    const r: any = await adminGenerateLecture({ subject_slug: slug, topic: topic.trim(), notes: notes.trim() || undefined });
    setBusy(false);
    if (!r.ok) return setMsg(String(r.error?.message || "Ошибка"));
    setMsg("Черновик создан и отправлен на проверку");
    setTopic("");
    setStatus("pending_review");
    await reload("pending_review");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">AI-лекции</h1>
          <p className="page-subtitle">Генерация по учебному плану → проверка → публикация. Медиа: RuTube, VK, Яндекс (без VPN) + YouTube.</p>
        </div>
        <Link href="/admin" className="text-sm text-[var(--primary)]">← Админ</Link>
      </div>

      <form onSubmit={onGenerate} className="card space-y-3 p-5">
        <h2 className="font-bold">Сгенерировать черновик</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--muted)]">Предмет</span>
            <select value={slug} onChange={(e) => setSlug(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2">
              {subjects.map((s) => (
                <option key={s.slug} value={s.slug}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--muted)]">Тема занятия</span>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Например: Мембранный потенциал" className="w-full rounded-xl border border-[var(--border)] px-3 py-2" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-[var(--muted)]">Указания (необязательно)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-xl border border-[var(--border)] px-3 py-2" placeholder="Акцент на клинические примеры…" />
        </label>
        <button type="submit" disabled={busy} className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? "Генерация…" : "Сгенерировать и отправить на проверку"}
        </button>
      </form>

      {msg && <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm">{msg}</div>}

      <div className="flex flex-wrap gap-2">
        {["pending_review", "published", "rejected", "all"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === s ? "bg-[var(--primary)] text-white" : "border border-[var(--border)]"}`}
          >
            {s === "pending_review" ? "На проверке" : s === "published" ? "Опубликовано" : s === "rejected" ? "Отклонено" : "Все"}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {items.map((lec: any) => (
          <div key={lec.id} className="card space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{lec.title}</div>
                <div className="text-xs text-[var(--muted)]">
                  {lec.subject} · {lec.status}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {lec.status !== "published" && (
                  <button type="button" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white" onClick={async () => {
                    const r: any = await adminPublishLecture(lec.id);
                    setMsg(r.ok ? "Опубликовано" : String(r.error?.message || "Ошибка"));
                    await reload();
                  }}>Опубликовать</button>
                )}
                {lec.status === "pending_review" && (
                  <button type="button" className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700" onClick={async () => {
                    const r: any = await adminRejectLecture(lec.id);
                    setMsg(r.ok ? "Отклонено" : String(r.error?.message || "Ошибка"));
                    await reload();
                  }}>Отклонить</button>
                )}
                <button type="button" className="rounded-lg border px-3 py-1.5 text-xs font-semibold" onClick={() => {
                  setEditId(editId === lec.id ? null : lec.id);
                  setEditBody(lec.body_md || "");
                }}>{editId === lec.id ? "Скрыть" : "Править текст"}</button>
                <button type="button" className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-600" onClick={async () => {
                  if (!confirm("Удалить лекцию?")) return;
                  await adminDeleteLecture(lec.id);
                  await reload();
                }}>Удалить</button>
              </div>
            </div>
            {lec.summary && <p className="text-xs text-[var(--muted)]">{lec.summary}</p>}
            {Array.isArray(lec.media) && lec.media.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                {lec.media.map((m: any, i: number) => (
                  <a
                    key={i}
                    href={String(m.url || "#")}
                    target="_blank"
                    rel="noreferrer"
                    className={`rounded-full border px-2 py-1 font-medium ${String(m.region) === "ru" ? "border-emerald-300 text-emerald-800" : "border-slate-200 text-slate-600"}`}
                    title={String(m.note || "")}
                  >
                    {String(m.title || "link")}{String(m.region) === "ru" ? " · без VPN" : ""}
                  </a>
                ))}
              </div>
            )}
            {editId === lec.id && (
              <div className="space-y-2">
                <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={12} className="w-full rounded-xl border border-[var(--border)] p-3 font-mono text-xs" />
                <button type="button" className="rounded-xl bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white" onClick={async () => {
                  const r: any = await adminUpdateLecture(lec.id, { body_md: editBody });
                  setMsg(r.ok ? "Сохранено" : String(r.error?.message || "Ошибка"));
                  await reload();
                }}>Сохранить текст</button>
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <div className="card p-6 text-sm text-[var(--muted)]">Пусто в этом фильтре.</div>}
      </div>
    </div>
  );
}
