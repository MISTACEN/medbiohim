"use client";

import { Bookmark, Star, StickyNote } from "lucide-react";
import { ErrorState } from "@/components/ui/ErrorState";
import { Tabs } from "@/components/ui/Tabs";
import { BookmarksFavorites, BookmarksNotes } from "@/components/bookmarks/BookmarkLists";
import { useBookmarksPage } from "@/components/bookmarks/useBookmarksPage";

export default function BookmarksPage() {
  const page = useBookmarksPage();
  const { tab, setTab, favorites, notes, loading, loadError, shownError, reloadFavorites, reloadNotes } = page;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold" style={{ color: "var(--text)" }}>
        <Bookmark className="h-6 w-6" />
        Закладки
      </h1>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        Всё, что вы отметили и куда оставили заметки, — в одном месте.
      </p>

      <Tabs
        className="mt-5"
        label="Типы закладок"
        value={tab}
        onChange={setTab}
        items={[
          { id: "favorites", label: "Избранное", icon: Star, count: favorites.length },
          { id: "notes", label: "Заметки", icon: StickyNote, count: notes.length },
        ]}
      />

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
            <div className="mt-4 rounded-xl bg-[var(--status-critical-bg)] px-4 py-2 text-sm text-[var(--status-critical-fg)]" role="alert">
              {shownError}
            </div>
          )}
          {tab === "favorites" ? <BookmarksFavorites page={page} /> : <BookmarksNotes page={page} />}
        </>
      )}
    </div>
  );
}
