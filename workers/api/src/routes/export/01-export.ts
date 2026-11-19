import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { LIMITS, PER_SECTION_LIMITS, readSection, readRow, overFetch, exportFileName, mapProfile, EXPORT_SCHEMA, EXPORT_SCHEMA_VERSION } from "./shared";

import { SectionError } from "./shared";

import type { ExportRouter } from "./types";

export function registerExportRoutes(account: ExportRouter) {
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
}
