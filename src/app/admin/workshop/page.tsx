"use client";

/**
 * Модерация мастерской: очередь публикаций, жалобы и переключатель режима.
 * Открытая публикация — по умолчанию; ручной режим включают, когда пошёл
 * поток материалов с чужими данными или дублями.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, EyeOff, Flag, Loader2, Settings2, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { describeApiError } from "@/lib/errors";
import {
  moderateWorkshopItem, resolveWorkshopReport, updateWorkshopSettings,
  workshopModerationQueue, workshopReports, workshopSettings,
} from "@/lib/api/workshop";

const KIND_LABEL: Record<string, string> = {
  photo_lecture: "Фотолекция",
  notes: "Конспект",
  test_questions: "Вопросы",
  pdf: "PDF",
  other: "Материал",
};

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AdminWorkshopPage() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.roles?.includes("admin"));
  const canModerate = Boolean(user?.roles?.some((role) => role === "moderator" || role === "admin"));
  const [settings, setSettings] = useState({ moderation_mode: "open", personal_data_warning: true });
  const [queue, setQueue] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [moderationNote, setModerationNote] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [settingsResult, queueResult, reportsResult] = await Promise.all([
      workshopSettings(), workshopModerationQueue(), workshopReports(),
    ]);
    if (settingsResult.ok) setSettings({
      moderation_mode: settingsResult.data.moderation_mode === "manual" ? "manual" : "open",
      personal_data_warning: settingsResult.data.personal_data_warning !== false,
    });
    if (queueResult.ok) setQueue(queueResult.data.items || []);
    if (reportsResult.ok) setReports(reportsResult.data.items || []);
    const failure = [settingsResult, queueResult, reportsResult].find((result) => !result.ok);
    if (failure && !failure.ok) setError(describeApiError(failure.error));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveMode(mode: "open" | "manual") {
    setBusy("settings");
    const result = await updateWorkshopSettings({ moderation_mode: mode, personal_data_warning: settings.personal_data_warning });
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setSettings((current) => ({ ...current, moderation_mode: mode }));
    setNote(mode === "manual" ? "Включена ручная проверка: новые материалы ждут модератора." : "Открытая публикация: материалы появляются сразу.");
  }

  async function moderate(id: string, action: "approve" | "reject" | "hide" | "unhide") {
    setBusy(id + action);
    const result = await moderateWorkshopItem(id, { action, note: moderationNote[id] || undefined });
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote(action === "approve" ? "Материал опубликован." : action === "reject" ? "Материал отклонён — автор увидит причину." : "Видимость материала изменена.");
    await load();
  }

  async function closeReport(id: string, status: "resolved" | "dismissed") {
    setBusy(id);
    const result = await resolveWorkshopReport(id, status);
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote(status === "resolved" ? "Жалоба закрыта." : "Жалоба отклонена.");
    await load();
  }

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
          <section className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" />На проверке ({queue.length})</h2>
            {queue.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-slate-500">Очередь пуста.</p> : (
              <div className="space-y-3">
                {queue.map((item) => (
                  <article key={item.id} className="rounded-xl border border-[var(--border)] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">{KIND_LABEL[item.kind] || item.kind}</span>
                          {item.status === "hidden" && <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--status-warn-fg)]">скрыт</span>}
                          {Number(item.report_count) > 0 && <span className="rounded-full bg-[var(--status-critical-bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--status-critical-fg)]">жалоб: {item.report_count}</span>}
                        </div>
                        <Link href="/workshop" className="mt-1 block truncate font-bold hover:text-indigo-600">{item.title}</Link>
                        <p className="text-xs text-slate-500">{formatDate(item.created_at)} · v{item.version_no}</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <button type="button" onClick={() => void moderate(item.id, "approve")} disabled={busy.startsWith(item.id)} className="inline-flex items-center gap-1 rounded-lg bg-[var(--status-ok-fg)] px-2.5 py-1.5 text-xs font-semibold text-white"><Check className="h-3.5 w-3.5" />Одобрить</button>
                        <button type="button" onClick={() => void moderate(item.id, "reject")} disabled={busy.startsWith(item.id)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--status-critical-fg)]"><X className="h-3.5 w-3.5" />Отклонить</button>
                        {item.status !== "hidden" && <button type="button" onClick={() => void moderate(item.id, "hide")} disabled={busy.startsWith(item.id)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold"><EyeOff className="h-3.5 w-3.5" />Скрыть</button>}
                        {/* Блок 1: хим-тесты из Workshop становятся полноценными вопросами банка. */}
                        {item.kind === "test_questions" && canModerate && (
                          <Link href={`/admin/workshop-convert?item=${item.id}`} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700">Сделать тестом</Link>
                        )}
                      </div>
                    </div>
                    {!!item.personal_data_flags?.length && (
                      <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-[var(--status-warn-bg)] p-2 text-xs text-[var(--status-warn-fg)]"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Метки: {item.personal_data_flags.join(", ")}</p>
                    )}
                    <input value={moderationNote[item.id] || ""} onChange={(event) => setModerationNote((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Комментарий автору (необязательно)" className="mt-2 w-full rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs" />
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 font-bold"><Flag className="h-4 w-4" />Жалобы ({reports.filter((report) => report.status === "open").length})</h2>
            {reports.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-slate-500">Жалоб нет.</p> : (
              <div className="space-y-2">
                {reports.map((report) => (
                  <article key={report.id} className="rounded-xl border border-[var(--border)] p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="min-w-0 flex-1 truncate">{report.item?.title || "Материал"}</b>
                      <span className={"rounded-full px-2 py-0.5 text-[11px] font-bold " + (report.status === "open" ? "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]" : "bg-slate-100 text-slate-500")}>
                        {report.status === "open" ? "открыта" : report.status === "resolved" ? "закрыта" : "отклонена"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{report.reason}</p>
                    <p className="text-[11px] text-slate-400">{formatDate(report.created_at)}</p>
                    {report.status === "open" && (
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => void closeReport(report.id, "resolved")} disabled={busy === report.id} className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--status-ok-fg)]">Закрыть</button>
                        <button type="button" onClick={() => void closeReport(report.id, "dismissed")} disabled={busy === report.id} className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold">Отклонить</button>
                        <button type="button" onClick={() => { if (report.item?.id) void moderate(String(report.item.id), "hide"); }} disabled={!report.item?.id || busy.startsWith(String(report.item?.id))} className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--status-warn-fg)]">Скрыть материал</button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
