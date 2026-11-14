/**
 * Ночной агент к экзамену (фаза 2.6 карты).
 *
 * Разбор = вопрос банка кафедры + эталонный ответ оттуда же. Никакой LLM в этой
 * ветке нет: банк уже содержит ответы, а ночной cron должен быть предсказуемым,
 * идемпотентным и не зависеть от доступности провайдеров.
 *
 * Отбор детерминированный: берём вопросы предмета по темам и порядку, пропуская
 * те, что уже разобраны в этом плане, — поэтому пропущенная ночь не сдвигает
 * программу и не дублирует вопросы.
 */

export const AGENT_PLAN_KIND = "exam_agent";
export const AGENT_QUESTIONS_PER_DAY = 8;
export const AGENT_BANK_LIMIT = 400;

export type AgentBankQuestion = {
  id: string | null;
  text: string;
  answer: string | null;
  topic: string | null;
};

export type AgentPlanRef = { id: string; user_id?: string; subject_slug: string | null; event_date: string };

/** Дата в UTC как YYYY-MM-DD: cron и UI должны видеть один и тот же день. */
export function agentDay(now: Date = new Date(), offsetDays = 0): string {
  const date = new Date(now.getTime() + offsetDays * 86400000);
  return date.toISOString().slice(0, 10);
}

export function isValidEventDate(value: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return false;
  const today = Date.parse(`${agentDay(now)}T00:00:00Z`);
  const limit = today + 180 * 86400000;
  return parsed >= today && parsed <= limit;
}

/**
 * Сколько ещё не разобранных вопросов нужно на день.
 *
 * Сначала берём вопросы, у которых в банке есть эталонный ответ: разбор без
 * ответа бесполезен («ответ готовится»). Если отвеченных не хватает на день,
 * добираем остальные — но только после них, и порядок банка сохраняем.
 */
export function pickAgentQuestions(
  bank: AgentBankQuestion[],
  takenTexts: string[],
  perDay: number = AGENT_QUESTIONS_PER_DAY,
): AgentBankQuestion[] {
  const taken = new Set(takenTexts.map((text) => String(text ?? "").trim()));
  const seen = new Set<string>();
  const picked: AgentBankQuestion[] = [];
  const push = (question: AgentBankQuestion): boolean => {
    if (picked.length >= perDay) return false;
    const text = String(question?.text ?? "").trim();
    if (!text || taken.has(text) || seen.has(text)) return true;
    seen.add(text);
    picked.push({
      id: question.id ? String(question.id) : null,
      text,
      answer: question.answer && String(question.answer).trim() ? String(question.answer) : null,
      topic: question.topic && String(question.topic).trim() ? String(question.topic).trim() : null,
    });
    return true;
  };
  for (const question of bank) {
    if (String(question?.answer ?? "").trim()) push(question);
  }
  for (const question of bank) {
    if (!String(question?.answer ?? "").trim()) push(question);
  }
  return picked;
}

type ServiceClient = {
  from: (table: string) => any;
};

/**
 * Создаёт разборы на конкретный день. Возвращает, сколько строк реально легло.
 * Уникальный индекс (plan_id, day, question_text) защищает от гонки cron-ов.
 */
export async function buildAgentItems(
  service: ServiceClient,
  plan: AgentPlanRef,
  day: string,
  perDay: number = AGENT_QUESTIONS_PER_DAY,
): Promise<number> {
  const subject = String(plan.subject_slug || "").trim();
  if (!subject) return 0;

  const { data: existing, error: existingError } = await service
    .from("study_agent_items")
    .select("question_text")
    .eq("plan_id", plan.id)
    .limit(2000);
  if (existingError) throw existingError;
  const taken = (existing || []).map((row: any) => String(row.question_text || ""));

  const { data: bank, error: bankError } = await service
    .from("exam_questions")
    .select("id,text,answer,topic")
    .eq("subject_slug", subject)
    .eq("for_exam", true)
    .eq("is_published", true)
    .order("topic", { ascending: true })
    .order("sort_order", { ascending: true })
    .limit(AGENT_BANK_LIMIT);
  if (bankError) throw bankError;

  const picked = pickAgentQuestions((bank || []) as AgentBankQuestion[], taken, perDay);
  if (!picked.length) return 0;

  const rows = picked.map((question, index) => ({
    plan_id: plan.id,
    user_id: plan.user_id,
    day,
    question_id: question.id,
    question_text: question.text,
    answer: question.answer,
    topic: question.topic,
    position: index,
  }));
  const { data: inserted, error } = await service
    .from("study_agent_items")
    .upsert(rows, { onConflict: "plan_id,day,question_text", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  return Array.isArray(inserted) ? inserted.length : 0;
}
