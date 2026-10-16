"use client";

import { useEffect, useState } from "react";
import { listSchedule, getScheduleMeta, hasToken, type ScheduleItem, type ScheduleMeta } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";

const SEMESTER_FROM = "2026-09-01";
const SEMESTER_TO = "2027-01-31";

/**
 * Temporary recovery page after accidental overwrite of the full schedule UI.
 * Keeps meta.periods defensive so Cloudflare stub meta cannot white-screen the app.
 * Restore full UI from artifacts/schedule-page-guarded.tsx or commit d534fce.
 */
export default function SchedulePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [meta, setMeta] = useState<ScheduleMeta>({ periods: [], duration_rules: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasToken()) {
      setLoading(false);
      setError("Войдите, чтобы увидеть расписание");
      return;
    }
    setLoading(true);
    setError(null);
    void Promise.all([
      listSchedule(SEMESTER_FROM, SEMESTER_TO, user?.groupId),
      getScheduleMeta(user?.course, user?.semester),
    ]).then(([res, metaRes]) => {
      if (res.ok) {
        setItems(Array.isArray(res.data?.items) ? res.data.items : []);
        if (!res.data?.items?.length) {
          setError(
            user?.groupName
              ? "Нет занятий для вашей группы в выбранном периоде"
              : "Учебная группа не назначена"
          );
        }
      } else {
        setItems([]);
        setError(res.error?.message || "Не удалось загрузить расписание");
      }
      if (metaRes.ok && metaRes.data) {
        const raw = metaRes.data as Partial<{ periods: unknown; duration_rules: unknown }> & Record<string, unknown>;
        setMeta({
          ...raw,
          periods: Array.isArray(raw.periods) ? raw.periods : [],
          duration_rules: Array.isArray(raw.duration_rules) ? raw.duration_rules : [],
        } as ScheduleMeta);
      }
      setLoading(false);
    });
  }, [user?.groupId, user?.course, user?.semester]);

  const periods = Array.isArray(meta?.periods) ? meta.periods : [];
  const activePeriod = periods.find((p: any) => true);

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <h1 className="text-xl font-bold">Расписание</h1>
      <p className="text-sm opacity-70">
        Упрощённый экран (восстановление после сбоя деплоя). Полный календарь — в{" "}
        <code>artifacts/schedule-page-guarded.tsx</code>.
      </p>
      {activePeriod && (
        <p className="text-sm">
          Период: {(activePeriod as any).title || (activePeriod as any).start_date || "—"}
        </p>
      )}
      {loading && <p>Загрузка…</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!loading && !error && (
        <ul className="space-y-2">
          {items.slice(0, 50).map((it) => (
            <li key={String(it.id)} className="rounded border p-2 text-sm">
              <strong>{it.date}</strong> {it.start_time}–{it.end_time} · {it.subject_name || "Занятие"} · {it.type}
            </li>
          ))}
          {!items.length && <li className="text-sm opacity-60">Нет записей</li>}
        </ul>
      )}
    </div>
  );
}
