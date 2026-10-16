import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const tickets = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BankRow = {
  id: string;
  subject_id: string | null;
  subject_name: string;
  subject_slug: string;
  title: string;
  mode: string | null;
};

type ExamQuestionRow = {
  id: string;
  subject_name?: string | null;
  subject_slug?: string | null;
  topic?: string | null;
  text: string;
  answer?: string | null;
  type?: string | null;
  source?: string | null;
  for_ticket?: boolean;
  is_published?: boolean;
};

function bankMatchesQuestion(bank: Pick<BankRow, "subject_slug" | "title">, question: ExamQuestionRow): boolean {
  const title = String(bank.title || "").toLowerCase();
  const type = String(question.type || "").toLowerCase();
  const topic = String(question.topic || "").toLowerCase();
  const source = String(question.source || "").toLowerCase();

  if (bank.subject_slug !== "histology") return true;
  if (title.includes("ситуационные задачи")) return type === "case";
  if (title.includes("экзаменационные препараты")) return type === "preparation";
  if (title.includes("(леч./пед.)")) return source.startsWith("histology-zip-exam-med-ped");
  if (title.includes("(стом.)")) return topic.includes("стом") || source.includes("стом") || topic.includes("dental") || source.includes("dental");
  return true;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function ticketError(c: any, rid: string, code: string, message: string, status: 400 | 404 | 422 | 503) {
  const { body, status: responseStatus } = fail(code, message, status, rid);
  return c.json(body, responseStatus as any);
}

tickets.get("/banks", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  try {
    const [{ data: banks, error: bankError }, { data: questions, error: questionError }] = await Promise.all([
      db.from("ticket_banks")
        .select("id,subject_id,subject_name,subject_slug,title,mode")
        .order("subject_slug")
        .order("title")
        .limit(100),
      db.from("exam_questions")
        .select("id,subject_slug,topic,type,source")
        .eq("is_published", true)
        .eq("for_ticket", true)
        .limit(2000),
    ]);
    if (bankError || questionError) {
      console.error("[tickets:banks]", bankError?.message || questionError?.message);
      return ticketError(c, rid, "DB_UNAVAILABLE", "Банки билетов временно недоступны", 503);
    }
    const publishedQuestions = (questions || []) as ExamQuestionRow[];
    const items = ((banks || []) as BankRow[]).map((bank) => {
      const count = publishedQuestions.filter((question) =>
        question.subject_slug === bank.subject_slug && bankMatchesQuestion(bank, question)
      ).length;
      return {
        ...bank,
        subject: bank.subject_name,
        count,
        question_count: count,
      };
    });
    return c.json(ok({ items }, rid));
  } catch (error) {
    console.error("[tickets:banks]", error);
    return ticketError(c, rid, "DB_UNAVAILABLE", "Банки билетов временно недоступны", 503);
  }
});

tickets.post("/generate", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  let body: any;
  try { body = await c.req.json(); } catch { body = {}; }
  const bankId = String(body?.bank_id || "");
  const count = Number(body?.count ?? 3);
  const mode = body?.mode === "practice" ? "practice" : body?.mode === "exam" ? "exam" : "";
  if (!UUID.test(bankId)) return ticketError(c, rid, "VALIDATION", "Некорректный ID банка билетов", 422);
  if (!Number.isInteger(count) || count < 1 || count > 20) return ticketError(c, rid, "VALIDATION", "Количество вопросов должно быть от 1 до 20", 422);
  if (!mode) return ticketError(c, rid, "VALIDATION", "Некорректный режим билета", 422);

  try {
    const { data: bank, error: bankError } = await db.from("ticket_banks")
      .select("id,subject_id,subject_name,subject_slug,title,mode")
      .eq("id", bankId)
      .maybeSingle();
    if (bankError) {
      console.error("[tickets:generate:bank]", bankError.message);
      return ticketError(c, rid, "DB_UNAVAILABLE", "Банк билетов временно недоступен", 503);
    }
    if (!bank) return ticketError(c, rid, "NOT_FOUND", "Банк билетов не найден", 404);

    const { data, error } = await db.from("exam_questions")
      .select("id,subject_name,subject_slug,topic,text,answer,type,source,for_ticket,is_published")
      .eq("subject_slug", bank.subject_slug)
      .eq("is_published", true)
      .eq("for_ticket", true)
      .limit(2000);
    if (error) {
      console.error("[tickets:generate:questions]", error.message);
      return ticketError(c, rid, "DB_UNAVAILABLE", "Вопросы билетов временно недоступны", 503);
    }
    const eligible = ((data || []) as ExamQuestionRow[]).filter((question) => bankMatchesQuestion(bank as BankRow, question));
    if (!eligible.length) return ticketError(c, rid, "NO_TICKET_QUESTIONS", "В этом банке пока нет опубликованных вопросов", 404);

    const questions = shuffle(eligible).slice(0, Math.min(count, eligible.length)).map((question) => {
      const answer = String(question.answer || "");
      return {
        id: question.id,
        subject: question.subject_name || bank.subject_name,
        topic: question.topic || null,
        text: question.text,
        ...(mode === "practice" ? { answer, has_answer: Boolean(answer.trim()) } : {}),
      };
    });
    return c.json(ok({
      bank: { id: bank.id, title: bank.title, subject_name: bank.subject_name, subject_slug: bank.subject_slug },
      mode,
      questions,
    }, rid));
  } catch (error) {
    console.error("[tickets:generate]", error);
    return ticketError(c, rid, "DB_UNAVAILABLE", "Не удалось сгенерировать билет", 503);
  }
});

tickets.get("/", requireAuth, async (c) => {
  const rid = requestId();
  try {
    const { data, error } = await c.get("supabase")
      .from("tickets")
      .select("id,subject_id,title,questions,is_published,created_at")
      .eq("is_published", true)
      .order("created_at", { ascending: true })
      .limit(300);
    if (error) {
      console.error("[tickets:list]", error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Билеты недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    const items = (data || []).map((ticket) => ({
      ...ticket,
      question_count: Array.isArray(ticket.questions) ? ticket.questions.length : 0,
    }));
    return c.json(ok({ items }, rid));
  } catch (error) {
    console.error("[tickets:list]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Билеты недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

tickets.get("/:id", requireAuth, async (c) => {
  const rid = requestId();
  try {
    const { data, error } = await c.get("supabase")
      .from("tickets")
      .select("id,subject_id,title,questions,is_published,created_at")
      .eq("id", c.req.param("id") || "")
      .eq("is_published", true)
      .maybeSingle();
    if (error) {
      console.error("[tickets:detail]", error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Билет недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Билет не найден", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok({
      ...data,
      question_count: Array.isArray(data.questions) ? data.questions.length : 0,
    }, rid));
  } catch (error) {
    console.error("[tickets:detail]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Билет недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

export default tickets;
