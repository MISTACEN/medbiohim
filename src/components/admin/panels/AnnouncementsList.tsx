"use client";

/** Объявления: список опубликованных с правкой на месте, закреплением и удалением. */
import type { AnnouncementsItem } from "@/components/admin/panels/model";

export function AnnouncementsList({
  announcements,
  visible,
  onShowMore,
  draft,
  onDraft,
  busy,
  onSaveDraft,
  onCancelDraft,
  onStartEdit,
  onTogglePinned,
  onDelete,
}: {
  announcements: AnnouncementsItem[];
  visible: number;
  onShowMore: () => void;
  draft: { id: string; title: string; body: string } | null;
  onDraft: (draft: { id: string; title: string; body: string } | null) => void;
  busy: string;
  onSaveDraft: () => void;
  onCancelDraft: () => void;
  onStartEdit: (item: AnnouncementsItem) => void;
  onTogglePinned: (item: AnnouncementsItem) => void;
  onDelete: (item: AnnouncementsItem) => void;
}) {
  return (
    <div className="card">
      <h2 className="mb-2 font-bold">Опубликовано · {announcements.length}</h2>
      {announcements.length > visible*30 && (
        <button type="button" onClick={onShowMore} className="mt-2 w-full rounded-xl border px-3 py-2 text-sm font-semibold">Показать ещё ({announcements.length - visible*30})</button>
      )}
      <div className="divide-y">
        {announcements.slice(0, visible*30).map((a) => (
          <div key={a.id} className="py-3">
            {draft?.id === a.id ? (
              <div className="space-y-2">
                <input
                  value={draft.title}
                  onChange={(e) => onDraft({ ...draft, title: e.target.value })}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  aria-label="Заголовок объявления"
                />
                <textarea
                  rows={5}
                  value={draft.body}
                  onChange={(e) => onDraft({ ...draft, body: e.target.value })}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  aria-label="Текст объявления"
                />
                <div className="flex gap-2">
                  <button type="button" className="btn-primary text-xs" disabled={busy === "save-" + a.id} onClick={onSaveDraft}>
                    Сохранить
                  </button>
                  <button type="button" className="btn-secondary text-xs" onClick={onCancelDraft}>
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
                  <button type="button" className="text-indigo-600" onClick={() => onStartEdit(a)}>
                    Изменить
                  </button>
                  <button type="button" className="text-slate-600" disabled={busy === "pin-" + a.id} onClick={() => onTogglePinned(a)}>
                    {a.pinned ? "Открепить" : "Закрепить"}
                  </button>
                  <button type="button" className="text-[var(--status-critical-fg)]" onClick={() => onDelete(a)}>
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
  );
}
