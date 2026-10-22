/**
 * Trainer Atlas with annotations - histology identification cards with labeled parts.
 * 
 * This provides interactive atlas-style images where students can identify cellular structures,
 * tissues, and organelles. Each card contains an electron micrograph or histological slide
 * with numbered markers pointing to specific structures.
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const trainerAtlas = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AtlasAnnotation {
  id: string;
  number: string;
  label: string;
  description?: string;
  x?: number; // percentage position
  y?: number;
}

export interface AtlasCard {
  id: string;
  subject_slug?: string | null;
  specialty_slug?: string | null;
  title: string;
  description?: string;
  image_url?: string;
  blob_key?: string | null;
  annotations: AtlasAnnotation[];
  is_published?: boolean;
  difficulty?: number;
  tags?: string[];
}

function createServiceDb(env: any) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  
  try {
    const { createClient } = require("@supabase/supabase-js");
    return createClient(env.SUPABASE_URL, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  } catch {
    return null;
  }
}

trainerAtlas.get("/feed", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 30), 1), 250);
  const offset = Math.max(0, Number(c.req.query("offset") || 0));
  const subject = c.req.query("subject");
  const specialty = c.req.query("specialty");
  
  try {
    let query = supabase
      .from("trainer_atlas_cards")
      .select("id,subject_slug,specialty_slug,title,description,image_url,blob_key,is_published,difficulty,tags,annotations")
      .eq("is_published", true);
    
    if (subject) query = query.eq("subject_slug", subject);
    if (specialty) query = query.eq("specialty_slug", specialty);
    
    const { data, error } = await query.order("created_at", { ascending: true }).range(offset, offset + limit - 1);
    
    if (error) throw error;
    
    return c.json(ok({ items: data || [], limit, offset }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Атлас тренажёра недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

trainerAtlas.get("/feed/:id", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const cardId = c.req.param("id");
  
  if (!UUID.test(cardId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID карточки", 422, rid);
    return c.json(body, status as 422);
  }
  
  try {
    const { data, error } = await supabase
      .from("trainer_atlas_cards")
      .select("*")
      .eq("id", cardId)
      .eq("is_published", true)
      .maybeSingle();
    
    if (error || !data) {
      const { body, status } = fail("NOT_FOUND", "Карточка не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    
    return c.json(ok({ item: data }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Карточка недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

trainerAtlas.post("/answer", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  
  let payload: { card_id?: string; selected_annotation?: string };
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  
  if (!payload.card_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(payload.card_id)) {
    const { body, status } = fail("VALIDATION", "card_id обязателен", 422, rid);
    return c.json(body, status as 422);
  }
  
  try {
    const cardResult = await supabase
      .from("trainer_atlas_cards")
      .select("id,annotations")
      .eq("id", payload.card_id)
      .maybeSingle();
    
    if (cardResult.error || !cardResult.data) {
      const { body, status } = fail("NOT_FOUND", "Карточка не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    
    const card = cardResult.data as any;
    const selectedLabel = payload.selected_annotation || "";
    const annotations = Array.isArray(card.annotations) ? card.annotations : [];
    const correctAnswer = annotations.find((a: AtlasAnnotation) => a.id === selectedLabel);
    
    const { data: answer, error } = await supabase
      .from("trainer_atlas_answers")
      .insert({
        card_id: payload.card_id,
        user_id: user.id,
        selected_label: selectedLabel,
        is_correct: !!correctAnswer,
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return c.json(ok({ answer, is_correct: !!correctAnswer }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить ответ", 503, rid);
    return c.json(body, status as 503);
  }
});

trainerAtlas.get("/feedback/:cardId/stats", requireAuth, async (c) => {
  const rid = requestId();
  const cardId = c.req.param("cardId");
  const supabase = c.get("supabase");
  
  if (!UUID.test(cardId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID карточки", 422, rid);
    return c.json(body, status as 422);
  }
  
  try {
    const { count, error } = await supabase
      .from("trainer_atlas_answers")
      .select("*", { count: "exact", head: true })
      .eq("card_id", cardId);
    
    if (error) throw error;
    
    const correctCount = await supabase
      .from("trainer_atlas_answers")
      .select("is_correct", { count: "exact", head: true })
      .eq("card_id", cardId)
      .eq("is_correct", true);
    
    if (correctCount.error) throw correctCount.error;
    
    const total = count || 0;
    const correct = correctCount.count || 0;
    
    return c.json(ok({ total, correct, accuracy: total > 0 ? (correct / total * 100).toFixed(2) : 0 }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Статистика недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

export default trainerAtlas;
