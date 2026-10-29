/**
 * SA4: человекочитаемое имя устройства из User-Agent.
 *
 * Полный UA в интерфейсе бесполезен и пугает: «Mozilla/5.0 (Windows NT 10.0…)».
 * Здесь только браузер/система и тип устройства. Неизвестный UA не выдумываем —
 * возвращаем честное «Неизвестное устройство», а не угаданный браузер.
 */

export type DeviceKind = "desktop" | "mobile" | "tablet" | "bot" | "unknown";

export type DeviceLabel = {
  /** Например, «Chrome на Windows». */
  label: string;
  browser: string | null;
  os: string | null;
  kind: DeviceKind;
};

const BROWSERS: Array<[RegExp, string]> = [
  // Порядок важен: Edge и Opera тоже содержат «Chrome», а Chrome — «Safari».
  [/Edg(?:e|A|iOS)?\//i, "Edge"],
  [/OPR\/|Opera\//i, "Opera"],
  [/YaBrowser\//i, "Яндекс.Браузер"],
  [/Firefox\/|FxiOS\//i, "Firefox"],
  [/Chrome\/|CriOS\//i, "Chrome"],
  [/Safari\//i, "Safari"],
];

const OSES: Array<[RegExp, string]> = [
  [/Windows NT 10\.0/i, "Windows 10/11"],
  [/Windows NT 6\.3/i, "Windows 8.1"],
  [/Windows NT 6\.1/i, "Windows 7"],
  [/Windows/i, "Windows"],
  [/Android/i, "Android"],
  [/iPhone|iPod/i, "iOS"],
  [/iPad/i, "iPadOS"],
  [/Mac OS X|Macintosh/i, "macOS"],
  [/CrOS/i, "ChromeOS"],
  [/Linux/i, "Linux"],
];

export function describeUserAgent(userAgent?: string | null): DeviceLabel {
  const ua = String(userAgent || "").trim();
  if (!ua) return { label: "Неизвестное устройство", browser: null, os: null, kind: "unknown" };

  const bot = /bot|crawler|spider|crawling|headless|python-requests|curl\/|wget\//i.test(ua);
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? null;
  const os = OSES.find(([re]) => re.test(ua))?.[1] ?? null;

  let kind: DeviceKind = "desktop";
  if (bot) kind = "bot";
  else if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) kind = "tablet";
  else if (/Mobile|iPhone|iPod|Android/i.test(ua)) kind = "mobile";

  if (bot) {
    return { label: "Служебный клиент", browser, os, kind };
  }
  if (browser && os) return { label: `${browser} на ${os}`, browser, os, kind };
  if (browser) return { label: browser, browser, os, kind };
  if (os) return { label: os, browser, os, kind };
  // UA есть, но ни браузера, ни системы не распознали — не притворяемся, что знаем.
  return { label: "Неизвестное устройство", browser: null, os: null, kind };
}

/** «5 минут назад», «2 часа назад», «вчера» — для колонки последней активности. */
export function describeLastSeen(iso?: string | null, now: number = Date.now()): string {
  const value = String(iso || "").trim();
  if (!value) return "—";
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return "—";
  const diffMs = now - at;
  if (diffMs < 0) return "только что";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "вчера";
  if (days < 30) return `${days} дн назад`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} мес назад`;
  return `${Math.floor(months / 12)} г назад`;
}
