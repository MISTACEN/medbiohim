/** Feature API: tutor, calculators, search, SRS — extends core client. */
import { api } from "./api";
import { describeApiError } from "./errors";

/* —— Tutor (RAG) —— */
export type TutorSource = {
  id: string;
  subject: string;
  topic: string;
  title: string;
  source: string;
  score: number;
  excerpt: string;
};
export type TutorAnswer = {
  answer: string;
  mode: string;
  sources: TutorSource[];
  subject_filter?: string | null;
  model?: string | null;
  retrieved: number;
};
/* —— Calculators —— */
export type CalcField = {
  key: string;
  label: string;
  type: "number" | "select";
  min?: number;
  max?: number;
  step?: number;
  default?: string | number;
  optional?: boolean;
  /** Подсказка под полем: единицы измерения, референс или допущение. */
  hint?: string;
  options?: Array<{ value: string; label: string }>;
};
/** Один шаг пошагового решения: формула → подстановка → результат. */
export type CalcStep = { label: string; formula: string; value: string };
export type CalculatorDef = {
  id: string;
  name: string;
  category: string;
  description: string;
  fields: CalcField[];
  /** Итог опирается на приближённую формулу/коэффициент. */
  approximate?: boolean;
};
export async function listCalculators() {
  return api<{
    items: CalculatorDef[];
    categories: Record<string, Array<{ id: string; name: string; category: string; description: string }>>;
    count: number;
  }>("/calculators");
}
export async function computeCalculator(id: string, input: Record<string, string | number>) {
  return api<{
    id: string;
    result: Record<string, unknown>;
    interpretation: string;
    warnings: string[];
    steps: CalcStep[];
    approximate: boolean;
    notes: string[];
  }>(`/calculators/${encodeURIComponent(id)}/compute`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/* —— Global search —— */
export type SearchHit = {
  id: string;
  title: string;
  snippet: string;
  subject: string;
  subject_slug: string | null;
  topic: string;
  type: string;
  type_label?: string;
  hint?: string;
  count?: number;
  score: number;
  has_answer: boolean;
  answer?: string;
  href: string;
};

/** Подсказка в поле поиска: препарат, учебник/материал или предмет. */
export type SearchSuggestion = {
  id: string;
  type: string;
  type_label: string;
  title: string;
  subject: string;
  hint: string;
  href: string;
  count: number;
};
export async function globalSearch(q: string, opts?: { limit?: number; subject_slug?: string; type?: string }) {
  const p = new URLSearchParams();
  p.set("q", q);
  if (opts?.limit) p.set("limit", String(opts.limit));
  if (opts?.subject_slug) p.set("subject_slug", opts.subject_slug);
  if (opts?.type) p.set("type", opts.type);
  return api<{
    query: string;
    original?: string;
    total: number;
    items: SearchHit[];
    intent?: { kind: string | null; hint: string };
    examples?: string[];
    facets: { subjects: Array<{ subject: string; subject_slug: string; count: number }>; types: Record<string, number> };
  }>(`/search?${p.toString()}`);
}

/** Живые подсказки для поля поиска (предметы, препараты, материалы). */
export async function suggestSearch(q: string, limit = 8) {
  const p = new URLSearchParams();
  p.set("q", q);
  p.set("limit", String(limit));
  return api<{
    items: SearchSuggestion[];
    query: string;
    hint: string;
    examples: string[];
  }>(`/search/suggest?${p.toString()}`);
}

/* —— SRS cards —— */
export type SrsCard = {
  id: string;
  front: string;
  back: string;
  subject: string;
  subject_slug: string;
  topic: string;
  source: string;
  ease: number;
  interval: number;
  reps: number;
  due_at: number;
  due_in_hours: number;
  reviewed_at?: string | null;
};
export type SrsSummary = {
  due: number;
  learning: number;
  total: number;
  new_available: number;
  subjects: Array<{ subject: string; subject_slug: string; count: number }>;
};
export async function srsSummary() {
  return api<SrsSummary>("/srs/summary");
}
export async function srsEnsure(count = 20, subject_id?: string, subject_slug?: string) {
  return api<{ added: number; total: number }>("/srs/ensure", {
    method: "POST",
    body: JSON.stringify({ count, subject_id, subject_slug }),
  });
}
export async function srsDue(limit = 20, subject_id?: string, subject_slug?: string, scope?: "shared" | "personal") {
  const p = new URLSearchParams();
  p.set("limit", String(limit));
  if (subject_id) p.set("subject_id", subject_id);
  else if (subject_slug) p.set("subject_slug", subject_slug);
  if (scope) p.set("scope", scope);
  return api<{ items: SrsCard[]; count: number }>(`/srs/due?${p}`);
}
export async function srsReview(card_id: string, rating: 1 | 2 | 3 | 4) {
  return api<{ card: SrsCard; summary: SrsSummary }>("/srs/review", {
    method: "POST",
    body: JSON.stringify({ card_id, rating }),
  });
}

export async function srsListCards(limit = 100, subject_id?: string, subject_slug?: string, scope?: "shared" | "personal") {
  const p = new URLSearchParams();
  p.set("limit", String(limit));
  if (subject_id) p.set("subject_id", subject_id);
  else if (subject_slug) p.set("subject_slug", subject_slug);
  if (scope) p.set("scope", scope);
  return api<{ items: SrsCard[]; count: number }>(`/srs/cards?${p}`);
}
export async function srsAddCard(payload: { front: string; back?: string; subject_id?: string; subject_slug?: string; topic?: string }) {
  return api<{ card: SrsCard }>("/srs/cards", { method: "POST", body: JSON.stringify(payload) });
}
export async function srsDeleteCard(id: string) {
  return api<{ deleted: boolean }>(`/srs/cards/${encodeURIComponent(id)}`, { method: "DELETE" });
}
/* —— Persistent AI chat —— */
export type AiProvider = "auto" | "groq" | "gigachat" | "gemini" | "mistral" | "openrouter";
export type AiConversation = { id:string; title:string; provider:AiProvider; model?:string|null; subject_slug?:string|null; created_at:string; updated_at:string };
export type AiMessage = { id:string; role:"system"|"user"|"assistant"; content:string; provider?:string|null; model?:string|null; created_at:string };
export async function aiProviders(){ return api<{region:string;providers:Record<Exclude<AiProvider,"auto">,{configured:boolean;available:boolean;model?:string;reason?:string|null}>;default:AiProvider} >("/ai/providers"); }
export async function aiConversations(){ return api<{items:AiConversation[]}>("/ai/conversations"); }
export async function aiCreateConversation(payload?:{title?:string;provider?:AiProvider;subject_slug?:string}){ return api<{conversation:AiConversation}>("/ai/conversations",{method:"POST",body:JSON.stringify(payload||{})}); }
export async function aiGetConversation(id:string){ return api<{conversation:AiConversation;messages:AiMessage[]}>(`/ai/conversations/${encodeURIComponent(id)}`); }
export async function aiDeleteConversation(id:string){ return api<{deleted:boolean}>(`/ai/conversations/${encodeURIComponent(id)}`,{method:"DELETE"}); }
export async function aiSendMessage(id:string,content:string,provider?:AiProvider,subject_slug?:string){ return api<{conversation:AiConversation;user_message:AiMessage;assistant_message:AiMessage}>(`/ai/conversations/${encodeURIComponent(id)}/messages`,{method:"POST",body:JSON.stringify({content,provider,subject_slug})}); }

/* —— SA6: экспорт данных аккаунта и удаление с grace-периодом —— */
/** Раздел выгрузки: строки + честный признак обрезки по лимиту. */
export type AccountExportSection<T = Record<string, unknown>> = {
  count: number;
  limit: number;
  truncated: boolean;
  items: T[];
};
/**
 * Документ выгрузки (`GET /account/export`). Формат версионирован сервером:
 * `schema_version` меняется, если меняется состав разделов.
 */
export type AccountExportDocument = {
  schema: string;
  schema_version: number;
  generated_at: string;
  timezone: string;
  account: {
    user_id: string;
    email: string | null;
    created_at: string | null;
    last_sign_in_at: string | null;
  };
  profile: (Record<string, unknown> & { has_uploaded_avatar?: boolean }) | null;
  data: {
    roles: AccountExportSection;
    groups: AccountExportSection;
    preferences: AccountExportSection;
    progress: { subjects: AccountExportSection; topics: AccountExportSection };
    test_attempts: AccountExportSection;
    srs_cards: AccountExportSection;
    notes: AccountExportSection;
    favorites: AccountExportSection;
    homework_submissions: AccountExportSection;
    assignments: AccountExportSection;
    learning_sessions: AccountExportSection;
    attendance: AccountExportSection;
    ai_conversations: AccountExportSection;
    ai_messages: AccountExportSection;
    calendar_events: AccountExportSection;
    question_comments: AccountExportSection;
  };
  limits: { per_section_limits: Record<string, number>; note: string };
  notes: string[];
};

/** Данные аккаунта одним JSON-документом (без скачивания файла). */
export async function exportMyData() {
  return api<AccountExportDocument>("/account/export");
}

export type DownloadResult =
  | { ok: true; filename: string; bytes: number }
  | { ok: false; message: string; code?: string; requestId?: string };

/** Дата в имени файла берётся из `generated_at`, а не из часов устройства. */
export function exportFileStamp(generatedAt?: string | null): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(generatedAt || ""));
  return match ? match[1] : "data";
}

