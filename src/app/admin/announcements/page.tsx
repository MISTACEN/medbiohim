"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminCreateAnnouncement, adminDeleteAnnouncement, adminListAnnouncements, adminOverview, adminUpdateSite, hasToken } from "@/lib/api";

const SITE_FIELDS: Array<{ key: "title" | "subtitle" | "description" | "announcement_banner"; label: string }> = [
  { key: "title", label: "Заголовок сайта" },
  { key: "subtitle", label: "Подзаголовок" },
  { key: "description", label: "Описание" },
  { key: "announcement_banner", label: "Баннер объявления" },
];

type Announcement = { id: string; title?: string; body?: string };

/** Объявления и тексты главной — вынесено из старого /admin. */
export default function AdminAnnouncementsPage() {
  const [site, setSite] = useState({ title: "Медбиохим", subtitle: "", description: "", announcement_banner: "" });
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  function msg(err = "", good = "") { setError(err); setOk(good); }

  async function load() {
    const [o, a] = await Promise.all([adminOverview(), adminListAnnouncements()]);
    if (o.ok) {
      if (o.data.site) {
        const s = o.data.site;
        setSite({
          title: String(s.title || "Медбиохим"),
          subtitle: String(s.subtitle || ""),
          description: String(s.description || ""),
          announcement_banner: String(s.announcement_banner || ""),
        });
      }
    } else msg(o.error.message);
    if (a.ok) setAnnouncements(a.data.items || []);
    else msg(a.error.message);
  }

  useEffect(() => { void load(); }, []);

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">Объявления</h1>
        <p className="page-subtitle">Сначала войдите</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="page-title">Объявления и сайт</h1>
        <p className="page-subtitle">Новости для студентов и тексты главной страницы.</p>
      </header>
      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {ok && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{ok}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <form
          className="card space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await adminCreateAnnouncement(title, body, false);
            if (!r.ok) return msg(r.error.message);
            setTitle("");
            setBody("");
            msg("", "Объявление опубликовано");
            await load();
          }}
        >
          <h2 className="text-lg font-bold">Новое объявление</h2>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Заголовок" className="w-full rounded-xl border px-3 py-2" />
          <textarea required rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Текст" className="w-full rounded-xl border px-3 py-2" />
          <button className="btn-primary">Опубликовать</button>
        </form>

        <div className="card">
          <h2 className="mb-2 font-bold">Опубликовано · {announcements.length}</h2>
          <div className="divide-y">
            {announcements.map((a) => (
              <div key={a.id} className="py-3">
                <b>{a.title}</b>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.body}</p>
                <button
                  type="button"
                  className="mt-1 text-xs text-rose-600"
                  onClick={async () => {
                    if (!window.confirm(`Удалить объявление «${a.title}»?`)) return;
                    const r = await adminDeleteAnnouncement(a.id);
                    if (!r.ok) return msg(r.error.message);
                    msg("", "Объявление удалено");
                    await load();
                  }}
                >
                  Удалить
                </button>
              </div>
            ))}
            {announcements.length === 0 && <div className="py-3 text-sm text-slate-500">Объявлений пока нет.</div>}
          </div>
        </div>
      </div>

      <form
        className="card space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await adminUpdateSite(site);
          if (!r.ok) return msg(r.error.message);
          msg("", "Настройки сайта сохранены");
        }}
      >
        <h2 className="font-bold">Настройки сайта</h2>
        {SITE_FIELDS.map(({ key, label }) => (
          <label key={key} className="block text-sm">{label}
            <input value={site[key]} onChange={(e) => setSite({ ...site, [key]: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" />
          </label>
        ))}
        <button className="btn-primary">Сохранить</button>
      </form>
    </div>
  );
}
