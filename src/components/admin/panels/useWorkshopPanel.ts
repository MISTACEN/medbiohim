"use client";

/**
 * Модерация мастерской: состояние и действия — очередь публикаций, жалобы
 * и переключатель режима. Открытая публикация — по умолчанию; ручной режим
 * включают, когда пошёл поток материалов с чужими данными или дублями.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { describeApiError } from "@/lib/errors";
import {
  moderateWorkshopItem, resolveWorkshopReport, updateWorkshopSettings,
  workshopModerationQueue, workshopReports, workshopSettings,
} from "@/lib/api/workshop";

export function useWorkshopPanel() {
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

  return {
    isAdmin, canModerate, settings,
    queue, reports, loading, busy, note, error, moderationNote, setModerationNote,
    load, saveMode, moderate, closeReport,
  };
}
