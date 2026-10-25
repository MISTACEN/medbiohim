/**
 * Popup controller: settings, page analysis, manual selection, import.
 */

const DEFAULT_API_BASE = "https://medbiohim-api.ryazansevegor.workers.dev/api/v1";
const SUPPORTED_HOSTS = ["eios.fesmu.ru", "fesmu.ru", "lab.neofamily.ru", "xn--80aafla1ahtef3a7eg.xn--p1ai"];

const elements = {};
let snapshot = null;

function cacheElements() {
  for (const id of [
    "api-base",
    "token-input",
    "save-settings-btn",
    "settings-status",
    "analyze-btn",
    "open-platform-btn",
    "preview-section",
    "preview-container",
    "items-counter",
    "import-all-btn",
    "close-preview-btn",
    "progress",
    "import-status",
  ]) {
    elements[id] = document.getElementById(id);
  }
}

function status(node, message, tone = "") {
  node.textContent = message;
  node.className = `status ${tone}`.trim();
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(["medbiohim_token", "medbiohim_api_base"]);
  elements["api-base"].value = stored.medbiohim_api_base || DEFAULT_API_BASE;
  elements["token-input"].value = stored.medbiohim_token || "";
  if (!stored.medbiohim_token) status(elements["settings-status"], "Токен пока не сохранён — импорт будет недоступен.");
}

function saveSettings() {
  const apiBase = (elements["api-base"].value.trim() || DEFAULT_API_BASE).replace(/\/$/, "");
  const token = elements["token-input"].value.trim();
  if (!/^https?:\/\//i.test(apiBase)) {
    status(elements["settings-status"], "Адрес API должен начинаться с http:// или https://", "error");
    return;
  }
  chrome.storage.sync.set({ medbiohim_api_base: apiBase, medbiohim_token: token }, () => {
    status(elements["settings-status"], token ? "Сохранено. Можно разбирать страницу." : "Адрес сохранён, токен пустой.", "ok");
  });
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isSupported(url) {
  try {
    const host = new URL(url).hostname;
    return SUPPORTED_HOSTS.some((supported) => host === supported || host.endsWith(`.${supported}`));
  } catch {
    return false;
  }
}

function renderPreview(data) {
  snapshot = data;
  elements["preview-section"].classList.remove("hidden");
  elements["preview-container"].innerHTML = "";
  elements["import-status"].textContent = "";
  elements.progress.classList.add("hidden");

  const sourceLabels = { eios: "ЕИОС", fesmu: "ДВГМУ", neofamily: "NeoFamily", sechenov: "Школа Сеченова", other: "Страница" };
  const items = data.items || [];

  for (const [index, item] of items.entries()) {
    const row = document.createElement("label");
    row.className = "item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.dataset.index = String(index);

    const body = document.createElement("div");
    const title = document.createElement("div");
    title.className = "item-title";
    title.textContent = item.title;

    const meta = document.createElement("div");
    meta.className = "item-meta";
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = sourceLabels[item.source] || item.source;
    meta.appendChild(badge);
    meta.append(item.summary ? item.summary.slice(0, 90) : new URL(item.url).hostname);

    body.append(title, meta);
    row.append(checkbox, body);
    checkbox.addEventListener("change", updateCounter);
    elements["preview-container"].appendChild(row);
  }

  elements["items-counter"].textContent = `${items.length} из ${items.length}`;
  elements["import-all-btn"].textContent = `Импортировать (${items.length})`;
  elements["preview-container"].dataset.source = data.source || "other";
}

function selectedItems() {
  if (!snapshot) return [];
  const checked = [...elements["preview-container"].querySelectorAll("input[type=checkbox]:checked")];
  return checked.map((box) => snapshot.items[Number(box.dataset.index)]).filter(Boolean);
}

function updateCounter() {
  const total = snapshot?.items?.length || 0;
  const selected = selectedItems().length;
  elements["items-counter"].textContent = `${selected} из ${total}`;
  elements["import-all-btn"].textContent = `Импортировать (${selected})`;
  elements["import-all-btn"].disabled = selected === 0;
}

async function analyze() {
  const button = elements["analyze-btn"];
  button.disabled = true;
  button.textContent = "Разбираем…";
  try {
    const tab = await activeTab();
    if (!tab?.url || !isSupported(tab.url)) {
      status(elements["settings-status"], "Откройте страницу ДВГМУ (www.fesmu.ru), ЕИОС, NeoFamily или Школы Сеченова.", "error");
      return;
    }
    const response = await chrome.tabs.sendMessage(tab.id, { action: "analyze_page" });
    if (!response?.ok) {
      status(elements["settings-status"], response?.error || "Не удалось разобрать страницу. Обновите её и попробуйте снова.", "error");
      return;
    }
    if (!response.items?.length) {
      status(elements["settings-status"], "На странице не нашлось подходящих ссылок. Откройте список объявлений или уроков.", "error");
      return;
    }
    status(elements["settings-status"], `Найдено материалов: ${response.items.length}. Проверьте список перед импортом.`, "ok");
    renderPreview(response);
  } catch (error) {
    status(elements["settings-status"], `Ошибка: ${error?.message || error}`, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Разобрать страницу";
  }
}

function importSelected() {
  const items = selectedItems();
  if (!items.length) return;
  const button = elements["import-all-btn"];
  button.disabled = true;
  elements.progress.classList.remove("hidden");
  elements.progress.value = 15;
  status(elements["import-status"], "Сохраняем в MEDBIOHIM…");

  chrome.runtime.sendMessage({ action: "import_items", items }, (result) => {
    elements.progress.value = 100;
    if (chrome.runtime.lastError) {
      status(elements["import-status"], chrome.runtime.lastError.message, "error");
      button.disabled = false;
      return;
    }
    if (result?.success) {
      status(
        elements["import-status"],
        `Готово: сохранено ${result.imported ?? items.length}, пропущено дублей ${result.skipped ?? 0}.`,
        "ok"
      );
    } else {
      status(elements["import-status"], result?.error || "Не удалось сохранить импорт.", "error");
    }
    button.disabled = false;
  });
}

async function openPlatform() {
  const tab = await activeTab();
  const target = isSupported(tab?.url || "")
    ? tab.url
    : "https://eios.fesmu.ru/WebApp/#/";
  chrome.tabs.create({ url: target });
}

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  void loadSettings();

  elements["save-settings-btn"].addEventListener("click", saveSettings);
  elements["analyze-btn"].addEventListener("click", () => void analyze());
  elements["open-platform-btn"].addEventListener("click", () => void openPlatform());
  elements["import-all-btn"].addEventListener("click", importSelected);
  elements["close-preview-btn"].addEventListener("click", () => {
    elements["preview-section"].classList.add("hidden");
    snapshot = null;
  });
});
