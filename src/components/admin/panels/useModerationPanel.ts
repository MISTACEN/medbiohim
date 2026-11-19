"use client";

/**
 * Центр быстрого реагирования: состояние и действия — запросы старост,
 * быстрые фиксы с предпросмотром и откатом 24 часа, слияние дубликатов тем
 * и уведомления.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { describeApiError } from "@/lib/errors";
import {
  staffCapabilities, staffFixApply, staffFixLog, staffFixPreview, staffMarkNotificationsRead,
  staffMergeTopics, staffNotifications, staffRequests, staffReviewRequest, staffRevertFix,
} from "@/lib/api/staff";
import {
  MODERATION_TARGETS,
  formatModerationDate,
  type ModerationFixChange,
} from "@/components/admin/panels/model";

export function useModerationPanel() {
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
  const [target, setTarget] = useState<keyof typeof MODERATION_TARGETS>("tests");
  const [targetId, setTargetId] = useState("");
  const [patch, setPatch] = useState<Record<string, unknown>>({});
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<ModerationFixChange[] | null>(null);
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

  const fields = useMemo(() => MODERATION_TARGETS[target].fields, [target]);

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
    setNote(`Исправлено. Откат доступен до ${formatModerationDate(result.data.revertible_until)}.`);
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

  return {
    isAdmin, capabilities,
    requests, actions, notifications, notes, setNotes,
    loading, busy, note, error,
    target, setTarget, targetId, setTargetId,
    patch, setPatch, reason, setReason,
    preview, merge, setMerge, fields,
    load, resetFix, runPreview, applyFix,
    revert, reviewRequest, mergeTopics, markRead,
  };
}
