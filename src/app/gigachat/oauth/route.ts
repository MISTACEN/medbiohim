/**
 * Релей GigaChat на RU-хостинге (roadmap: docs/DEPLOY-LAYERO.md).
 *
 * Cloudflare Worker не может достучаться до Сбера: сертификат Russian Trusted
 * CA не входит в доверенные CF (ошибка 526 на OAuth). Релей живёт на Layero
 * (RU-хостинг), принимает запросы только от воркера (общий секрет
 * GIGACHAT_RELAY_SECRET в заголовке x-medbiohim-internal) и пересылает их в
 * Сбep с отключённой проверкой цепочки — только здесь, только для этих двух
 * эндпоинтов и только с секретом.
 *
 * POST /gigachat/oauth — форма {scope} + Authorization: Basic <credentials>.
 * Ответ — JSON с access_token, как у GigaChat.
 */
import { NextRequest, NextResponse } from "next/server";
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OAUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
// Пертификация Сбера не доверена глобальным CA — только здесь и только для релея.
const dispatcher = new Agent({ connect: { rejectUnauthorized: false } });

function relaySecret(req: NextRequest): string {
  return process.env.GIGACHAT_RELAY_SECRET || "";
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: { code: "UNAUTHORIZED", message: "Relay call only" } },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  const secret = relaySecret(req);
  if (!secret || req.headers.get("x-medbiohim-internal") !== secret) return unauthorized();

  const auth = req.headers.get("authorization") || "";
  if (!/^Basic\s+\S+$/i.test(auth)) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION", message: "Authorization: Basic <credentials> обязателен" } },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }
  const scope = (await req.text()).slice(0, 2000) || "scope=GIGACHAT_API_PERS";

  try {
    const upstream = await undiciFetch(OAUTH_URL, {
      method: "POST",
      headers: {
        authorization: auth,
        "content-type": "application/x-www-form-urlencoded",
        RqUID: crypto.randomUUID(),
        accept: "application/json",
      },
      body: scope,
      dispatcher,
      signal: AbortSignal.timeout(15_000),
    } as UndiciRequestInit);    const text = await upstream.text();
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
