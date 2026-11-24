export type BankOption = string | { key?: unknown; label?: unknown; correct?: boolean };

export type BankQuestion = {
  id: string;
  text: string;
  answer?: string | null;
  answer_display?: string | null;
  options: BankOption[];
  type?: string;
  is_closed?: boolean | null;
  requires_order?: boolean;
  topicTitle?: string | null;
  media?: Array<{ url?: string; label?: string; width?: number; height?: number; alt?: string }>;
};

export type EditOption = { label: string; correct: boolean };

export type EditDraft = { text: string; answer: string; options: EditOption[] };

export type BankContext = { subject: string; module: string; topic: string; mode: string; count: number };

export type ModeLinks = {
  practice: string;
  solve: string;
  exam: string;
  sequential: string;
};

export function labelOf(o: BankOption) {
  return typeof o === "string" ? o : String(o.label ?? "");
}

export function keyOf(o: BankOption, index: number) {
  if (typeof o === "string") return String.fromCharCode(65 + index);
  return o.key != null && String(o.key).trim() ? String(o.key) : String.fromCharCode(65 + index);
}

export function correctOf(o: BankOption) {
  return typeof o !== "string" && o.correct === true;
}

export function isAdminResponse(payload: any): boolean {
  const candidates = [
    payload?.data?.roles,
    payload?.data?.user?.roles,
    payload?.data?.user?.role,
    payload?.roles,
    payload?.user?.roles,
    payload?.user?.role,
  ];
  return candidates.some((value) => {
    const xs = Array.isArray(value) ? value : value == null ? [] : [value];
    return xs.some((item) => {
      if (typeof item === "string") return item.toLowerCase() === "admin";
      if (item && typeof item === "object") {
        return String(item.code ?? item.slug ?? item.name ?? item.role ?? "").toLowerCase() === "admin";
      }
      return false;
    });
  });
}
