/**
 * Общие помощники для Stitch MCP.
 *
 * Stitch MCP не принимает API-ключи: сервер отвечает «API keys are not
 * supported by this API» и требует OAuth2-токен Google. Поэтому токен берём
 * у локального gcloud (Application Default Credentials) — он обновляется сам,
 * а сам токен никуда не пишется и не логируется.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "../..");
export const SDK_DIR = resolve(ROOT, ".stitch/gcloud/google-cloud-sdk");
export const ADC_DIR = resolve(ROOT, ".stitch/adc");
export const CACHE_DIR = resolve(ROOT, ".stitch/cache");
export const MCP_URL = "https://stitch.googleapis.com/mcp";
export const DOWNLOAD_URL =
  "https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-windows-x86_64.zip";

export function gcloudPath() {
  const bin = process.platform === "win32" ? "gcloud.cmd" : "gcloud";
  return resolve(SDK_DIR, "bin", bin);
}

export function isGcloudInstalled() {
  return existsSync(gcloudPath());
}

export function gcloudEnv(extra = {}) {
  return {
    ...process.env,
    CLOUDSDK_CONFIG: ADC_DIR,
    CLOUDSDK_CORE_DISABLE_PROMPTS: "1",
    CLOUDSDK_PYTHON_SITEPACKAGES: "1",
    ...extra,
  };
}

export function runGcloud(args, { capture = true, timeout = 120_000 } = {}) {
  if (!isGcloudInstalled()) {
    throw new Error(
      "gcloud не установлен. Запустите `npm run stitch:install`.",
    );
  }
  // На Windows gcloud — это .cmd: запускаем через cmd.exe, иначе EINVAL.
  const isWindows = process.platform === "win32";
  const result = spawnSync(
    isWindows ? process.env.ComSpec || "cmd.exe" : gcloudPath(),
    isWindows ? ["/d", "/s", "/c", gcloudPath(), ...args] : args,
    {
      env: gcloudEnv(),
      encoding: "utf8",
      timeout,
      windowsHide: true,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    },
  );
  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  };
}

/** Свежий OAuth-токен. В переменную окружения можно передать готовый. */
export function accessToken() {
  if (process.env.STITCH_ACCESS_TOKEN) return process.env.STITCH_ACCESS_TOKEN.trim();
  const result = runGcloud(["auth", "application-default", "print-access-token"], {
    timeout: 60_000,
  });
  if (result.status !== 0 || !result.stdout) {
    const hint = /could not|not found|no credentials|login/i.test(result.stderr)
      ? "Похоже, вход ещё не выполнен: `npm run stitch:login`."
      : result.stderr;
    throw new Error(`Не удалось получить OAuth-токен. ${hint}`.trim());
  }
  return result.stdout.split(/\s+/)[0];
}

/**
 * Quota project для Stitch API. Берём из ADC (его ставит
 * `gcloud auth application-default set-quota-project`) или из окружения.
 * Сервер требует заголовок `x-goog-user-project`, одного токена мало.
 */
export function quotaProject() {
  const fromEnv = String(process.env.STITCH_GCP_PROJECT || "").trim();
  if (fromEnv) return fromEnv;
  try {
    const raw = readFileSync(resolve(ADC_DIR, "application_default_credentials.json"), "utf8");
    const project = JSON.parse(raw)?.quota_project_id;
    return typeof project === "string" ? project.trim() : "";
  } catch {
    return "";
  }
}

function parseBody(text, contentType) {
  if (contentType.includes("text/event-stream")) {
    const lines = text.split(/\r?\n/);
    const payloads = [];
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const chunk = line.slice(5).trim();
      if (chunk && chunk !== "[DONE]") payloads.push(chunk);
    }
    const last = payloads[payloads.length - 1];
    return last ? JSON.parse(last) : null;
  }
  return text ? JSON.parse(text) : null;
}

/** Один JSON-RPC вызов к MCP-серверу. */
export async function mcp(method, params = {}, { token } = {}) {
  const project = quotaProject();
  const response = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token || accessToken()}`,
      ...(project ? { "x-goog-user-project": project } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const text = await response.text();
  const body = parseBody(text, response.headers.get("content-type") || "");
  if (!body) throw new Error(`Пустой ответ Stitch MCP (HTTP ${response.status}).`);
  if (body.error) throw new Error(body.error.message || JSON.stringify(body.error));
  return body.result;
}

export function textOf(result) {
  const content = Array.isArray(result?.content) ? result.content : [];
  return content
    .map((part) => (part?.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}
