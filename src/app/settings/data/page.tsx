"use client";

import Link from "next/link";
import clsx from "clsx";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { DataExportCard } from "@/components/settings/DataExportCard";
import { DataDeletionCard } from "@/components/settings/DataDeletionCard";
import { DataDeletionInfo } from "@/components/settings/DataDeletionInfo";
import { useDataAccount } from "@/components/settings/useDataAccount";

export default function AccountDataPage() {
  const page = useDataAccount();
  const { loading, busy, notice, actionError, load, dialog } = page;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm">
            <Link href="/settings" className="inline-flex items-center gap-1 text-[var(--muted)] hover:underline">
              <ArrowLeft className="h-4 w-4" /> Настройки
            </Link>
          </div>
          <h1 className="page-title">Данные и аккаунт</h1>
          <p className="page-subtitle">Скачивание личных данных и удаление аккаунта с grace-периодом</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busy !== null}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60"
        >
          <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} /> Обновить
        </button>
      </div>

      {(notice || actionError) && (
        <div
          className={clsx(
            "rounded-xl border px-4 py-3 text-sm",
            actionError
              ? "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]"
              : "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]"
          )}
          role="status"
        >
          {actionError || notice}
        </div>
      )}

      <DataExportCard page={page} />

      <DataDeletionCard page={page} />

      <DataDeletionInfo />

      {dialog}
    </div>
  );
}
