/**
 * MEDBIOHIM importer background worker.
 * Receives reviewed items from the popup and stores them through the API.
 */

const DEFAULT_API_BASE = "https://medbiohim-api.ryazansevegor.workers.dev/api/v1";
const MAX_ITEMS = 25;
const RETRY_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["medbiohim_token", "medbiohim_api_base"], (result) => {
      resolve({
        token: result.medbiohim_token || "",
        apiBase: (result.medbiohim_api_base || DEFAULT_API_BASE).replace(/\/$/, ""),
      });
    });
  });
}

function notify(title, message) {
  try {
    chrome.notifications.create("", { type: "basic", title, message }, () => void chrome.runtime.lastError);
  } catch {
    /* notifications are best-effort */
  }
}

async function importItems(items) {
  const { token, apiBase } = await getSettings();
  if (!token) return { success: false, error: "Сначала сохраните токен MEDBIOHIM в расширении." };
  if (!Array.isArray(items) || items.length === 0) return { success: false, error: "Нет выбранных материалов." };

  const payload = items.slice(0, MAX_ITEMS).map((item) => ({
    title: String(item.title || "").slice(0, 500),
    url: String(item.url || ""),
    kind: item.kind || "link",
    source: item.source || "other",
    summary: item.summary || undefined,
    published_at: item.published_at || undefined,
  }));

  let lastError = "Не удалось сохранить импорт.";
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${apiBase}/integrations/imports`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: payload, provenance: { method: "browser_extension", version: chrome.runtime.getManifest().version } }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const imported = Number(data?.data?.imported || 0);
        const skipped = Number(data?.data?.skipped || 0);
        notify("Импорт завершён", `Сохранено: ${imported}. Пропущено дублей: ${skipped}.`);
        return { success: true, imported, skipped };
      }
      lastError = data?.error?.message || `HTTP ${response.status}`;
      if (response.status === 401) return { success: false, error: "Токен недействителен — войдите заново." };
      if (![429, 500, 502, 503].includes(response.status)) return { success: false, error: lastError };
    } catch (error) {
      lastError = String(error?.message || error);
    }
    if (attempt < RETRY_ATTEMPTS) await sleep(600 * attempt);
  }
  notify("Импорт не удался", lastError);
  return { success: false, error: lastError };
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.action === "import_items") {
    importItems(request.items)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: String(error?.message || error) }));
    return true;
  }
  if (request?.action === "save_settings") {
    chrome.storage.sync.set(
      { medbiohim_token: request.token || "", medbiohim_api_base: request.apiBase || DEFAULT_API_BASE },
      () => sendResponse({ success: true })
    );
    return true;
  }
  return false;
});

console.log("[MEDBIOHIM Importer] service worker ready");
