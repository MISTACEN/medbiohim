/**
 * Релей GigaChat на RU-хостинге (roadmap: docs/DEPLOY-LAYERO.md).
 *
 * Cloudflare Worker не может достучаться до Сбера: сертификат Russian Trusted
 * CA не входит в доверенные CF (ошибка 526 на OAuth). Релей живёт на Layero
 * (RU-хостинг), принимает запросы только от воркера (общий секрет
 * GIGACHAT_RELAY_SECRET в заголовке x-medbiohim-internal) и пересылает их в
 * Сбер с отключённой проверкой цепочки — только здесь, только для этих двух
 * эндпоинтов и только с секретом.
 *
 * POST /gigachat/oauth — форма {scope} + Authorization: Basic <credentials>.
 * Ответ — JSON с access_token, как у GigaChat.
 */
import { NextRequest, NextResponse } from "next/server";
import https from "node:https";
import { URL } from "node:url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OAUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";

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
        // Сертификат Сбера (Russian Trusted CA) не доверен Node — отключаем
        // проверку цепочки только здесь, только для релея GigaChat.
        rejectUnauthorized: false,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { data += chunk; if (data.length > 1_000_000) req.destroy(); });
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

  const auth = req.headers.get("authorization") || "";
  if (!/^Basic\s+\S+$/i.test(auth)) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION", message: "Authorization: Basic <credentials> обязателен" } },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }
  const scope = (await req.text()).slice(0, 2000) || "scope=GIGACHAT_API_PERS";

  try {
    const upstream = await postHttps(
      OAUTH_URL,
      {
        authorization: auth,
        "content-type": "application/x-www-form-urlencoded",
        RqUID: crypto.randomUUID(),
        accept: "application/json",
        "content-length": String(Buffer.byteLength(scope)),
      },
      scope,
      15_000,
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
