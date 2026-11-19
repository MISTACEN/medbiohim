"use client";

/** ДЗ, файлы и диагностика: композиция вкладок. Навигация по разделам — в общем AdminNav. */
import Link from "next/link";
import { Activity, HardDrive, RefreshCw, Settings2, ShieldCheck } from "lucide-react";
import { hasToken } from "@/lib/api";
import { AdminMissingTools } from "@/components/admin/AdminMissingTools";
import { ToolsStorageTab } from "@/components/admin/panels/ToolsStorageTab";
import { useToolsPanel, type ToolsTab } from "@/components/admin/panels/useToolsPanel";

export function ToolsPanel() {
  const panel = useToolsPanel();
  const {
    user, backendHealth, error, setError, refreshing,
    tab, setTab, fileAudit, fileAuditing,
    mediaCapabilities, validation, validating,
    presence, transport,
    load, validateContent, validateFiles,
  } = panel;

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">CMS Медбиохим</h1>
        <p className="page-subtitle">Сначала войдите</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  const tabs: Array<[ToolsTab, string, typeof Activity]> = [
    ["learning", "ДЗ и сообщество", ShieldCheck],
    ["storage", "Файлы / Storage", HardDrive],
    ["system", "Система", Settings2],
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">ДЗ, файлы и диагностика</h1>
          <p className="page-subtitle">
            Домашние задания, материалы, сообщество, Storage и состояние backend.
            {user?.name ? ` · ${user.name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => void load()}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Обновить
          </button>
          <button type="button" className="btn-secondary" disabled={validating} onClick={() => void validateContent()}>
            {validating ? "Проверяю…" : "Проверить контент"}
          </button>
        </div>
      </header>

      {transport && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-xs text-slate-600" role="status" aria-live="polite">
          <span className="font-semibold text-slate-800">Маршрут API</span>
          <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">
            {transport.source === "cloudflare" ? "Cloudflare Worker" :
              transport.source === "spaceweb" ? "SpaceWeb PHP" :
              transport.source === "spaceweb-fallback" ? "Аварийный SpaceWeb fallback" :
              transport.source === "compatibility-fallback" ? "Совместимый fallback" :
              "Cloudflare недоступен"}
          </span>
          {transport.fallback && <span className="font-medium text-[var(--status-warn-fg)]">Основной запрос не обслужен Cloudflare; использован резервный маршрут.</span>}
          <span className="text-slate-500">Последний запрос: <code>{transport.path}</code></span>
          <span className="text-slate-400">{new Date(transport.at).toLocaleTimeString()}</span>
        </div>
      )}

      {error && <div className="rounded-xl bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}
      {validation && (
        <div className={"rounded-xl border px-4 py-3 text-sm " + (validation.ok ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]")}>
          <div className="font-semibold">{validation.ok ? "Целостность контента в норме" : "Найдены проблемы: " + validation.count}</div>
          <div className="mt-1 text-xs opacity-80">Проверено: тесты {validation.checked?.tests ?? "—"}, вопросы {validation.checked?.questions ?? "—"}, связи {validation.checked?.test_questions ?? "—"}, карточки {validation.checked?.trainer_cards ?? "—"}, материалы {validation.checked?.materials ?? "—"}, exam_questions {validation.checked?.exam_questions ?? "—"}.</div>
          {!validation.ok && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(validation.issues || [], null, 2)}</pre>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${tab === id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "learning" && <AdminMissingTools onMessage={(m, err) => setError(err ? m : "")} />}

      {tab === "storage" && (
        <ToolsStorageTab
          fileAudit={fileAudit}
          fileAuditing={fileAuditing}
          mediaCapabilities={mediaCapabilities}
          onValidateFiles={() => void validateFiles()}
        />
      )}

      {tab === "system" && (
        <div className="card space-y-4">
          <h2 className="text-lg font-bold">Состояние backend</h2>
          <pre className="overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            {JSON.stringify(backendHealth || { status: "нет ответа" }, null, 2)}
          </pre>
          <button type="button" className="btn-secondary" onClick={() => void load()}>Проверить снова</button>
          <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Сейчас онлайн</div>
                <div className="text-xs text-slate-500">heartbeat за последние 3 минуты</div>
              </div>
              <div className="text-2xl font-bold text-[var(--status-ok-fg)]">{presence.length}</div>
            </div>
            {presence.length > 0 && (
              <div className="mt-3 space-y-2">
                {presence.slice(0, 12).map((x:any) => (
                  <div key={String(x.user_id || x.id)} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <span className="truncate">{String(x.name || x.email || x.user_id)}</span>
                    <span className="ml-3 text-xs text-slate-500">{String(x.role || "")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
