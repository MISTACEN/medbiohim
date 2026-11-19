import type { Env } from "../../env";
import { fail } from "../../lib/response";
import { serviceRoleConfigured } from "../../jobs/account-deletion";

export const EXPORT_SCHEMA = "medbiohim.account-export";
export const EXPORT_SCHEMA_VERSION = 1;

/**
 * Лимиты строк на раздел. Выгрузка — не бэкап БД: очень большие истории не
 * должны раздувать ответ Worker'а. При достижении лимита раздел получает
 * `truncated: true`, и это честно видно в файле.
 */
export const LIMITS = {
  progressSubjects: 500,
  progressTopics: 2000,
  attempts: 2000,
  srsCards: 5000,
  notes: 1000,
  favorites: 1000,
  submissions: 1000,
  assignments: 1000,
  sessions: 1000,
  attendance: 2000,
  aiConversations: 500,
  aiMessages: 2000,
  calendarEvents: 2000,
  questionComments: 1000,
  preferences: 1,
  roles: 25,
  groups: 100,
} as const;

/**
 * Те же лимиты, но с ключами разделов файла: пользователь должен читать
 * `srs_cards`, а не `srsCards`. Один источник значений — `LIMITS` выше.
 */
export const PER_SECTION_LIMITS = {
  roles: LIMITS.roles,
  groups: LIMITS.groups,
  preferences: LIMITS.preferences,
  progress_subjects: LIMITS.progressSubjects,
  progress_topics: LIMITS.progressTopics,
  test_attempts: LIMITS.attempts,
  srs_cards: LIMITS.srsCards,
  notes: LIMITS.notes,
  favorites: LIMITS.favorites,
  homework_submissions: LIMITS.submissions,
  assignments: LIMITS.assignments,
  learning_sessions: LIMITS.sessions,
  attendance: LIMITS.attendance,
  ai_conversations: LIMITS.aiConversations,
  ai_messages: LIMITS.aiMessages,
  calendar_events: LIMITS.calendarEvents,
  question_comments: LIMITS.questionComments,
} as const;

/** Пояснение, которое уходит в каждом ответе про удаление. */
export const DELETION_EXECUTION_NOTE =
  "Запрос фиксирует намерение: аккаунт удаляет служебный процесс после указанной даты. " +
  "Из интерфейса и через этот API удаление не запускается и отменить его после исполнения нельзя.";

export type Section = {
  count: number;
  limit: number;
  truncated: boolean;
  items: unknown[];
};

/**
 * Сбой конкретного раздела: нужен, чтобы честно назвать его в ответе.
 *
 * Поля объявлены без модификаторов и присваиваются в конструкторе: Worker-тесты
 * грузят исходники через Node strip-only, а parameter properties (`readonly section`
 * в аргументах) такой загрузчик не поддерживает.
 */
