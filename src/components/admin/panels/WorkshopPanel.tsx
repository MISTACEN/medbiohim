"use client";

/**
 * Модерация мастерской: композиция. Очередь публикаций, жалобы и режим.
 * Открытая публикация — по умолчанию; ручной режим включают, когда пошёл
 * поток материалов с чужими данными или дублями.
 */
import Link from "next/link";
import { Check, Loader2, Settings2, ShieldCheck } from "lucide-react";
import { WorkshopQueue } from "@/components/admin/panels/WorkshopQueue";
import { WorkshopReports } from "@/components/admin/panels/WorkshopReports";
import { useWorkshopPanel } from "@/components/admin/panels/useWorkshopPanel";

export function WorkshopPanel() {
  const panel = useWorkshopPanel();
  const {
    isAdmin, canModerate, settings,
    queue, reports, loading, busy, note, error, moderationNote, setModerationNote,
    saveMode, moderate, closeReport,
  } = panel;

  if (!canModerate) {
    return <div className="card p-8 text-center text-sm text-slate-600">Раздел доступен модераторам и администраторам.</div>;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Мастерская: модерация</h1>
          <p className="page-subtitle">Очередь публикаций, жалобы и режим публикации</p>
        </div>
        <Link href="/workshop" className="text-sm font-semibold text-indigo-600">Открыть мастерскую →</Link>
      </header>

      {note && <div className="rounded-xl bg-[var(--status-ok-bg)] p-3 text-sm text-[var(--status-ok-fg)]">{note}</div>}
      {error && <div className="rounded-xl bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}

      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-bold"><Settings2 className="h-4 w-4" />Режим публикации</h2>
          <span className={"inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold " + (settings.moderation_mode === "manual" ? "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]" : "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]")}>
            {settings.moderation_mode === "manual" ? <ShieldCheck className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            {settings.moderation_mode === "manual" ? "Ручная проверка" : "Открытая публикация"}
          </span>
        </div>
        <p className="text-sm text-slate-600">
          Открытая публикация удобна по умолчанию. Ручной режим включайте, если появились материалы с чужими данными
          или дубли: тогда каждый новый материал ждёт проверки.
        </p>
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void saveMode("open")} disabled={busy === "settings" || settings.moderation_mode === "open"} className={settings.moderation_mode === "open" ? "btn-primary text-sm" : "rounded-xl border border-[var(--border)] px-3 py-2 text-sm"}>
              Открытая
            </button>
            <button type="button" onClick={() => void saveMode("manual")} disabled={busy === "settings" || settings.moderation_mode === "manual"} className={settings.moderation_mode === "manual" ? "btn-primary text-sm" : "rounded-xl border border-[var(--border)] px-3 py-2 text-sm"}>
              Ручная проверка
            </button>
          </div>
        ) : <p className="text-xs text-slate-500">Переключать режим может только администратор.</p>}
      </section>

      {loading ? (
        <div className="card flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Загружаем очередь…</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <WorkshopQueue
            queue={queue}
            canModerate={canModerate}
            moderationNote={moderationNote}
            onNote={(itemId, value) => setModerationNote((current) => ({ ...current, [itemId]: value }))}
            busy={busy}
            onModerate={(id, action) => void moderate(id, action)}
          />

          <WorkshopReports
            reports={reports}
            busy={busy}
            onCloseReport={(id, status) => void closeReport(id, status)}
            onHideItem={(itemId) => void moderate(itemId, "hide")}
          />
        </div>
      )}
    </div>
  );
}
