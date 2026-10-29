import { describe, expect, it } from "vitest";

import { describeLastSeen, describeUserAgent } from "@/lib/device";

const UA = {
  chromeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  firefox: "Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/604.1",
  yandex: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 YaBrowser/24.4.0.0 Safari/537.36",
};

describe("describeUserAgent", () => {
  it("распознаёт Chrome на Windows и не путает его с Safari", () => {
    const device = describeUserAgent(UA.chromeWin);
    expect(device.browser).toBe("Chrome");
    expect(device.os).toBe("Windows 10/11");
    expect(device.kind).toBe("desktop");
    expect(device.label).toBe("Chrome на Windows 10/11");
  });

  it("ставит Edge выше Chrome, потому что Edge содержит Chrome", () => {
    expect(describeUserAgent(UA.edge).browser).toBe("Edge");
    expect(describeUserAgent(UA.yandex).browser).toBe("Яндекс.Браузер");
  });

  it("определяет Firefox, Safari и их системы", () => {
    expect(describeUserAgent(UA.firefox).label).toBe("Firefox на Linux");
    expect(describeUserAgent(UA.safariMac).label).toBe("Safari на macOS");
  });

  it("определяет тип устройства", () => {
    expect(describeUserAgent(UA.iphone).kind).toBe("mobile");
    expect(describeUserAgent(UA.android).kind).toBe("mobile");
    expect(describeUserAgent(UA.ipad).kind).toBe("tablet");
  });

  it("служебные клиенты не выдают себя за браузер студента", () => {
    const bot = describeUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
    expect(bot.kind).toBe("bot");
    expect(bot.label).toBe("Служебный клиент");
    expect(describeUserAgent("python-requests/2.31.0").kind).toBe("bot");
  });

  it("не выдумывает устройство при пустом или неизвестном UA", () => {
    expect(describeUserAgent(null)).toEqual({
      label: "Неизвестное устройство", browser: null, os: null, kind: "unknown",
    });
    expect(describeUserAgent("   ").label).toBe("Неизвестное устройство");
    expect(describeUserAgent("SomethingWeird/1.0").label).toBe("Неизвестное устройство");
  });
});

describe("describeLastSeen", () => {
  const now = Date.parse("2026-10-29T12:00:00Z");

  it("переводит давность в человеческие слова", () => {
    expect(describeLastSeen(null, now)).toBe("—");
    expect(describeLastSeen("не дата", now)).toBe("—");
    expect(describeLastSeen("2026-10-29T11:59:40Z", now)).toBe("только что");
    expect(describeLastSeen("2026-10-29T11:35:00Z", now)).toBe("25 мин назад");
    expect(describeLastSeen("2026-10-29T09:00:00Z", now)).toBe("3 ч назад");
    expect(describeLastSeen("2026-10-28T09:00:00Z", now)).toBe("вчера");
    expect(describeLastSeen("2026-10-20T09:00:00Z", now)).toBe("9 дн назад");
    expect(describeLastSeen("2026-07-01T09:00:00Z", now)).toBe("4 мес назад");
    expect(describeLastSeen("2024-01-01T09:00:00Z", now)).toBe("2 г назад");
  });

  it("будущее время не показывает отрицательную давность", () => {
    expect(describeLastSeen("2026-10-30T12:00:00Z", now)).toBe("только что");
  });
});
