import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * F8: единое пустое состояние — иконка, заголовок, пояснение и действие.
 * Заменяет разнобой «Пока нет …» текстом-пустышкой: студент всегда видит,
 * что делать дальше.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  actionHref,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: string;
  actionHref?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={(compact ? "p-6" : "p-10") + " text-center rounded-2xl border border-dashed"}
      style={{ borderColor: "var(--border)" }}
      role="status"
    >
      {Icon && (
        <div
          className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl"
          style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
        >
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="font-semibold" style={{ color: "var(--text)" }}>
        {title}
      </div>
      {description && (
        <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: "var(--muted)" }}>
          {description}
        </p>
      )}
      {action && actionHref && (
        <Link href={actionHref} className="btn-primary mt-4 inline-flex text-sm">
          {action}
        </Link>
      )}
    </div>
  );
}
