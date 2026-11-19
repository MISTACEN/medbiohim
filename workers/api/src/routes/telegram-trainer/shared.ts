import type { Env } from "../../env";


import { constantTimeEqual } from "../../lib/timing";
import { escapeHtml } from "../../lib/html-escape";

export { constantTimeEqual, escapeHtml };
export const DUE_CARD_LIMIT = 10;
export const TRAINER_LINKED_LIMIT = 500;
export const RATING_MIN = 1;
export const RATING_MAX = 4;

export function internalSecret(env: Env): string {
  return String(env.TELEGRAM_INGEST_SECRET || env.TELEGRAM_WEBHOOK_SECRET || "").trim();
}

/** FNV-1a: детерминированный «жребий» дня без криптографии. */
export function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseTelegramUserId(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export async function resolveUserId(supabase: any, telegramUserId: number): Promise<string | null> {
  const { data, error } = await supabase
    .from("telegram_accounts")
    .select("user_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (error) throw error;
  return String((data as any)?.user_id || "") || null;
}

export type TrainerCard = {
  id: string;
  front: string;
  back: string;
  subject: string;
  topic: string;
};

export async function loadDueCards(supabase: any, userId: string, limit: number): Promise<TrainerCard[]> {
  const { data, error } = await supabase
    .from("srs_cards")
    .select("id,front,back,subject_slug,topic,due_at")
    .eq("user_id", userId)
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(Math.max(1, Math.min(50, limit)));
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: String(row.id || ""),
    front: String(row.front || ""),
    back: String(row.back || ""),
    subject: String(row.subject_slug || ""),
    topic: String(row.topic || ""),
  }));
}

export async function loadDueCount(supabase: any, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("srs_cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .lte("due_at", new Date().toISOString());
  if (error) throw error;
  return Number(count || 0);
}

export type ChallengeRow = {
  id: string;
  kind: string;
  prompt: string;
  equation: string;
  variants: Array<{ label?: string }>;
  correct_index: number;
  explanation: string;
  formula: string | null;
  subject_name: string | null;
  topic: string | null;
};

export async function loadActiveChallenges(supabase: any): Promise<ChallengeRow[]> {
  const { data, error } = await supabase
    .from("bot_chem_challenges")
    .select("id,kind,prompt,equation,variants,correct_index,explanation,formula,subject_name,topic")
    .eq("is_active", true)
    .limit(300);
  if (error) throw error;
  return (data || []) as ChallengeRow[];
}

/**
 * Детерминированная перестановка вариантов: правильный ответ не должен
 * стоять на одном месте каждый день, а сервер при проверке воспроизводит
 * тот же порядок (stateless-бот хранит только индекс варианта).
 */
export function shuffleOrder(challenge: ChallengeRow, seed: string): number[] {
  const order = challenge.variants.map((_, index) => index);
  let hash = stableHash(seed);
  for (let i = order.length - 1; i > 0; i -= 1) {
    hash = Math.imul(hash ^ (hash >>> 15), 0x2545f491) >>> 0;
    const j = hash % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export async function challengeStats(supabase: any, telegramUserId: number): Promise<{ today_total: number; today_correct: number; streak: number }> {
  const dayStart = new Date(`${isoDate(new Date())}T00:00:00Z`).toISOString();
  const { data, error } = await supabase
    .from("bot_challenge_attempts")
    .select("challenge_id,is_correct,created_at")
    .eq("telegram_user_id", telegramUserId)
    .gte("created_at", dayStart)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  const attempts = (data || []) as Array<{ challenge_id: string; is_correct: boolean }>;
  const todayCorrect = attempts.filter((row) => row.is_correct).length;
  // Серия подряд: сколько последних попыток дня были верными до первой ошибки.
  let streak = 0;
  for (const row of attempts) {
    if (!row.is_correct) break;
    streak += 1;
  }
  return { today_total: attempts.length, today_correct: todayCorrect, streak };
}

export function guardInternal(c: any): boolean {
  const secret = internalSecret(c.env);
  if (!secret) return false;
  return constantTimeEqual(c.req.header("x-medbiohim-internal") || "", secret);
}

export const SITE_STUDY_URL = "https://medbiohim.vercel.app/study";
