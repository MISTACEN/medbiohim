"use client";

/** Доступы к разделам: журнал выдачи и отзыва прав. */
import type { AccessAuditItem } from "@/lib/api/access";

export function AccessAuditLog({ audit }: { audit: AccessAuditItem[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Журнал доступа</h2>
      {audit.length === 0 ? (
        <div className="card p-4 text-sm text-[var(--muted)]">Действий пока не было.</div>
      ) : (
        <div className="card divide-y p-0 text-sm">
          {audit.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span>
                <b>{item.actor_name || "Админ"}</b>{" "}
                {item.action === "grant" ? "выдал" : item.action === "revoke" ? "отозвал" : "изменил"}{" "}
                {item.module_key ? <b>{item.module_key}</b> : null}
                <span className="ml-1 text-[var(--muted)]">
                  ({item.scope}
                  {item.target ? ` · ${item.target.slice(0, 8)}…` : ""})
                </span>
              </span>
              <span className="text-xs text-[var(--muted)]">
                {new Date(item.created_at).toLocaleString("ru-RU")}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