export class SectionError extends Error {
  section: string;
  constructor(section: string, cause?: unknown) {
    super(section);
    this.name = "SectionError";
    this.section = section;
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Читаем на одну строку больше лимита: только так видно, что данные реально
 * обрезаны. `items.length === limit` не доказывает, что дальше есть ещё строки,
 * и объявлять обрезку на этом основании было бы враньём в другую сторону.
 */
export function overFetch(limit: number): number {
  return limit + 1;
}

export async function readSection(
  section: string,
  limit: number,
  run: () => PromiseLike<{ data: unknown; error: unknown }>
): Promise<Section> {
  try {
    const { data, error } = await run();
    if (error) throw error;
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    const truncated = rows.length > limit;
    const items = truncated ? rows.slice(0, limit) : rows;
    return { count: items.length, limit, truncated, items };
  } catch (cause) {
    console.error("[account:export]", section, cause);
    throw new SectionError(section, cause);
  }
}

export async function readRow(
  section: string,
  run: () => PromiseLike<{ data: unknown; error: unknown }>
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await run();
    if (error) throw error;
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch (cause) {
    console.error("[account:export]", section, cause);
    throw new SectionError(section, cause);
  }
}

/** Файл отдаём с ASCII-именем: Content-Disposition не обязан быть UTF-8. */
export function exportFileName(generatedAt: string): string {
  const day = /^\d{4}-\d{2}-\d{2}/.test(generatedAt) ? generatedAt.slice(0, 10) : "data";
  return `medbiohim-export-${day}.json`;
}

/** Профиль без внутреннего ключа объекта хранилища: наружу идёт только факт. */
export function mapProfile(row: Record<string, unknown> | null) {
  if (!row) return null;
  const { avatar_key: avatarKey, ...rest } = row;
  return { ...rest, has_uploaded_avatar: Boolean(avatarKey) };
}

/**
 * Постгрес/PostgREST не знает функцию — значит миграция не применена. Это не
 * «временный сбой», а невключённая возможность, и её нельзя выдавать за 500.
 * Код 503, а не 501: общий middleware v1 заменяет 501 ответом legacy-upstream.
 */
export function deletionNotConfigured(error: unknown): boolean {
  const record = (error || {}) as Record<string, unknown>;
  const code = String(record.code || "");
  if (code === "PGRST202" || code === "42883") return true;
  return /could not find the function|function .* does not exist/i.test(String(record.message || ""));
}

export type DeletionPayload = {
  status: string;
  request_id: string | null;
  requested_at: string | null;
  scheduled_for: string | null;
  cancelled_at: string | null;
  executed_at: string | null;
  grace_days: number | null;
  days_left: number | null;
  execution: "service_role_only";
  deletion_executed: boolean;
  message: string;
};

/**
 * Приводим ответ RPC к стабильному контракту. Ничего не додумываем: если БД не
 * вернула дату или срок — в ответе будет `null`, а не выдуманное значение.
 */
export function normalizeDeletion(raw: unknown, fallbackStatus: string): DeletionPayload {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const asNumber = (value: unknown): number | null => {
    const parsed = Number(value);
    return value === null || value === undefined || !Number.isFinite(parsed) ? null : parsed;
  };
  const asText = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value : null;
  return {
    status: typeof record.status === "string" && record.status ? record.status : fallbackStatus,
    request_id: asText(record.request_id),
    requested_at: asText(record.requested_at),
    scheduled_for: asText(record.scheduled_for),
    cancelled_at: asText(record.cancelled_at),
    executed_at: asText(record.executed_at),
    grace_days: asNumber(record.grace_days),
    days_left: asNumber(record.days_left),
    execution: "service_role_only",
    deletion_executed: record.deletion_executed === true,
    message: DELETION_EXECUTION_NOTE,
  };
}

export function deletionFailure(error: unknown, rid: string) {
  if (deletionNotConfigured(error)) {
    // Не притворяемся, что удаление работает: без миграции его просто нет.
    return fail(
      "DELETION_NOT_CONFIGURED",
      "Удаление аккаунта не включено на сервере: не применена миграция 20261030_account_deletion.sql.",
      503,
      rid
    );
  }
  console.error("[account:deletion]", error);
  return fail("DELETION_UNAVAILABLE", "Управление удалением аккаунта временно недоступно", 503, rid);
}

/**
 * Пользователь должен знать, произойдёт ли удаление на самом деле. Без
 * служебного ключа запрос сохранится, но исполнять его некому — это видно в
 * ответе и в интерфейсе, а не выясняется постфактум.
 */
export type DeletionResponse = DeletionPayload & {
  /** Настроен ли на воркере служебный ключ, который реально удалит аккаунт. */
  execution_configured: boolean;
};

export function withExecution(payload: DeletionPayload, env: Env): DeletionResponse {
  return { ...payload, execution_configured: serviceRoleConfigured(env) };
}

// --- Экспорт --------------------------------------------------------------
