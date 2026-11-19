"use client";

/** Доступы к разделам: список разделов платформы с переключателем режима. */
import { Loader2, Lock, RefreshCw, Unlock } from "lucide-react";
import type { AccessModule } from "@/lib/api/access";

export function AccessModulesList({
  modules,
  loading,
  busy,
  onToggle,
  onRefresh,
}: {
  modules: AccessModule[];
  loading: boolean;
  busy: string;
  onToggle: (module: AccessModule) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Разделы платформы</h2>
        <button type="button" onClick={onRefresh} className="btn-secondary inline-flex items-center gap-1 text-sm">
          <RefreshCw className="h-4 w-4" /> Обновить
        </button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      ) : (
        <div className="card divide-y p-0">
          {modules.map((module) => (
            <div key={module.key} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <span className="font-semibold">{module.title}</span>
                <span className="ml-2 text-xs text-[var(--muted)]">{module.key}</span>
                {!module.is_active && (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">отключён</span>
                )}
              </div>
              <button
                type="button"
                disabled={busy === "module-" + module.key}
                onClick={() => onToggle(module)}
                className={
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 " +
                  (module.default_mode === "open"
                    ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]"
                    : "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]")
                }
                title={module.default_mode === "open" ? "Перевести в режим «по выдаче»" : "Открыть всем"}
              >
                {module.default_mode === "open" ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {module.default_mode === "open" ? "открыт всем" : "по выдаче"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
