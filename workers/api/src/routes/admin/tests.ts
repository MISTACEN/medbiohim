import { requireAuth } from "../../middleware/auth";
import { ok, requestId } from "../../lib/response";
import { CONTENT_MODERATORS, UUID, bodyJson, error, gate, validText, type AdminApp } from "./shared";

/**
 * Атомарная сборка вариантов теста из пула вопросов (RPC).
 */
export function registerTests(admin: AdminApp) {

  // MA10: атомарная сборка вариантов теста. Вместо цепочки клиентских POST'ов
  // (тест -> по одному на каждую ссылку test_questions) всё делает один RPC:
  // либо собраны все варианты целиком, либо не записано ничего.
  const VARIANT_BUILDER_ERRORS: Array<[RegExp, string | ((m: RegExpMatchArray) => string)]> = [
    [/invalid test title/, "Укажи корректное название теста (1–300 символов)."],
    [/subject is required/, "Выбери предмет."],
    [/subject not found/, "Предмет не найден."],
    [/question pool is empty/, "Выбери хотя бы один вопрос из пула."],
    [/variants must be between 1 and 20/, "Вариантов должно быть от 1 до 20."],
    [/questions per test must be between 1 and 200/, "Вопросов в одном тесте должно быть от 1 до 200."],
    [/time limit must not be negative/, "Лимит времени не может быть отрицательным."],
    [/max attempts must not be negative/, "Количество попыток не может быть отрицательным."],
    [/module does not belong to subject/, "Выбранный модуль не относится к этому предмету."],
    [/topic does not belong to module/, "Выбранная тема не относится к этому модулю."],
    [/eligible question pool is too small: (\d+) available, (\d+) required/, (m) => `Подходящих опубликованных вопросов: ${m[1]}, а нужно ${m[2]} на один вариант.`],
    [/failed to assemble variant/, "Не удалось собрать вариант: вопросы закончились в пуле."],
    [/failed to link questions/, "Не удалось привязать вопросы к варианту."],
    [/administrator role required/, "Недостаточно прав для административной операции."],
  ];
  function variantBuilderMessage(rawMessage: string): string {
    const text = String(rawMessage || "");
    for (const [pattern, message] of VARIANT_BUILDER_ERRORS) {
      const match = text.match(pattern);
      if (!match) continue;
      return typeof message === "function" ? message(match) : message;
    }
    return "Не удалось собрать тесты. Изменения не сохранены.";
  }

  admin.post("/tests/build-variants", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase"), user = c.get("user"), input = await bodyJson(c);
    // Сборка вариантов из платформенного пула — задача admin и moderator.
    // Преподаватель получит создание СВОИХ тестов через teacher-маршрут, когда
    // такой флоу появится; RPC уже пишет p_actor_id как автора (план §10).
    if (!await gate(c, CONTENT_MODERATORS)) return;
    const title = String(input?.title || "").trim();
    const subjectId = String(input?.subject_id || "");
    const questionIds = Array.isArray(input?.question_ids) ? [...new Set((input.question_ids as unknown[]).map((id) => String(id)))] : [];
    const variants = Number(input?.variants ?? 1);
    const perTest = Number(input?.per_test ?? 10);
    const moduleId = input?.module_id ? String(input.module_id) : null;
    const topicId = input?.topic_id ? String(input.topic_id) : null;
    const timeLimitSec = input?.time_limit_sec == null || input.time_limit_sec === "" ? null : Number(input.time_limit_sec);
    const maxAttempts = input?.max_attempts == null || input.max_attempts === "" ? null : Number(input.max_attempts);
    const isPublished = input?.is_published === true;

    if (!validText(title, 300)) return error(c, rid, 422, "VALIDATION_ERROR", "Укажи корректное название теста (1–300 символов).");
    if (!UUID.test(subjectId)) return error(c, rid, 422, "VALIDATION_ERROR", "Выбери предмет.");
    if (!questionIds.length || questionIds.some((id) => !UUID.test(id))) return error(c, rid, 422, "VALIDATION_ERROR", "В пуле есть некорректные ID вопросов.");
    if (!Number.isInteger(variants) || variants < 1 || variants > 20) return error(c, rid, 422, "VALIDATION_ERROR", "Вариантов должно быть от 1 до 20.");
    if (!Number.isInteger(perTest) || perTest < 1 || perTest > 200) return error(c, rid, 422, "VALIDATION_ERROR", "Вопросов в одном тесте должно быть от 1 до 200.");
    if (questionIds.length < perTest) return error(c, rid, 422, "VALIDATION_ERROR", `Выбрано ${questionIds.length} вопросов, а на один вариант нужно ${perTest}.`);
    if (timeLimitSec !== null && (!Number.isInteger(timeLimitSec) || timeLimitSec < 0)) return error(c, rid, 422, "VALIDATION_ERROR", "Лимит времени должен быть целым неотрицательным числом.");
    if (maxAttempts !== null && (!Number.isInteger(maxAttempts) || maxAttempts < 0)) return error(c, rid, 422, "VALIDATION_ERROR", "Количество попыток должно быть целым неотрицательным числом.");

    try {
      const { data, error: rpcError } = await db.rpc("medbiohim_build_test_variants", {
        p_actor_id: user.id,
        p_title: title,
        p_subject_id: subjectId,
        p_question_ids: questionIds,
        p_variants: variants,
        p_per_test: perTest,
        p_description: String(input?.description || "").trim() || null,
        p_module_id: moduleId,
        p_topic_id: topicId,
        p_time_limit_sec: timeLimitSec,
        p_max_attempts: maxAttempts,
        p_is_published: isPublished,
      });
      if (rpcError) {
        console.error("[admin:tests:build-variants]", rpcError.message, rpcError.code, rpcError.details);
        const code = String(rpcError.code || "");
        if (code === "42501") return error(c, rid, 403, "FORBIDDEN", variantBuilderMessage(rpcError.message));
        if (code === "22023" || code === "P0002") return error(c, rid, 422, "VALIDATION_ERROR", variantBuilderMessage(rpcError.message));
        // Любая другая ошибка означает откат всей транзакции: ничего не записано.
        return error(c, rid, 503, "BUILD_FAILED", "Не удалось собрать тесты. Изменения не сохранены.");
      }
      return c.json(ok(data, rid), 201);
    } catch (rpcFailure) {
      console.error("[admin:tests:build-variants]", rpcFailure);
      return error(c, rid, 503, "BUILD_FAILED", "Не удалось собрать тесты. Изменения не сохранены.");
    }
  });
}
