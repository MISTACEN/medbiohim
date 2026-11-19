/** Справочники и фабрики конструктора аттестаций (без React). */
import type { Attestation, AttestationItem, AttestationItemKind, AttestationType } from "@/types/attestations";
import { ATTESTATION_TYPE_LABELS } from "@/types/attestations";

export const TYPES = Object.keys(ATTESTATION_TYPE_LABELS) as AttestationType[];
export const KINDS: { value: AttestationItemKind; label: string }[] = [
  { value: "theory", label: "Теория" },
  { value: "test", label: "Тест" },
  { value: "task", label: "Задача" },
];

export const inputClass =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100";
export const labelClass = "mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400";

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newAttestation(): Attestation {
  return {
    slug: "",
    subject_slug: "",
    type: "colloquium",
    title: "",
    description: "",
    pass_score: 70,
    is_published: false,
    stages: [{ id: uid("stage"), title: "Этап 1", items: [] }],
  };
}

export function newItem(kind: AttestationItemKind): AttestationItem {
  if (kind === "test") {
    return { id: uid("item"), kind, title: "", options: ["", ""], correct: [0], explanation: "" };
  }
  if (kind === "task") return { id: uid("item"), kind, title: "", answer: "" };
  return { id: uid("item"), kind, title: "", body: "", answer: "" };
}
