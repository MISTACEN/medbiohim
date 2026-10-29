/**
 * SA6 (PRODUCT-AUDIT-PLAN-2026-10-27): экспорт данных аккаунта и удаление с
 * grace-периодом.
 *
 * Монтируется как `/api/v1/account`:
 *   GET    /export    — JSON-файл со всеми данными текущего пользователя
 *   GET    /deletion  — статус запроса на удаление
 *   POST   /deletion  — запросить удаление (grace-период задаёт БД: 7 дней)
 *   DELETE /deletion  — отменить активный запрос
 *
 * Два принципа, которые здесь важнее удобства:
 *
 * 1. Только свои строки. Данные читает клиент Supabase с access-токеном самого
 *    пользователя (RLS ограничивает выборку владельцем), и каждый select
 *    дополнительно фильтруется по `.eq("user_id", user.id)`. Service role для
 *    чужих строк не используется вообще: экспорт не должен уметь читать больше,
 *    чем обычный экран.
 *
 * 2. Экспорт не бывает «частично успешным». Если хоть один раздел не прочитался,
 *    ответ — 503 с названием раздела, а файл не отдаётся. Молча выгрузить
 *    неполные данные значит соврать пользователю о полноте его архива.
 *
 * Удаление аккаунта клиентом не выполняется: запрос только фиксируется в
 * `public.account_deletion_requests`, а реальное удаление из auth.users делает
 * служебный процесс под service_role (см. database/migrations/20261030_account_deletion.sql).
 * Каждый ответ на `/deletion` явно говорит это полем `execution`.
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const account = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/** Версия формата выгрузки: клиент может опираться на неё, не угадывая поля. */
const EXPORT_SCHEMA = "medbiohim.account-export";
const EXPORT_SCHEMA_VERSION = 1;

/**
 * Лимиты строк на раздел. Выгрузка — не бэкап БД: очень большие истории не
 * должны раздувать ответ Worker'а. При достижении лимита раздел получает
 * `truncated: true`, и это честно видно в файле.
 */
