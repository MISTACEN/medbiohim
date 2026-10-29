/**
 * Cloudflare Workers AI — основная нейросеть сортировки Telegram.
 *
 * Биндинг `AI` не требует ключей, сертификатов и внешнего relay: запрос
 * выполняется внутри Cloudflare. GigaChat остаётся опциональным провайдером,
 * но по умолчанию бот работает здесь.
 */
import type { Env } from "../env";

export type WorkersAiMessage = { role: "system" | "user" | "assistant"; content: string };

export type WorkersAiResult = {
  content: string;
  model: string;
  provider: "cloudflare";
};

export const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
const MAX_CHARS = 60_000;
const TIMEOUT_MS = 25_000;

export class WorkersAiError extends Error {
  code: "NOT_CONFIGURED" | "NOT_AVAILABLE" | "EMPTY_RESPONSE" | "TIMEOUT";

  constructor(code: WorkersAiError["code"], message: string) {
    super(message);
    this.name = "WorkersAiError";
    this.code = code;
  }
}

export function workersAiConfigured(env: Env): boolean {
  return Boolean(env.AI && typeof (env.AI as any).run === "function");
}

export function workersAiModel(env: Env): string {
  return String(env.CLOUDFLARE_AI_MODEL || DEFAULT_WORKERS_AI_MODEL).trim() || DEFAULT_WORKERS_AI_MODEL;
}

function normalize(messages: WorkersAiMessage[]): WorkersAiMessage[] {
  let total = 0;
  const safe: WorkersAiMessage[] = [];
  for (const message of messages) {
    if (!message || !["system", "user", "assistant"].includes(message.role)) continue;
    const content = String(message.content || "").trim().slice(0, 12_000);
    if (!content) continue;
    total += content.length;
    if (total > MAX_CHARS) break;
    safe.push({ role: message.role, content });
  }
  return safe;
}

export async function workersAiComplete(
  env: Env,
  messages: WorkersAiMessage[],
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<WorkersAiResult> {
  if (!workersAiConfigured(env)) {
    throw new WorkersAiError("NOT_CONFIGURED", "Workers AI binding is not configured");
  }
  const safe = normalize(messages);
  if (!safe.length) throw new WorkersAiError("NOT_CONFIGURED", "Empty Workers AI context");

  const model = workersAiModel(env);
  const temperature = Number.isFinite(options.temperature)
    ? Math.max(0, Math.min(1, Number(options.temperature)))
    : 0.1;
  const maxTokens = Number.isFinite(options.maxTokens)
    ? Math.max(64, Math.min(1200, Number(options.maxTokens)))
    : 900;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new WorkersAiError("TIMEOUT", "Workers AI timed out")), TIMEOUT_MS);
  });

  let response: any;
  try {
    response = await Promise.race([
      (env.AI as any).run(model, {
        messages: safe,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
      timeout,
    ]);
  } catch (error) {
    if (error instanceof WorkersAiError) throw error;
    throw new WorkersAiError("NOT_AVAILABLE", "Workers AI request failed");
  } finally {
    if (timer) clearTimeout(timer);
  }

  const content = typeof response === "string"
    ? response
    : typeof response?.response === "string"
      ? response.response
      : "";
  if (!content.trim()) throw new WorkersAiError("EMPTY_RESPONSE", "Workers AI returned empty content");
  return {
    content: content.trim(),
    model: typeof response?.model === "string" ? response.model : model,
    provider: "cloudflare",
  };
}
