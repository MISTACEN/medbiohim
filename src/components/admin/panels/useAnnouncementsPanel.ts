"use client";

/** Объявления и тексты главной: состояние и действия. Вынесено из старого /admin. */
import { useCallback, useEffect, useState } from "react";
import { adminCreateAnnouncement, adminDeleteAnnouncement, adminListAnnouncements, adminOverview, adminUpdateAnnouncement, adminUpdateSite } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { ANNOUNCEMENTS_SITE_FIELDS, type AnnouncementsItem } from "@/components/admin/panels/model";

export function useAnnouncementsPanel() {
  const [site, setSite] = useState({ title: "Медбиохим", subtitle: "", description: "", announcement_banner: "" });
  const [visible, setVisible] = useState(1);
  const [announcements, setAnnouncements] = useState<AnnouncementsItem[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState("");
  // Правка на месте: { id, title, body } — единственное редактируемое объявление.
  const [draft, setDraft] = useState<{ id: string; title: string; body: string } | null>(null);
  const { confirm, dialog } = useConfirm();

  const msg = useCallback((err = "", good = "") => { setError(err); setOk(good); }, []);

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

  async function togglePinned(item: AnnouncementsItem) {
    setBusy("pin-" + item.id);
    const r = await adminUpdateAnnouncement(item.id, { pinned: !item.pinned });
    setBusy("");
    if (!r.ok) return msg(describeApiError(r.error));
    msg("", item.pinned ? "Объявление откреплено" : "Объявление закреплено первым");
    await load();
  }

  const load = useCallback(async () => {
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
  }, [msg]);

  useEffect(() => { void load(); }, [load]);

  async function createAnnouncement() {
    setBusy("create");
    const r = await adminCreateAnnouncement(title, body, pinned);
    setBusy("");
    if (!r.ok) return msg(describeApiError(r.error));
    setTitle("");
    setBody("");
    setPinned(false);
    msg("", "Объявление опубликовано");
    await load();
  }

  async function deleteAnnouncement(item: AnnouncementsItem) {
    const agreed = await confirm({
      title: "Удалить объявление?",
      description: `«${item.title}» — восстановить его будет нельзя.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!agreed) return;
    const r = await adminDeleteAnnouncement(item.id);
    if (!r.ok) return msg(describeApiError(r.error));
    msg("", "Объявление удалено");
    await load();
  }

  async function saveSite() {
    const r = await adminUpdateSite(site);
    if (!r.ok) return msg(describeApiError(r.error));
    msg("", "Настройки сайта сохранены");
  }

  return {
    site, setSite, visible, setVisible, announcements,
    title, setTitle, body, setBody, pinned, setPinned,
    error, ok, busy, draft, setDraft,
    dialog, siteFields: ANNOUNCEMENTS_SITE_FIELDS,
    load, saveDraft, togglePinned, createAnnouncement, deleteAnnouncement, saveSite,
  };
}
