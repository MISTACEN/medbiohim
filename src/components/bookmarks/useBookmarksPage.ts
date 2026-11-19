"use client";

/** Закладки: избранное и заметки, две вкладки с удалением записей. */
import { useState } from "react";
import { useApiRequest } from "@/hooks/useApiRequest";
import { deleteNote, listFavorites, listNotes, toggleFavorite } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { type BookmarkItem, type NoteItem } from "@/components/bookmarks/model";

export function useBookmarksPage() {
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

  return {
    tab,
    setTab,
    favorites,
    notes,
    favoritesError,
    notesError,
    busyId,
    loading,
    loadError,
    shownError,
    reloadFavorites,
    reloadNotes,
    removeFavorite,
    removeNote,
  };
}

export type BookmarksPageState = ReturnType<typeof useBookmarksPage>;