const LIMITS = {
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
const PER_SECTION_LIMITS = {
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
const DELETION_EXECUTION_NOTE =
  "Запрос фиксирует намерение: аккаунт удаляет служебный процесс после указанной даты. " +
  "Из интерфейса и через этот API удаление не запускается и отменить его после исполнения нельзя.";

type Section = {
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
class SectionError extends Error {
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
function overFetch(limit: number): number {
  return limit + 1;
}

async function readSection(
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

async function readRow(
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

function deletionFailure(error: unknown, rid: string) {
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

// --- Экспорт --------------------------------------------------------------

account.get("/export", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");

  try {
    // Все запросы идут клиентом пользователя: RLS + явный фильтр по владельцу.
    // Разделы независимы, поэтому читаем параллельно; порядок в ответе задан
    // именами полей, а не порядком сетевых ответов.
    const [profile, roles, groups, preferences] = await Promise.all([
      readRow("профиль", () =>
        supabase
          .from("users")
          .select("id,email,full_name,display_name,avatar_url,avatar_key,course_number,semester")
          .eq("id", user.id)
          .maybeSingle()
      ),
      readSection("роли", LIMITS.roles, () =>
        supabase.from("user_roles").select("roles(code,name)").eq("user_id", user.id).limit(overFetch(LIMITS.roles))
      ),
      readSection("учебные группы", LIMITS.groups, () =>
        supabase
          .from("group_memberships")
          .select("group_id,role_in_group,is_active,groups(id,name,specialty_slug,course_number,is_active)")
          .eq("user_id", user.id)
          .limit(overFetch(LIMITS.groups))
      ),
      readSection("настройки", LIMITS.preferences, () =>
        supabase
          .from("user_preferences")
          .select("user_id,preferences,created_at,updated_at")
          .eq("user_id", user.id)
          .limit(overFetch(LIMITS.preferences))
      ),
    ]);

    const [progressSubjects, progressTopics, attempts, srsCards] = await Promise.all([
      readSection("прогресс по предметам", LIMITS.progressSubjects, () =>
        supabase
          .from("user_subject_progress")
          .select("user_id,subject_id,percent,completed_topics_count,last_activity_at,updated_at")
          .eq("user_id", user.id)
          .limit(overFetch(LIMITS.progressSubjects))
      ),
      readSection("прогресс по темам", LIMITS.progressTopics, () =>
        supabase
          .from("user_topic_progress")
          .select("user_id,topic_id,status,percent,last_activity_at")
          .eq("user_id", user.id)
          .limit(overFetch(LIMITS.progressTopics))
      ),
      readSection("попытки тестов", LIMITS.attempts, () =>
        supabase
          .from("test_attempts")
          .select("id,test_id,status,score,started_at,finished_at")
          .eq("user_id", user.id)
          .order("started_at", { ascending: false })
          .limit(overFetch(LIMITS.attempts))
      ),
      readSection("карточки повторения", LIMITS.srsCards, () =>
        supabase
          .from("srs_cards")
          .select(
            "id,source_type,source_id,front,back,subject_id,subject_slug,topic,ease,interval,reps,due_at,reviewed_at,created_at,updated_at"
          )
          .eq("user_id", user.id)
          .order("due_at", { ascending: true })
          .limit(overFetch(LIMITS.srsCards))
      ),
    ]);

    const [notes, favorites, submissions, assignments] = await Promise.all([
      readSection("заметки", LIMITS.notes, () =>
        supabase
          .from("notes")
          .select("id,target_type,target_id,text,created_at,updated_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(overFetch(LIMITS.notes))
      ),
      readSection("избранное", LIMITS.favorites, () =>
        supabase
          .from("favorites")
          .select("target_type,target_id,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(overFetch(LIMITS.favorites))
      ),
      readSection("сданные работы", LIMITS.submissions, () =>
        supabase
          .from("homework_submissions")
          // graded_at/graded_by в рабочей схеме нет — оценка и комментарий
          // лежат в grade/teacher_comment, а время правки в updated_at.
          .select("id,homework_id,status,grade,teacher_comment,text_answer,file_id,submitted_at,created_at,updated_at")
          .eq("user_id", user.id)
          .order("submitted_at", { ascending: false })
          .limit(overFetch(LIMITS.submissions))
      ),
      readSection("трекер отработок", LIMITS.assignments, () =>
        supabase
          .from("my_assignments")
          .select("id,subject,topic,due_date,status,grade,note,source,created_at,updated_at")
          .eq("user_id", user.id)
          .order("due_date", { ascending: true })
          .limit(overFetch(LIMITS.assignments))
      ),
    ]);

    const [sessions, attendance, aiConversations, aiMessages] = await Promise.all([
      readSection("учебные сессии", LIMITS.sessions, () =>
        supabase
          .from("learning_sessions")
          .select("id,type,ref_id,title,status,current_index,answers,payload,score,finished_at,created_at,updated_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(overFetch(LIMITS.sessions))
      ),
      readSection("посещаемость", LIMITS.attendance, () =>
        supabase
          .from("attendance_records")
          .select("id,schedule_entry_id,status,note,marked_at")
          .eq("user_id", user.id)
          .order("marked_at", { ascending: false })
          .limit(overFetch(LIMITS.attendance))
      ),
      readSection("AI-чаты", LIMITS.aiConversations, () =>
        supabase
          .from("ai_conversations")
          .select("id,title,provider,model,subject_slug,metadata,created_at,updated_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(overFetch(LIMITS.aiConversations))
      ),
      readSection("сообщения AI-чатов", LIMITS.aiMessages, () =>
        supabase
          .from("ai_messages")
          .select("id,conversation_id,role,content,provider,model,metadata,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(overFetch(LIMITS.aiMessages))
      ),
    ]);

    const [calendarEvents, questionComments] = await Promise.all([
      readSection("личный календарь", LIMITS.calendarEvents, () =>
        supabase
          .from("user_calendar_events")
          .select("id,external_id,title,subject_id,topic_id,starts_at,ends_at,location,description,source,source_url,created_at")
          .eq("user_id", user.id)
          .order("starts_at", { ascending: true })
          .limit(overFetch(LIMITS.calendarEvents))
      ),
      readSection("комментарии к вопросам", LIMITS.questionComments, () =>
        supabase
          .from("question_comments")
          .select("id,question_id,body,is_deleted,created_at,updated_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(overFetch(LIMITS.questionComments))
      ),
    ]);

    const generatedAt = new Date().toISOString();
    const document = {
      schema: EXPORT_SCHEMA,
      schema_version: EXPORT_SCHEMA_VERSION,
      generated_at: generatedAt,
      timezone: "UTC",
      account: {
        user_id: user.id,
        email: user.email ?? null,
        created_at: user.created_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
      },
      profile: mapProfile(profile),
      data: {
        roles,
        groups,
        preferences,
        progress: {
          subjects: progressSubjects,
          topics: progressTopics,
        },
        test_attempts: attempts,
        srs_cards: srsCards,
        notes,
        favorites,
        homework_submissions: submissions,
        assignments,
        learning_sessions: sessions,
        attendance,
        ai_conversations: aiConversations,
        ai_messages: aiMessages,
        calendar_events: calendarEvents,
        question_comments: questionComments,
      },
      limits: {
        // Точные лимиты по разделам, а не «самый большой из них»: по этому
        // объекту видно, какой раздел мог быть обрезан и на каком числе строк.
        per_section_limits: PER_SECTION_LIMITS,
        note:
          "Разделы ограничены по числу строк. Если truncated=true, строк в разделе больше лимита — " +
          "полная история доступна на сервере, но в этот файл не попала.",
      },
      notes: [
        "Выгрузка только читает данные: она не удаляет и не меняет записи.",
        "Снимок не транзакционный: разделы читаются параллельно и могут отличаться на несколько секунд.",
        "Анонимная статистика переходов на внешние платформы не выгружается: в ней нет идентификатора пользователя.",
        "Тренировки по гистологии выдаются только серверными RPC без табличного контракта в миграциях, поэтому в файл не включены.",
        "Ключ файла аватара не выгружается: вместо него есть признак has_uploaded_avatar и внешний avatar_url.",
      ],
    };

    const body = ok(document, rid);
    c.header("Content-Type", "application/json; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${exportFileName(generatedAt)}"`);
    c.header("Cache-Control", "no-store");
    return c.json(body);
  } catch (error) {
    if (error instanceof SectionError) {
      const { body, status } = fail(
        "EXPORT_SECTION_UNAVAILABLE",
        `Не удалось собрать раздел «${error.section}». Файл не отдан, чтобы не отдавать неполные данные — попробуйте ещё раз.`,
        503,
        rid,
        { section: error.section }
      );
      return c.json(body, status as 503);
    }
    console.error("[account:export]", error);
    const { body, status } = fail(
      "EXPORT_UNAVAILABLE",
      "Экспорт данных временно недоступен. Попробуйте позже.",
      503,
      rid
    );
    return c.json(body, status as 503);
  }
});

// --- Удаление аккаунта ----------------------------------------------------

account.get("/deletion", requireAuth, async (c) => {
  const rid = requestId();
  try {
    const { data, error } = await c.get("supabase").rpc("medbiohim_account_deletion_status");
    if (error) throw error;
    return c.json(ok(normalizeDeletion(data, "none"), rid));
  } catch (error) {
    const { body, status } = deletionFailure(error, rid);
    return c.json(body, status as 503);
  }
});

account.post("/deletion", requireAuth, async (c) => {
  const rid = requestId();
  let payload: unknown = {};
  try {
    payload = await c.req.json();
  } catch {
    // Пустое тело допустимо: причина удаления не обязательна.
    payload = {};
  }
  const input = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
  const reason = input.reason == null ? "" : String(input.reason).trim();
  if (reason.length > 1000) {
    const { body, status } = fail("VALIDATION_ERROR", "Причина удаления слишком длинная: не более 1000 символов", 422, rid);
    return c.json(body, status as 422);
  }

  try {
    const { data, error } = await c.get("supabase").rpc("medbiohim_request_account_deletion", {
      p_reason: reason || null,
    });
    if (error) throw error;
    const result = normalizeDeletion(data, "scheduled");
    // Повторный запрос не создаёт дубль и не считается ошибкой пользователя.
    return c.json(ok(result, rid), result.status === "already_requested" ? 200 : 201);
  } catch (error) {
    const { body, status } = deletionFailure(error, rid);
    return c.json(body, status as 503);
  }
});

account.delete("/deletion", requireAuth, async (c) => {
  const rid = requestId();
  try {
    const { data, error } = await c.get("supabase").rpc("medbiohim_cancel_account_deletion");
    if (error) throw error;
    const result = normalizeDeletion(data, "not_requested");
    if (result.status === "cancelled") return c.json(ok(result, rid));
    if (result.status === "executed") {
      const { body, status } = fail(
        "DELETION_ALREADY_EXECUTED",
        "Аккаунт уже помечен как удалённый: отменить запрос нельзя. Обратитесь в поддержку.",
        409,
        rid
      );
      return c.json(body, status as 409);
    }
    const { body, status } = fail(
      "DELETION_NOT_REQUESTED",
      "Активного запроса на удаление нет — отменять нечего.",
      409,
      rid
    );
    return c.json(body, status as 409);
  } catch (error) {
    const { body, status } = deletionFailure(error, rid);
    return c.json(body, status as 503);
  }
});

export default account;
