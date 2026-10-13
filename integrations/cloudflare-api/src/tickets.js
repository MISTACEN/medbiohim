import { authenticateSupabaseRequest } from "./supabase-auth.js";

const fail = (status, code, message) => ({ ok: false, status, code, message });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function createClient(request, env, fetcher) {
  const auth = await authenticateSupabaseRequest(request, env, fetcher);
  if (!auth.ok) return auth;
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const key = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try { base = new URL(String(env.SUPABASE_URL || "").trim()); if (base.protocol !== "https:" || !key) throw new Error("config"); }
  catch { return fail(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key"); }
  async function rows(table, params = {}, init = {}) {
    const url = new URL("/rest/v1/" + table, base);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const response = await fetcher(url.toString(), {
      ...init,
      method: init.method || "GET",
      headers: {
        apikey: key, authorization: "Bearer " + token, accept: "application/json",
        ...(init.body != null ? { "content-type": "application/json" } : {}),
        ...(init.headers || {}),
      },
      redirect: "error", signal: AbortSignal.timeout(7000),
    });
    const text = await response.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch {} }
    if (!response.ok) { const error = new Error("Supabase REST failed"); error.status = response.status; throw error; }
    return Array.isArray(data) ? data : [];
  }
  return { ok: true, rows };
}

export async function listSupabaseTicketBanks(request, env, fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (!client.ok) return client;
  try {
    const [banks, questions] = await Promise.all([
      client.rows("ticket_banks", {
        select: "id,subject_id,subject_name,subject_slug,title,mode,created_at,updated_at",
        order: "subject_name.asc,title.asc", limit: "500",
      }),
      client.rows("exam_questions", {
        select: "id,subject_slug", kind: "eq.ticket", is_published: "eq.true", limit: "5000",
      }),
    ]);
    const counts = new Map();
    for (const question of questions) {
      const slug = String(question.subject_slug || "");
      counts.set(slug, (counts.get(slug) || 0) + 1);
    }
    return { ok: true, data: { items: banks.map((bank) => ({ ...bank, count: counts.get(String(bank.subject_slug || "")) || 0 })), source: "supabase" } };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (error?.status === 403) return fail(403, "FORBIDDEN", "Недостаточно прав для чтения банков билетов");
    return fail(503, "DB_UNAVAILABLE", "Банки билетов временно недоступны");
  }
}

export async function generateSupabaseTicket(request, env, input, fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (!client.ok) return client;
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const bankId = String(body.bank_id || "").trim();
  const count = Math.max(1, Math.min(20, Number.parseInt(String(body.count ?? 3), 10) || 3));
  const mode = String(body.mode || "practice").trim();
  if (!bankId) return fail(422, "VALIDATION_ERROR", "bank_id required");
  if (!UUID.test(bankId)) return fail(422, "VALIDATION_ERROR", "bank_id должен быть UUID");
  if (!["practice", "exam"].includes(mode)) return fail(422, "VALIDATION_ERROR", "Недопустимый режим билета");
  try {
    const banks = await client.rows("ticket_banks", {
      select: "id,subject_id,subject_name,subject_slug,title,mode",
      id: "eq." + bankId, limit: "1",
    });
    const bank = banks[0];
    if (!bank) return fail(404, "TICKET_BANK_NOT_FOUND", "Банк билетов не найден");
    const filters = { select: "id,subject_id,subject_name,subject_slug,topic,text,answer,kind,type,for_exam,for_ticket,source,is_published,created_at,updated_at",
      kind: "eq.ticket", is_published: "eq.true", order: "subject_name.asc,id.asc", limit: "5000" };
    if (bank.subject_id) filters.subject_id = "eq." + bank.subject_id;
    if (bank.subject_slug) filters.subject_slug = "eq." + bank.subject_slug;
    let pool = await client.rows("exam_questions", filters);
    if (!pool.length) return fail(503, "TICKET_BANK_EMPTY", "В выбранном банке пока нет опубликованных вопросов");
    // Fisher–Yates shuffle; the selected set is bounded to the requested count.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const questions = pool.slice(0, Math.min(count, pool.length)).map((row) => {
      const out = { ...row };
      if (mode === "exam") {
        out.has_answer = Boolean(out.answer);
        delete out.answer;
        delete out.rubric;
      }
      return out;
    });
    return {
      ok: true,
      data: {
        bank: {
          id: String(bank.id), title: String(bank.title || "Билеты"),
          subject: String(bank.subject_name || ""), subject_slug: String(bank.subject_slug || ""),
        },
        questions, count: questions.length, mode, generated_at: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (error?.status === 403) return fail(403, "FORBIDDEN", "Недостаточно прав для формирования билета");
    return fail(503, "TICKET_ERROR", "Не удалось сформировать билет: данные банка недоступны");
  }
}
