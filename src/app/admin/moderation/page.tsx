"use client";

/**
 * Центр быстрого реагирования: запросы старост, быстрые фиксы с предпросмотром
 * и откатом 24 часа, слияние дубликатов тем и уведомления.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, History, Loader2, Merge, RotateCcw, Send, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { describeApiError } from "@/lib/errors";
import {
  staffCapabilities, staffFixApply, staffFixLog, staffFixPreview, staffMarkNotificationsRead,
  staffMergeTopics, staffNotifications, staffRequests, staffReviewRequest, staffRevertFix,
} from "@/lib/api/staff";

type FixChange = { field: string; label: string; before: unknown; after: unknown };

const TARGETS: Record<string, { label: string; fields: string[] }> = {
  tests: { label: "Тест", fields: ["title", "subject_id", "module_id", "topic_id", "time_limit_sec", "is_published"] },
  questions: { label: "Вопрос", fields: ["text", "answer", "subject_id", "module_id", "topic_id", "is_published"] },
  materials: { label: "Материал", fields: ["title", "external_url", "subject_id", "module_id", "topic_id", "is_published"] },
  topics: { label: "Тема", fields: ["title", "archived_at"] },
  workshop_items: { label: "Материал мастерской", fields: ["title", "summary", "topic", "tags", "status"] },
};

const FIELD_LABEL: Record<string, string> = {
  title: "Название", text: "Текст", answer: "Ответ", subject_id: "ID предмета", module_id: "ID модуля",
  topic_id: "ID темы", time_limit_sec: "Лимит, сек", is_published: "Опубликовано", external_url: "Ссылка",
  archived_at: "В архиве", summary: "Описание", topic: "Тема", tags: "Теги", status: "Статус",
};

const REQUEST_LABEL: Record<string, string> = {
  course_change: "Смена курса",
  admission_year_change: "Смена года поступления",
  material_publish: "Публикация для других групп",
  role_change: "Смена роли",
};

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AdminModerationPage() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.roles?.includes("admin"));
  const [capabilities, setCapabilities] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [target, setTarget] = useState<keyof typeof TARGETS>("tests");
  const [targetId, setTargetId] = useState("");
  const [patch, setPatch] = useState<Record<string, unknown>>({});
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<FixChange[] | null>(null);
  const [merge, setMerge] = useState({ source: "", target: "", preview: null as any });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [capabilitiesResult, requestsResult, fixesResult, notificationsResult] = await Promise.all([
      staffCapabilities(), staffRequests(), staffFixLog(), staffNotifications(),
    ]);
    if (capabilitiesResult.ok) setCapabilities(capabilitiesResult.data);
    if (requestsResult.ok) setRequests(requestsResult.data.items || []);
    if (fixesResult.ok) setActions(fixesResult.data.items || []);
    if (notificationsResult.ok) setNotifications(notificationsResult.data.items || []);
    const failure = [requestsResult, fixesResult].find((result) => !result.ok);
    if (failure && !failure.ok) setError(describeApiError(failure.error));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const fields = useMemo(() => TARGETS[target].fields, [target]);

  function resetFix() {
    setTargetId("");
    setPatch({});
    setPreview(null);
    setReason("");
  }

  async function runPreview() {
    if (!targetId.trim()) { setError("Укажите ID записи"); return; }
    setBusy("preview");
    setError("");
    const result = await staffFixPreview(target, targetId.trim(), patch);
    setBusy("");
    if (!result.ok) { setPreview(null); setError(describeApiError(result.error)); return; }
    setPreview(result.data.changes || []);
  }

  async function applyFix() {
    if (!targetId.trim()) { setError("Укажите ID записи"); return; }
    setBusy("apply");
    setError("");
    const result = await staffFixApply(target, targetId.trim(), patch, reason);
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote(`Исправлено. Откат доступен до ${formatDate(result.data.revertible_until)}.`);
    resetFix();
    await load();
  }

  async function revert(id: string) {
    setBusy(id);
    const result = await staffRevertFix(id);
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote("Действие отменено, поля восстановлены.");
    await load();
  }

  async function reviewRequest(id: string, approve: boolean) {
    setBusy(id);
    const result = await staffReviewRequest(id, approve, notes[id] || "");
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote(approve ? "Запрос одобрен." : "Запрос отклонён.");
    await load();
  }

  async function mergeTopics(previewOnly: boolean) {
    if (!merge.source.trim() || !merge.target.trim()) { setError("Укажите обе темы"); return; }
    setBusy(previewOnly ? "merge-preview" : "merge");
    const result = await staffMergeTopics(merge.source.trim(), merge.target.trim(), { preview: previewOnly, reason });
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    if (previewOnly) setMerge((current) => ({ ...current, preview: result.data.preview }));
    else {
      setNote(`Темы объединены: перенесено тестов ${result.data.preview.tests}, вопросов ${result.data.preview.questions}.`);
      setMerge({ source: "", target: "", preview: null });
      await load();
    }
  }

  async function markRead() {
    const result = await staffMarkNotificationsRead();
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    await load();
  }

  if (!capabilities?.can?.moderate) {
    return <div className="card p-8 text-center text-sm text-slate-600">Раздел доступен модераторам и администраторам.</div>;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Роли и быстрые фиксы</h1>
          <p className="page-subtitle">Запросы старост, предпросмотр изменений и откат в течение 24 часов</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/admin/workshop" className="font-semibold text-indigo-600">Модерация мастерской →</Link>
          <Link href="/admin/audit" className="font-semibold text-indigo-600">Аудит →</Link>
        </div>
      </header>

      {note && <div className="rounded-xl bg-[var(--status-ok-bg)] p-3 text-sm text-[var(--status-ok-fg)]">{note}</div>}
      {error && <div className="rounded-xl bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}

      <section className="card space-y-3 p-4">
        <h2 className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" />Быстрый фикс с предпросмотром</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <select
            value={target}
            onChange={(event) => { setTarget(event.target.value as keyof typeof TARGETS); resetFix(); }}
            className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
          >
            {Object.entries(TARGETS).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}
          </select>
          <input value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="UUID записи" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm sm:col-span-2" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {fields.map((field) => {
            const isBoolean = field === "is_published" || field === "archived_at";
            if (field === "status") return (
              <select key={field} value={String(patch[field] ?? "")} onChange={(event) => setPatch((current) => ({ ...current, [field]: event.target.value || null }))} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
                <option value="">Статус…</option>
                {["draft", "pending", "published", "hidden", "rejected"].map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            );
            if (field === "text" || field === "summary") return (
              <textarea key={field} value={String(patch[field] ?? "")} onChange={(event) => setPatch((current) => ({ ...current, [field]: event.target.value }))} rows={3} placeholder={FIELD_LABEL[field]} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm sm:col-span-2" />
            );
            if (isBoolean) return (
              <label key={field} className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
                <input type="checkbox" checked={Boolean(patch[field])} onChange={(event) => setPatch((current) => ({ ...current, [field]: field === "archived_at" ? (event.target.checked ? new Date().toISOString() : null) : event.target.checked }))} className="h-4 w-4" />
                {FIELD_LABEL[field]}
              </label>
            );
            return (
              <input
                key={field}
                value={String(patch[field] ?? "")}
                onChange={(event) => {
                  const raw = event.target.value;
                  const value = field === "time_limit_sec" ? (raw === "" ? null : Number(raw)) : raw;
                  setPatch((current) => ({ ...current, [field]: value }));
                }}
                placeholder={FIELD_LABEL[field]}
                inputMode={field === "time_limit_sec" ? "numeric" : undefined}
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
              />
            );
          })}
        </div>
        <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Причина / комментарий для аудита" className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void runPreview()} disabled={busy === "preview"} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold">Предпросмотр</button>
          <button type="button" onClick={() => void applyFix()} disabled={busy === "apply" || !preview?.length} className="btn-primary inline-flex items-center gap-2 text-sm">{busy === "apply" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Применить</button>
        </div>
        {preview && (
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <b>Что изменится:</b>
            {preview.length === 0 ? <p className="mt-1 text-slate-500">Изменений нет.</p> : (
              <ul className="mt-2 space-y-1">
                {preview.map((change) => (
                  <li key={change.field}><span className="font-semibold">{change.label}:</span> {formatValue(change.before)} → {formatValue(change.after)}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="flex items-center gap-2 font-bold"><Merge className="h-4 w-4" />Слияние дубликатов тем</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={merge.source} onChange={(event) => setMerge({ ...merge, source: event.target.value })} placeholder="ID темы-дубля" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
          <input value={merge.target} onChange={(event) => setMerge({ ...merge, target: event.target.value })} placeholder="ID основной темы" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void mergeTopics(true)} disabled={busy === "merge-preview"} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold">Проверить</button>
          <button type="button" onClick={() => void mergeTopics(false)} disabled={busy === "merge"} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold">Объединить</button>
        </div>
        {merge.preview && (
          <p className="rounded-xl bg-slate-50 p-3 text-sm">Переместится тестов: <b>{merge.preview.tests}</b>, вопросов: <b>{merge.preview.questions}</b>. Исходная тема уйдёт в архив.</p>
        )}
      </section>

      {isAdmin && (
        <section className="card space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-bold"><Send className="h-4 w-4" />Запросы старост ({requests.filter((request) => request.status === "pending").length})</h2>
          {requests.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-sm text-slate-500">Запросов нет.</p> : (
            <div className="space-y-2">
              {requests.map((request) => (
                <article key={request.id} className="rounded-xl border border-[var(--border)] p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="flex-1">{REQUEST_LABEL[request.kind] || request.kind}</b>
                    <span className={"rounded-full px-2 py-0.5 text-[11px] font-bold " + (request.status === "pending" ? "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]" : "bg-slate-100 text-slate-500")}>{request.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{request.reason || "Без комментария"}</p>
                  <p className="text-[11px] text-slate-400">{formatDate(request.created_at)} · {JSON.stringify(request.payload)}</p>
                  {request.status === "pending" && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input value={notes[request.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Комментарий" className="min-w-[160px] flex-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs" />
                      <button type="button" onClick={() => void reviewRequest(request.id, true)} disabled={busy === request.id} className="inline-flex items-center gap-1 rounded-lg bg-[var(--status-ok-fg)] px-2.5 py-1.5 text-xs font-semibold text-white"><Check className="h-3.5 w-3.5" />Одобрить</button>
                      <button type="button" onClick={() => void reviewRequest(request.id, false)} disabled={busy === request.id} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold"><X className="h-3.5 w-3.5" />Отклонить</button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card space-y-2 p-4">
          <h2 className="flex items-center gap-2 font-bold"><History className="h-4 w-4" />Журнал фиксов</h2>
          {loading ? <p className="text-sm text-slate-500">Загрузка…</p> : actions.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-sm text-slate-500">Пока пусто.</p> : actions.map((action) => {
            const canRevert = !action.reverted_at && Date.parse(String(action.revertible_until)) > Date.now();
            return (
              <article key={action.id} className="rounded-xl border border-[var(--border)] p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="flex-1">{action.action === "merge_topics" ? "Слияние тем" : action.target_type} · {action.actor_role}</b>
                  <span className="text-[11px] text-slate-400">{formatDate(action.created_at)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{action.reason || "без комментария"}</p>
                <p className="text-[11px] text-slate-500">
                  {action.before && typeof action.before === "object" ? Object.entries(action.before).filter(([key]) => !key.endsWith("_ids")).map(([key, value]) => `${key}: ${formatValue(value)}`).join(" · ") : ""}
                </p>
                {action.reverted_at ? <p className="text-[11px] text-slate-400">Отменено {formatDate(action.reverted_at)}</p> : canRevert ? (
                  <button type="button" onClick={() => void revert(action.id)} disabled={busy === action.id} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold"><RotateCcw className="h-3.5 w-3.5" />Откатить</button>
                ) : <p className="text-[11px] text-slate-400">Окно отката истекло</p>}
              </article>
            );
          })}
        </section>

        <section className="card space-y-2 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Уведомления</h2>
            {notifications.some((item) => !item.read_at) && <button type="button" onClick={() => void markRead()} className="text-xs font-semibold text-indigo-600">Прочитать все</button>}
          </div>
          {notifications.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-sm text-slate-500">Нет уведомлений.</p> : notifications.map((item) => (
            <article key={item.id} className={"rounded-xl border p-3 text-sm " + (item.read_at ? "border-[var(--border)]" : "border-indigo-200 bg-indigo-50/40")}>
              <b>{item.title}</b>
              <p className="text-xs text-slate-600">{item.body}</p>
              <p className="text-[11px] text-slate-400">{formatDate(item.created_at)}</p>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
