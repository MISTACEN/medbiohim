/**
 * Релей GigaChat chat/completions (docs/DEPLOY-LAYERO.md): принимает OpenAI-
 * подобный запрос от воркера (x-medbiohim-internal: GIGACHAT_RELAY_SECRET,
 * Authorization: Bearer <access_token>) и пересылает в Сбер. Ответ — как у
 * GigaChat (JSON; тьютор ходит без streaming).
 */
import { NextRequest, NextResponse } from "next/server";
import https from "node:https";
import { URL } from "node:url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAT_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";
const MAX_BODY_CHARS = 400_000;

function postHttps(url: string, headers: Record<string, string>, body: string, timeoutMs: number): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname + target.search,
        method: "POST",
        headers,
        // Сертификат Сбера не доверен Node — отключаем проверку цепочки только
        // здесь и только для релея GigaChat.
        rejectUnauthorized: false,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { data += chunk; if (data.length > 4_000_000) req.destroy(); });
        res.on("end", () => resolve({ status: res.statusCode || 502, text: data }));
      },
    );
    req.on("error", (error) => reject(error));
    req.setTimeout(timeoutMs, () => req.destroy(new Error("timeout")));
    req.write(body);
    req.end();
  });
}

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
    const upstream = await postHttps(
      CHAT_URL,
      {
        authorization: bearer,
        "content-type": "application/json",
        accept: "application/json",
        "content-length": String(Buffer.byteLength(body)),
      },
      body,
      90_000,
    );
    return new NextResponse(upstream.text, {
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
