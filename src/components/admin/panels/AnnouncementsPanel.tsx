"use client";

/** Объявления и тексты главной: композиция. Вынесено из старого /admin. */
import Link from "next/link";
import { hasToken } from "@/lib/api";
import { AnnouncementsList } from "@/components/admin/panels/AnnouncementsList";
import { useAnnouncementsPanel } from "@/components/admin/panels/useAnnouncementsPanel";

export function AnnouncementsPanel() {
  const panel = useAnnouncementsPanel();
  const {
    site, setSite, visible, setVisible, announcements,
    title, setTitle, body, setBody, pinned, setPinned,
    error, ok, busy, draft, setDraft,
    dialog,
    saveDraft, togglePinned, createAnnouncement, deleteAnnouncement, saveSite,
  } = panel;

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
      {error && <div className="rounded-xl bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}
      {ok && <div className="rounded-xl bg-[var(--status-ok-bg)] px-4 py-3 text-sm text-[var(--status-ok-fg)]">{ok}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <form
          className="card space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await createAnnouncement();
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

        <AnnouncementsList
          announcements={announcements}
          visible={visible}
          onShowMore={() => setVisible(v => v + 1)}
          draft={draft}
          onDraft={setDraft}
          busy={busy}
          onSaveDraft={() => void saveDraft()}
          onCancelDraft={() => setDraft(null)}
          onStartEdit={(a) => setDraft({ id: a.id, title: String(a.title || ""), body: String(a.body || "") })}
          onTogglePinned={(a) => void togglePinned(a)}
          onDelete={(a) => void deleteAnnouncement(a)}
        />
      </div>

      <form
        className="card space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await saveSite();
        }}
      >
        <h2 className="font-bold">Настройки сайта</h2>
        {panel.siteFields.map(({ key, label }) => (
          <label key={key} className="block text-sm">{label}
            <input value={site[key]} onChange={(e) => setSite({ ...site, [key]: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" />
          </label>
        ))}
        <button className="btn-primary">Сохранить</button>
      </form>
      {dialog}
    </div>
  );
}
