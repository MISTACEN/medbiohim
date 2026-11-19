"use client";

/** Списки закладок: избранное со строками-ссылками и заметки с текстом. */
import Link from "next/link";
import { ExternalLink, FileText, Star, StickyNote, Trash2 } from "lucide-react";
import { TYPE_LABEL, formatDateTime, type BookmarkItem } from "@/components/bookmarks/model";
import type { BookmarksPageState } from "@/components/bookmarks/useBookmarksPage";

function BookmarkRow({ item, onRemove, busy }: { item: BookmarkItem; onRemove: (item: BookmarkItem) => void; busy: boolean }) {
  const label = TYPE_LABEL[item.target_type] || "Закладка";
  const title = item.title || (item.missing ? "Запись удалена или недоступна" : item.target_id);
  const body = (
    <>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{label}</span>
      <span className="flex-1 text-sm">{title}</span>
      <span className="text-xs tabular-nums text-slate-400">{formatDateTime(item.created_at)}</span>
    </>
  );
  return (
    <div className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)" }}>
      {item.href && !item.missing ? (
        <Link href={item.href} className="flex flex-1 items-center gap-3 text-slate-800 hover:text-indigo-700">
          {body}
        </Link>
      ) : (
        <div className="flex flex-1 items-center gap-3 text-slate-500">{body}</div>
      )}
      {item.href && !item.missing && <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />}
      <button
        type="button"
        disabled={busy}
        onClick={() => onRemove(item)}
        title="Убрать из избранного"
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-[var(--status-critical-bg)] hover:text-[var(--status-critical-fg)] disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export function BookmarksFavorites({ page }: { page: BookmarksPageState }) {
  const { favorites, busyId, removeFavorite } = page;

  if (!favorites.length) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed p-8 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        <Star className="mx-auto mb-2 h-6 w-6 text-slate-300" />
        Пока ничего не отмечено. Звёздочка «в избранное» есть у вопросов в{" "}
        <Link href="/practice" className="font-semibold text-indigo-600">базе вопросов</Link>.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {favorites.map((item) => (
        <BookmarkRow key={`${item.target_type}:${item.target_id}`} item={item} onRemove={removeFavorite} busy={busyId === item.target_id} />
      ))}
    </div>
  );
}

export function BookmarksNotes({ page }: { page: BookmarksPageState }) {
  const { notes, busyId, removeNote } = page;

  if (!notes.length) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed p-8 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        <StickyNote className="mx-auto mb-2 h-6 w-6 text-slate-300" />
        Заметок нет. Их можно оставить к любому вопросу в{" "}
        <Link href="/practice" className="font-semibold text-indigo-600">базе вопросов</Link>.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {notes.map((note) => (
        <div key={note.id} className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{TYPE_LABEL[note.target_type] || "Заметка"}</span>
            {note.href ? (
              <Link href={note.href} className="flex-1 truncate text-sm font-medium text-slate-800 hover:text-indigo-700">
                {note.title || note.target_id}
              </Link>
            ) : (
              <span className="flex-1 truncate text-sm text-slate-500">{note.title || note.target_id}</span>
            )}
            <span className="text-xs tabular-nums text-slate-400">{formatDateTime(note.updated_at)}</span>
            <button
              type="button"
              disabled={busyId === note.id}
              onClick={() => removeNote(note)}
              title="Удалить заметку"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-[var(--status-critical-bg)] hover:text-[var(--status-critical-fg)] disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{note.text}</p>
        </div>
      ))}
    </div>
  );
}