/**
 * Скачать архив данных: сервер отдаёт JSON с Content-Disposition, но через
 * `api()` заголовки не видны, поэтому имя файла собираем здесь же, а в файл
 * кладём сам документ (`data`) без транспортной обёртки.
 */
export async function downloadMyData(): Promise<DownloadResult> {
  if (typeof window === "undefined") {
    return { ok: false, message: "Скачивание доступно только в браузере." };
  }
  const result = await exportMyData();
  if (!result.ok) {
    return {
      ok: false,
      message: describeApiError(result.error),
      code: result.error.code,
      requestId: result.requestId,
    };
  }
  const doc = result.data;
  const filename = `medbiohim-export-${exportFileStamp(doc?.generated_at)}.json`;
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const link = window.document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    window.document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Ссылку освобождаем с запасом: часть браузеров читает blob после click().
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  return { ok: true, filename, bytes: blob.size };
}

/** Статусы запроса на удаление; `already_requested` — повторный запрос. */
export type AccountDeletionStatus =
  | "none"
  | "scheduled"
  | "cancelled"
  | "executed"
  | "already_requested";

/**
 * Состояние удаления. `execution: "service_role_only"` — постоянный признак:
 * клиент не удаляет аккаунт, это делает служебный процесс после `scheduled_for`.
 */
export type AccountDeletionState = {
  status: AccountDeletionStatus;
  request_id: string | null;
  requested_at: string | null;
  scheduled_for: string | null;
  cancelled_at: string | null;
  executed_at: string | null;
  grace_days: number | null;
  days_left: number | null;
  execution: "service_role_only";
  /** Настроен ли на сервере служебный ключ: без него запрос сохранится, но не исполнится. */
  execution_configured: boolean;
  deletion_executed: boolean;
  message: string;
};

export async function getAccountDeletion() {
  return api<AccountDeletionState>("/account/deletion");
}

/** Запросить удаление: срок считает сервер (grace-период приходит в `grace_days`). */
export async function requestAccountDeletion(reason?: string) {
  return api<AccountDeletionState>("/account/deletion", {
    method: "POST",
    body: JSON.stringify({ reason: reason ?? "" }),
  });
}

export async function cancelAccountDeletion() {
  return api<AccountDeletionState>("/account/deletion", { method: "DELETE" });
}

/** Дата и время в русском формате; `—`, если значения нет — не выдумываем дату. */
export function formatAccountDate(value?: string | null): string {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) return "—";
  return new Date(parsed).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
