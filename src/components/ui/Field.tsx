import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useId } from "react";

/**
 * F10: единый компонент полей форм — label, подсказка, ошибка, обязательность
 * в одном месте, чтобы формы не разъезжались по отступам и a11y.
 *
 * `<Field label="Email" hint="…" error="…" required>` — обёртка с текстом,
 * `<FieldInput />` / `<FieldTextarea />` — сами контролы (пробрасывают props).
 */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium" style={{ color: "var(--text)" }}>
        {label}
        {required && <span className="ml-1" style={{ color: "var(--status-critical-fg)" }} aria-hidden="true">*</span>}
        {required && <span className="sr-only">обязательное поле</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs" style={{ color: "var(--muted)" }}>{hint}</p>}
      {error && <p className="text-xs" style={{ color: "var(--status-critical-fg)" }} role="alert">{error}</p>}
    </div>
  );
}

type FieldInputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export function FieldInput({ invalid, className = "", ...props }: FieldInputProps) {
  return (
    <input
      {...props}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={"w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:ring-2 " + className}
      style={{
        borderColor: invalid ? "var(--status-critical-fg)" : "var(--input-border)",
        background: "var(--background)",
        color: "var(--text)",
        ...props.style,
      }}
    />
  );
}

type FieldTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export function FieldTextarea({ invalid, className = "", rows = 3, ...props }: FieldTextareaProps) {
  return (
    <textarea
      {...props}
      rows={rows}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={"w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:ring-2 " + className}
      style={{
        borderColor: invalid ? "var(--status-critical-fg)" : "var(--input-border)",
        background: "var(--background)",
        color: "var(--text)",
        ...props.style,
      }}
    />
  );
}

/** Уникальный id для связки label↔input внутри одной формы. */
export function useFieldId(prefix = "field"): string {
  const id = useId();
  return `${prefix}-${id}`;
}
