"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark, ExternalLink, FileText, Star, StickyNote, Trash2 } from "lucide-react";
import { useApiRequest } from "@/hooks/useApiRequest";
import { deleteNote, listFavorites, listNotes, toggleFavorite } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { ErrorState } from "@/components/ui/ErrorState";

type BookmarkItem = {
  target_type: string;
  target_id: string;
  created_at: string;
  title: string | null;
  href: string | null;
  missing?: boolean;
};

type NoteItem = BookmarkItem & { id: string; text: string; updated_at: string };

const TYPE_LABEL: Record<string, string> = {
  question: "Вопрос",
  material: "Материал",
  topic: "Тема",
  test: "Тест",
  subject: "Предмет",
  module: "Модуль",
  lecture: "Лекция",
  ticket: "Билет",
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

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
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function BookmarksPage() {
  const [tab, setTab] = useState<"favorites" | "notes">("favorites");
  const [favorites, setFavorites] = useState<BookmarkItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { loading: favoritesLoading, error: favoritesLoadError, reload: reloadFavorites } = useApiRequest(
    async (signal) => {
      const res = await listFavorites({ signal });
      if (res.ok) {
        setFavorites(res.data?.items || []);
        setFavoritesError(null);
      } else {
        setFavoritesError(describeApiError(res.error));
      }
      return res.ok;
    },
    []
  );

  const { loading: notesLoading, error: notesLoadError, reload: reloadNotes } = useApiRequest(
    async (signal) => {
      const res = await listNotes({ signal });
      if (res.ok) {
        setNotes(res.data?.items || []);
        setNotesError(null);
      } else {
        setNotesError(describeApiError(res.error));
      }
      return res.ok;
    },
    []
  );

  async function removeFavorite(item: BookmarkItem) {
    setBusyId(item.target_id);
    const res = await toggleFavorite(item.target_type, item.target_id);
    if (res.ok) {
      setFavorites((current) => current.filter((f) => !(f.target_type === item.target_type && f.target_id === item.target_id)));
      setFavoritesError(null);
    } else {
      setFavoritesError(describeApiError(res.error));
    }
    setBusyId(null);
  }

  async function removeNote(note: NoteItem) {
    setBusyId(note.id);
    const res = await deleteNote(note.id);
    if (res.ok) {
      setNotes((current) => current.filter((n) => n.id !== note.id));
      setNotesError(null);
    } else {
      setNotesError(describeApiError(res.error));
    }
    setBusyId(null);
  }

  const loading = favoritesLoading || notesLoading;
  const loadError = tab === "favorites" ? favoritesLoadError : notesLoadError;
  const shownError = tab === "favorites" ? favoritesError : notesError;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold" style={{ color: "var(--text)" }}>
        <Bookmark className="h-6 w-6" />
        Закладки
      </h1>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        Всё, что вы отметили и куда оставили заметки, — в одном месте.
      </p>

      <div className="mt-5 flex gap-2" role="tablist" aria-label="Типы закладок">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "favorites"}
          onClick={() => setTab("favorites")}
          className={"flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold " + (tab === "favorites" ? "bg-indigo-600 text-white" : "border text-slate-600")}
          style={tab === "favorites" ? undefined : { borderColor: "var(--border)" }}
        >
          <Star className="h-4 w-4" /> Избранное{favorites.length ? ` (${favorites.length})` : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "notes"}
          onClick={() => setTab("notes")}
          className={"flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold " + (tab === "notes" ? "bg-indigo-600 text-white" : "border text-slate-600")}
          style={tab === "notes" ? undefined : { borderColor: "var(--border)" }}
        >
          <StickyNote className="h-4 w-4" /> Заметки{notes.length ? ` (${notes.length})` : ""}
        </button>
      </div>

      {loading ? (
        <div className="mt-6 space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : loadError ? (
        <div className="mt-6">
          <ErrorState message={loadError} retry={tab === "favorites" ? reloadFavorites : reloadNotes} />
        </div>
      ) : (
        <>
          {shownError && (
            <div className="mt-4 rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700" role="alert">
              {shownError}
            </div>
          )}
          {tab === "favorites" ? (
            favorites.length ? (
              <div className="mt-4 space-y-2">
                {favorites.map((item) => (
                  <BookmarkRow key={`${item.target_type}:${item.target_id}`} item={item} onRemove={removeFavorite} busy={busyId === item.target_id} />
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed p-8 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                <Star className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                Пока ничего не отмечено. Звёздочка «в избранное» есть у вопросов в{" "}
                <Link href="/practice" className="font-semibold text-indigo-600">базе вопросов</Link>.
              </div>
            )
          ) : notes.length ? (
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
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{note.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed p-8 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
              <StickyNote className="mx-auto mb-2 h-6 w-6 text-slate-300" />
              Заметок нет. Их можно оставить к любому вопросу в{" "}
              <Link href="/practice" className="font-semibold text-indigo-600">базе вопросов</Link>.
            </div>
          )}
        </>
      )}
    </div>
  );
}
