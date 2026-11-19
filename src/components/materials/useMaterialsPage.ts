"use client";

/** Материалы: загрузка списка, фильтр по предмету, поиск и просмотр. */
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { listMaterials, ApiMaterial, hasToken } from "@/lib/api";
import { describeApiError } from "@/lib/errors";

import { compareRu } from "@/lib/collation";

export function useMaterialsPage() {
  const searchParams = useSearchParams();
  const initialSubjectSlug = searchParams.get("subject_slug") || "";
  // Ссылка из поиска ведёт сразу к нужному материалу: заполняем и фильтр.
  const initialQuery = searchParams.get("q") || "";
  const [items, setItems] = useState<ApiMaterial[]>([]);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState(initialQuery);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [noteIsError, setNoteIsError] = useState(false);
  const [active, setActive] = useState<ApiMaterial | null>(null);

  async function load(query = q.trim()) {
    setLoading(true);
    setNote(null);
    setNoteIsError(false);
    const r = await listMaterials({ subjectSlug: initialSubjectSlug || undefined, q: query || undefined });
    if (r.ok) setItems(r.data.items || []);
    else {
      setNote(describeApiError(r.error));
      setNoteIsError(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!hasToken()) {
      setLoading(false);
      setNote("Войдите, чтобы открыть материалы.");
      return;
    }
    void load(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubjectSlug, initialQuery]);

  const visible = items.filter((m) => filter === "all" || String(m.subject_name || "") === filter);
  const subjectNames = Array.from(new Set(items.map((m) => String(m.subject_name || "")).filter(Boolean))).sort(compareRu);

  return {
    q, setQ,
    filter, setFilter,
    loading,
    note,
    noteIsError,
    active,
    setActive,
    load,
    visible,
    subjectNames,
  };
}

export type MaterialsPageState = ReturnType<typeof useMaterialsPage>;
