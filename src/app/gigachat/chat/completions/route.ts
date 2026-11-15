/**
 * Релей GigaChat chat/completions (docs/DEPLOY-LAYERO.md): принимает OpenAI-
 * подобный запрос от воркера (x-medbiohim-internal: GIGACHAT_RELAY_SECRET,
 * Authorization: Bearer <access_token>) и пересылает в Сбер. Ответ — как у
 * GigaChat (JSON / SSE не используется: тьютор ходит без streaming).
 */
import { NextRequest, NextResponse } from "next/server";
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAT_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";
const dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
const MAX_BODY_CHARS = 400_000;

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: { code: "UNAUTHORIZED", message: "Relay call only" } },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  const secret = process.env.GIGACHAT_RELAY_SECRET || "";
  if (!secret || req.headers.get("x-medbiohim-internal") !== secret) return unauthorized();

  const bearer = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(bearer)) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION", message: "Authorization: Bearer <access_token> обязателен" } },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }
  const body = (await req.text()).slice(0, MAX_BODY_CHARS);

  try {
    const upstream = await undiciFetch(CHAT_URL, {
      method: "POST",
      headers: {
        authorization: bearer,
        "content-type": "application/json",
        accept: "application/json",
      },
      body,
      dispatcher,
      signal: AbortSignal.timeout(90_000),
    } as UndiciRequestInit);
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { code: "RELAY_FAILED", message: String(error instanceof Error ? error.message : error).slice(0, 160) } },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
