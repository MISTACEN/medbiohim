"use client";

/** Данные и аккаунт: выгрузка JSON и отложенное удаление с grace-периодом. */
import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { describeApiError } from "@/lib/errors";
import {
  cancelAccountDeletion,
  downloadMyData,
  getAccountDeletion,
  requestAccountDeletion,
  type AccountDeletionState,
} from "@/lib/features-api";
import { formatBytes } from "@/components/settings/model";

export function useDataAccount() {
  const { confirm, dialog } = useConfirm();
  const [deletion, setDeletion] = useState<AccountDeletionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; requestId?: string } | null>(null);
  const [busy, setBusy] = useState<"download" | "request" | "cancel" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonOpen, setReasonOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await getAccountDeletion();
    if (result.ok) {
      setDeletion(result.data);
    } else {
      setDeletion(null);
      setLoadError({ message: describeApiError(result.error), requestId: result.requestId });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDownload() {
    setBusy("download");
    setNotice(null);
    setActionError(null);
    const result = await downloadMyData();
    setBusy(null);
    if (!result.ok) {
      // Ошибку сервера показываем как есть: файл не создан — значит, не «готово».
      setActionError(result.message);
      return;
    }
    setNotice(`Файл ${result.filename} сохранён (${formatBytes(result.bytes)}).`);
  }

  async function onRequestDeletion() {
    const approved = await confirm({
      title: "Запросить удаление аккаунта?",
      description:
        "Аккаунт будет помечен к удалению и останется рабочим весь grace-период. " +
        "Передумать можно кнопкой «Отменить удаление» — до даты исполнения.",
      confirmLabel: "Запросить удаление",
      cancelLabel: "Не сейчас",
      danger: true,
    });
    if (!approved) return;
    setBusy("request");
    setNotice(null);
    setActionError(null);
    const result = await requestAccountDeletion(reason.trim() || undefined);
    setBusy(null);
    if (!result.ok) {
      setActionError(describeApiError(result.error));
      return;
    }
    setDeletion(result.data);
    setReason("");
    setReasonOpen(false);
    setNotice(
      result.data.status === "already_requested"
        ? "Запрос на удаление уже был создан — показываем его дату."
        : "Запрос создан. До даты исполнения аккаунт работает как обычно."
    );
  }

  async function onCancelDeletion() {
    const approved = await confirm({
      title: "Отменить удаление аккаунта?",
      description: "Запрос будет закрыт, аккаунт и все данные останутся на месте.",
      confirmLabel: "Отменить удаление",
      cancelLabel: "Оставить как есть",
    });
    if (!approved) return;
    setBusy("cancel");
    setNotice(null);
    setActionError(null);
    const result = await cancelAccountDeletion();
    setBusy(null);
    if (!result.ok) {
      setActionError(describeApiError(result.error));
      // Отмена могла не пройти, потому что запрос уже исполнен: обновляем статус.
      await load();
      return;
    }
    setDeletion(result.data);
    setNotice("Удаление отменено. Аккаунт остаётся активным.");
  }

  const status = deletion?.status ?? null;
  // `already_requested` приходит на повторный запрос: активный запрос уже есть,
  // поэтому показываем тот же блок с датой исполнения и кнопкой отмены.
  const scheduled = status === "scheduled" || status === "already_requested";
  const executed = status === "executed" || deletion?.deletion_executed === true;

  return {
    dialog,
    deletion,
    loading,
    loadError,
    busy,
    notice,
    actionError,
    reason,
    setReason,
    reasonOpen,
    setReasonOpen,
    load,
    onDownload,
    onRequestDeletion,
    onCancelDeletion,
    status,
    scheduled,
    executed,
  };
}

export type DataAccountState = ReturnType<typeof useDataAccount>;
