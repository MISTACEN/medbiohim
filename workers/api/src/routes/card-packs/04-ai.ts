import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { aiDailyQuota, aiQuotaMessage, logAiQuotaRejection, withAiCall } from "../../lib/ai-usage";
import { MAX_CARD_TEXT, extractCardsJson, directLectureBlock, err } from "./shared";
import { buildLectureContext } from "../ai";
// @ts-expect-error The integration module is plain JavaScript without type declarations.
import { generateAiCompletion } from "../../../../../integrations/cloudflare-api/src/ai-chat.js";

import type { CardPacksRouter } from "./types";

export function registerAiRoutes(cardPacks: CardPacksRouter) {
cardPacks.post("/ai-generate", requireAuth, async (c) => {
  const rid = requestId();
  let input: { topic?: string; subject_slug?: string; source_text?: string } = {};
  try { input = await c.req.json(); } catch { return err(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON"); }
  const topic = String(input?.topic || "").trim();
  const subjectSlug = String(input?.subject_slug || "").trim() || null;
  // Свой текст (конспект из фото/PDF или личная лекция) важнее RAG: если он
  // есть, карточки собираются ровно по нему, а предмет не обязателен.
  const sourceText = String(input?.source_text || "").trim().slice(0, 12000);
  if (!topic || topic.length > 300) return err(c, rid, 422, "VALIDATION_ERROR", "Укажите тему (до 300 символов)");
  if (!subjectSlug && sourceText.length < 200) {
    return err(c, rid, 422, "VALIDATION_ERROR", "Выберите предмет для контекста лекций или передайте текст");
  }

  // Генерация пака — дорогая внешняя ИИ-операция: суточная квота на студента.
  const userId = c.get("user").id;
  const quota = await aiDailyQuota(c.env, "card_pack", userId);
  if (!quota.allowed) {
    await logAiQuotaRejection(c.env, {
      route: "POST /card-packs/ai-generate",
      feature: "card_pack",
      userId,
      subjectSlug,
      requestId: rid,
    });
    return err(c, rid, 429, "AI_DAILY_LIMIT", aiQuotaMessage(quota, "card_pack"));
  }

  const db = c.get("supabase");
  try {
    // buildLectureContext возвращает объект с текстовым блоком, а не строку:
    // раньше в промпт попадал «[object Object]», и модель отдавала пустой пак.
    let lectureBlock = sourceText;
    if (lectureBlock.length < 200) {
      const lectureContext = await buildLectureContext(db, subjectSlug, topic);
      lectureBlock = String(lectureContext?.block || "").trim();
    }
    if (!lectureBlock) {
      return err(c, rid, 422, "NO_LECTURE_CONTEXT", "По этому предмету нет лекций для контекста");
    }
    const prompt = [
      "Ты собираешь карточки-пак для повторения студентом.",
      "СТРОГОЕ ПРАВИЛО: каждое определение и факт бери ДОСЛОВНО из приведённых ниже фрагментов лекций.",
      "Ничего не выдумывай и не добавляй из общих знаний. Если фрагментов мало — сделай меньше карточек.",
      `Тема карточек: «${topic}».`,
      "Формат ответа — строго JSON без markdown-обёртки:",
      '{"cards":[{"front":"вопрос/термин","back":"определение из лекции","source":"фрагмент, откуда взято"}]}',
      "От 4 до 12 карточек. Front — короткий термин или вопрос; back — определение из лекции.",
      "",
      "=== ФРАГМЕНТЫ ЛЕКЦИЙ ===",
      lectureBlock,
    ].join("\n");
    const attempts: Array<Record<string, unknown>> = [];
    // Строгий JSON лучше держат крупные модели: сортировочный провайдер
    // (часто llama-8b) отдаёт прозу или пустой массив. AI_JSON_PROVIDER можно
    // переопределить в настройках воркера, по умолчанию — Groq.
    const jsonProvider = String((c.env as any).AI_JSON_PROVIDER || "groq").trim() || "auto";
    const result = await withAiCall<{ content?: string; provider?: string; model?: string }>(
      c.env,
      {
        route: "POST /card-packs/ai-generate",
        feature: "card_pack",
        userId,
        subjectSlug,
        requestId: rid,
        attempts,
      },
      () => generateAiCompletion(
        c.env,
        [{ role: "user", content: prompt.slice(0, 24000) }],
        jsonProvider,
        fetch,
        { temperature: 0.1, onAttempt: (attempt: Record<string, unknown>) => attempts.push(attempt) },
      ),
    );
    let draft = extractCardsJson(String(result.content || ""));
    if (!draft) {
      // Модель иногда добавляет пояснения вокруг JSON или обрезает ответ.
      // Один строгий повтор дешевле, чем «карточки не генерируются».
      console.warn("[card-packs:ai-generate:retry-json]", { requestId: rid, provider: result.provider });
      try {
        const retry = await generateAiCompletion(
          c.env,
          [
            { role: "user", content: prompt.slice(0, 8000) },
            { role: "assistant", content: String(result.content || "").slice(0, 4000) },
            { role: "user", content: "Ответ не был валидным JSON. Верни только валидный JSON вида {\"cards\":[{\"front\":\"...\",\"back\":\"...\",\"source\":\"...\"}]} и ничего больше." },
          ],
          jsonProvider,
          fetch,
          { temperature: 0 },
        );
        draft = extractCardsJson(String(retry.content || ""));
      } catch (retryError) {
        console.warn("[card-packs:ai-generate:retry-failed]", String(retryError));
      }
    }
    if (!draft) return err(c, rid, 502, "AI_BAD_OUTPUT", "ИИ вернул неожиданный формат — попробуйте ещё раз");
    if (!(draft.cards || []).length) {
      console.warn("[card-packs:ai-generate:empty]", JSON.stringify({ requestId: rid, head: String(result.content || "").slice(0, 400) }));
    }
    // Модели иногда называют поля по-своему (term/definition, question/answer)
    // или отдают пару массивом — берём всё, что похоже на карточку.
    const cards = (draft.cards || [])
      .map((card: any) => {
        if (Array.isArray(card)) {
          return { front: String(card[0] || ""), back: String(card[1] || ""), source: String(card[2] || "") };
        }
        return {
          front: String(card?.front ?? card?.term ?? card?.question ?? card?.q ?? ""),
          back: String(card?.back ?? card?.definition ?? card?.answer ?? card?.a ?? ""),
          source: String(card?.source ?? card?.quote ?? card?.fragment ?? ""),
        };
      })
      .map((card) => ({
        front: card.front.trim().slice(0, MAX_CARD_TEXT),
        back: card.back.trim().slice(0, MAX_CARD_TEXT),
        source: card.source.trim().slice(0, 300),
      }))
      .filter((card) => card.front && card.back)
      .slice(0, 12);
    if (!cards.length) {
      // Маленькие модели плохо держат JSON. Просим простой построчный формат
      // «термин || определение» — его понимают все провайдеры.
      console.warn("[card-packs:ai-generate:fallback-lines]", JSON.stringify({ requestId: rid, head: String(result.content || "").slice(0, 200) }));
      try {
        // RAG мог выбрать не ту лекцию. Ищем лекцию по названию/тексту темы
        // и повторяем с этим фрагментом — на нём модель уже видит определения.
        const direct = await directLectureBlock(db, subjectSlug, topic);
        const lines = await generateAiCompletion(
          c.env,
          [
            { role: "user", content: (direct ? prompt.replace(lectureBlock, direct) : prompt).slice(0, 12000) },
            { role: "user", content: "Не JSON. Верни 6–10 строк, каждая строго в виде: термин || определение (дословно из фрагментов выше). Без нумерации и пояснений." },
          ],
          jsonProvider,
          fetch,
          { temperature: 0 },
        );
        const parsed = String(lines.content || "")
          .split("\n")
          .map((line) => line.split("||"))
          .filter((parts) => parts.length >= 2 && parts[0].trim() && parts[1].trim())
          .map((parts) => ({ front: parts[0].trim(), back: parts.slice(1).join("||").trim(), source: "" }));
        if (parsed.length) cards.push(...parsed.slice(0, 12));
      } catch (fallbackError) {
        console.warn("[card-packs:ai-generate:fallback-failed]", String(fallbackError));
      }
    }
    if (!cards.length) {
      return err(c, rid, 502, "AI_EMPTY", "ИИ не смог собрать карточки по этой теме");
    }
    return c.json(ok({ topic, subject_slug: subjectSlug, cards, provider: result.provider, model: result.model }, rid));
  } catch (generateError) {
    console.error("[card-packs:ai-generate]", generateError);
    const code = String((generateError as any)?.code || "");
    if (code === "no_provider_configured" || code === "requested_provider_not_configured") {
      return err(c, rid, 503, "AI_NOT_CONFIGURED", "Не настроен доступный AI-провайдер");
    }
    return err(c, rid, 502, "AI_UPSTREAM", "ИИ-провайдеры временно недоступны");
  }
});
}
