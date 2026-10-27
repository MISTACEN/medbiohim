"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminCreateAnnouncement, adminDeleteAnnouncement, adminListAnnouncements, adminOverview, adminUpdateAnnouncement, adminUpdateSite, hasToken } from "@/lib/api";
import { describeApiError } from "@/lib/errors";

const SITE_FIELDS: Array<{ key: "title" | "subtitle" | "description" | "announcement_banner"; label: string }> = [
  { key: "title", label: "Заголовок сайта" },
  { key: "subtitle", label: "Подзаголовок" },
  { key: "description", label: "Описание" },
  { key: "announcement_banner", label: "Баннер объявления" },
];

type Announcement = { id: string; title?: string; body?: string; pinned?: boolean; created_at?: string };

/** Объявления и тексты главной — вынесено из старого /admin. */
export default function AdminAnnouncementsPage() {
  const [site, setSite] = useState({ title: "Медбиохим", subtitle: "", description: "", announcement_banner: "" });
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState("");
  // Правка на месте: { id, title, body } — единственное редактируемое объявление.
  const [draft, setDraft] = useState<{ id: string; title: string; body: string } | null>(null);

  function msg(err = "", good = "") { setError(err); setOk(good); }

  async function saveDraft() {
    if (!draft) return;
    const nextTitle = draft.title.trim();
    const nextBody = draft.body.trim();
    if (!nextTitle || !nextBody) return msg("Заголовок и текст не могут быть пустыми");
    setBusy("save-" + draft.id);
    const r = await adminUpdateAnnouncement(draft.id, { title: nextTitle, body: nextBody });
    setBusy("");
    if (!r.ok) return msg(describeApiError(r.error));
    setDraft(null);
    msg("", "Объявление обновлено");
    await load();
  }

  async function togglePinned(item: Announcement) {
    setBusy("pin-" + item.id);
    const r = await adminUpdateAnnouncement(item.id, { pinned: !item.pinned });
    setBusy("");
    if (!r.ok) return msg(describeApiError(r.error));
    msg("", item.pinned ? "Объявление откреплено" : "Объявление закреплено первым");
    await load();
  }

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
    } else msg(describeApiError(o.error));
    if (a.ok) setAnnouncements(a.data.items || []);
    else msg(describeApiError(a.error));
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
            setBusy("create");
            const r = await adminCreateAnnouncement(title, body, pinned);
            setBusy("");
            if (!r.ok) return msg(describeApiError(r.error));
            setTitle("");
            setBody("");
            setPinned(false);
            msg("", "Объявление опубликовано");
            await load();
          }}
        >
          <h2 className="text-lg font-bold">Новое объявление</h2>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Заголовок" className="w-full rounded-xl border px-3 py-2" />
          <textarea required rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Текст" className="w-full rounded-xl border px-3 py-2" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            Закрепить — показывать первым
          </label>
          <button className="btn-primary" disabled={busy === "create"}>Опубликовать</button>
        </form>

        <div className="card">
          <h2 className="mb-2 font-bold">Опубликовано · {announcements.length}</h2>
          <div className="divide-y">
            {announcements.map((a) => (
              <div key={a.id} className="py-3">
                {draft?.id === a.id ? (
                  <div className="space-y-2">
                    <input
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      className="w-full rounded-xl border px-3 py-2 text-sm"
                      aria-label="Заголовок объявления"
                    />
                    <textarea
                      rows={5}
                      value={draft.body}
                      onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                      className="w-full rounded-xl border px-3 py-2 text-sm"
                      aria-label="Текст объявления"
                    />
                    <div className="flex gap-2">
                      <button type="button" className="btn-primary text-xs" disabled={busy === "save-" + a.id} onClick={() => void saveDraft()}>
                        Сохранить
                      </button>
                      <button type="button" className="btn-secondary text-xs" onClick={() => setDraft(null)}>
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <b className="flex items-center gap-2">
                      {a.pinned && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-indigo-600">Закреплено</span>}
                      {a.title}
                    </b>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.body}</p>
                    <div className="mt-1 flex gap-3 text-xs">
                      <button
                        type="button"
                        className="text-indigo-600"
                        onClick={() => setDraft({ id: a.id, title: String(a.title || ""), body: String(a.body || "") })}
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        className="text-slate-600"
                        disabled={busy === "pin-" + a.id}
                        onClick={() => void togglePinned(a)}
                      >
                        {a.pinned ? "Открепить" : "Закрепить"}
                      </button>
                      <button
                        type="button"
                        className="text-rose-600"
                        onClick={async () => {
                          if (!window.confirm(`Удалить объявление «${a.title}»?`)) return;
                          const r = await adminDeleteAnnouncement(a.id);
                          if (!r.ok) return msg(describeApiError(r.error));
                          msg("", "Объявление удалено");
                          await load();
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  </>
                )}
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
          if (!r.ok) return msg(describeApiError(r.error));
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
