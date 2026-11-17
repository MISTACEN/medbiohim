import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";

/**
 * Раздача облачной медиа-библиотеки из Backblaze B2 (бакет приватный).
 *
 * GET /api/media/<object_key> → 302 на подписанный B2 download URL
 * (b2_get_download_authorization, токен на 1 час).
 *
 * Безопасность: ключи только из allowlist `public/content/library-media.json` —
 * произвольные ключи бакета и листинг недоступны. Ключи бакета в браузер
 * не попадают: подписание целиком на сервере.
 */

type LibraryMedia = {
  items: Array<{ key: string }>;
};

type DownloadAuth = { url: string; expiresAt: number };

let cachedAuth: { token: DownloadAuth; prefix: string } | null = null;

function readManifest(): LibraryMedia["items"] {
  const file = path.join(process.cwd(), "public", "content", "library-media.json");
  return (JSON.parse(fs.readFileSync(file, "utf8")) as LibraryMedia).items;
}

function envRequired(): { keyId: string; applicationKey: string; bucket: string } {
  const keyId = process.env.B2_KEY_ID;
  const applicationKey = process.env.B2_APPLICATION_KEY;
  const bucket = process.env.B2_BUCKET;
  if (!keyId || !applicationKey || !bucket) throw new Error("B2 env не настроен");
  return { keyId, applicationKey, bucket };
}

type B2Authorize = {
  authorizationToken: string;
  apiInfo?: { storageApi?: { apiUrl?: string; bucketId?: string; downloadUrl?: string } };
};

async function b2Authorize(keyId: string, applicationKey: string): Promise<B2Authorize> {
  const basic = Buffer.from(`${keyId}:${applicationKey}`).toString("base64");
  const response = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
    headers: { Authorization: `Basic ${basic}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`b2_authorize_account: ${response.status}`);
  return response.json();
}

async function downloadAuth(key: string): Promise<DownloadAuth> {
  if (cachedAuth && cachedAuth.prefix === key && cachedAuth.token.expiresAt > Date.now() + 60_000) {
    return cachedAuth.token;
  }
  const env = envRequired();
  const auth = await b2Authorize(env.keyId, env.applicationKey);
  const storage = auth.apiInfo?.storageApi ?? {};
  const apiUrl = storage.apiUrl;
  const bucketId = storage.bucketId;
  const downloadUrl = storage.downloadUrl;
  if (!apiUrl || !bucketId || !downloadUrl) throw new Error("b2_authorize_account: нет apiUrl/bucketId/downloadUrl");
  const authResponse = await fetch(`${apiUrl}/b2api/v3/b2_get_download_authorization`, {
    method: "POST",
    headers: {
      // B2 native API: токен передаётся как есть, без Bearer-префикса
      Authorization: auth.authorizationToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bucketId, fileNamePrefix: key, validDurationInSeconds: 3600 }),
    cache: "no-store",
  });
  if (!authResponse.ok) throw new Error(`b2_get_download_authorization: ${authResponse.status}`);
  const json = (await authResponse.json()) as { authorizationToken: string };
  const token = {
    url: `${downloadUrl}/file/${env.bucket}/${key}?Authorization=${encodeURIComponent(json.authorizationToken)}`,
    expiresAt: Date.now() + 55 * 60 * 1000,
  };
  cachedAuth = { token, prefix: key };
  return token;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await params;
  // ключи бакета содержат «/» — склеиваем сегменты catch-all
  const key = segments.map((segment) => decodeURIComponent(segment)).join("/");
  try {
    const allowed = readManifest().some((item) => item.key === key);
    if (!allowed) {
      return Response.json({ ok: false, error: { code: "NOT_FOUND", message: "Файл не найден" } }, { status: 404 });
    }
    const auth = await downloadAuth(key);
    return Response.redirect(auth.url, 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : "media download failed";
    if (message.includes("B2 env")) {
      return Response.json(
        { ok: false, error: { code: "STORAGE_UNAVAILABLE", message: "Облачное хранилище не настроено" } },
        { status: 503 },
      );
    }
    return Response.json(
      { ok: false, error: { code: "STORAGE_ERROR", message: "Не удалось открыть файл" } },
      { status: 502 },
    );
  }
}
