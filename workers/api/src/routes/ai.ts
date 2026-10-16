import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { rateLimit } from "../lib/redis";

const ai = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

ai.post("/chat", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const rl = await rateLimit(c.env, `ai:chat:${user.id}`, 30, 3600);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Лимит AI-запросов исчерпан", 429, rid);
    return c.json(body, status as 429);
  }

  const key = c.env.OPENAI_API_KEY?.trim();
  if (!key) {
    const { body, status } = fail("NOT_CONFIGURED", "OPENAI_API_KEY не задан", 503, rid);
    return c.json(body, status as 503);
  }

  let payload: { messages?: { role: string; content: string }[]; model?: string } = {};
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }

  const messages = payload.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    const { body, status } = fail("VALIDATION", "Нужен messages[]", 400, rid);
    return c.json(body, status as 400);
  }

  try {
    const model = payload.model || c.env.OPENAI_MODEL || "gpt-4o-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: messages.slice(-20).map((m) => ({
          role: m.role === "assistant" || m.role === "system" ? m.role : "user",
          content: String(m.content || "").slice(0, 8000),
        })),
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const { body, status } = fail("AI_UPSTREAM", "OpenAI временно недоступен", 502, rid);
      return c.json(body, status as 502);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: unknown;
    };
    const content = json.choices?.[0]?.message?.content || "";
    return c.json(ok({ message: { role: "assistant", content }, usage: json.usage }, rid));
  } catch {
    const { body, status } = fail("AI_UPSTREAM", "OpenAI временно недоступен", 502, rid);
    return c.json(body, status as 502);
  }
});

export default ai;
