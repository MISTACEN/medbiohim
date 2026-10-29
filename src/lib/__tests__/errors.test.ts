import { describe, expect, it } from "vitest";

import {
  DEFAULT_ERROR_TEXT,
  describeApiError,
  describeStatus,
  isTechnicalMessage,
} from "@/lib/errors";

describe("describeApiError: словарь кодов", () => {
  it("переводит NETWORK в понятный русский текст", () => {
    expect(describeApiError({ code: "NETWORK" })).toBe(
      "Нет связи с сервером. Проверьте интернет и попробуйте снова."
    );
  });

  it("переводит DB_UNAVAILABLE и UNAUTHORIZED", () => {
    expect(describeApiError({ code: "DB_UNAVAILABLE" })).toContain("База данных временно недоступна");
    expect(describeApiError({ code: "UNAUTHORIZED" })).toBe("Нужно войти заново.");
  });

  it("оба кода валидации дают одинаковый текст", () => {
    const validation = describeApiError({ code: "VALIDATION" });
    expect(validation).toBe("Проверьте заполненные поля.");
    expect(describeApiError({ code: "VALIDATION_ERROR" })).toBe(validation);
  });

  it("нормализует регистр кода", () => {
    expect(describeApiError({ code: "network" })).toBe(describeApiError({ code: "NETWORK" }));
  });
});

describe("describeApiError: приоритет сообщения", () => {
  it("оставляет осмысленное русское message как есть", () => {
    const message = "Не хватает прав на этот раздел";
    expect(describeApiError({ code: "FORBIDDEN", message })).toBe(message);
  });

  it("отбрасывает техническое английское message и берёт словарь", () => {
    expect(describeApiError({ code: "NOT_FOUND", message: "compound not found" })).toBe(
      "Запись не найдена: возможно, её удалили или перенесли."
    );
  });

  it("отбрасывает «HTTP 500» и «undefined»", () => {
    expect(describeApiError({ code: "UPSTREAM", message: "HTTP 500" })).toBe(
      "Внешний сервис не ответил. Попробуйте позже."
    );
    expect(describeApiError({ code: "UPSTREAM", message: "undefined" })).toBe(
      "Внешний сервис не ответил. Попробуйте позже."
    );
  });

  it("игнорирует message из одних пробелов", () => {
    expect(describeApiError({ code: "TIMEOUT", message: "   " })).toBe(
      "Сервер отвечает слишком долго. Попробуйте ещё раз."
    );
  });
});

describe("describeApiError: fallback по статусу", () => {
  it("неизвестный код без статуса даёт общий текст", () => {
    expect(describeApiError({ code: "SOMETHING_NEW" })).toBe(DEFAULT_ERROR_TEXT);
  });

  it("неизвестный код + HTTP-статус даёт текст статуса", () => {
    expect(describeApiError({ code: "SOMETHING_NEW" }, 503)).toBe(
      "Сервис временно недоступен. Попробуйте позже."
    );
  });

  it("код приоритетнее статуса", () => {
    expect(describeApiError({ code: "RATE_LIMITED" }, 500)).toBe(
      "Слишком много запросов. Подождите минуту и повторите."
    );
  });

  it("пустой аргумент даёт общий текст", () => {
    expect(describeApiError()).toBe(DEFAULT_ERROR_TEXT);
    expect(describeApiError(null)).toBe(DEFAULT_ERROR_TEXT);
    expect(describeApiError({})).toBe(DEFAULT_ERROR_TEXT);
  });
});

describe("describeStatus", () => {
  it("знает распространённые HTTP-статусы", () => {
    expect(describeStatus(404)).toBe("Раздел или запись не найдены.");
    expect(describeStatus(504)).toBe("Сервер отвечает слишком долго. Попробуйте ещё раз.");
  });

  it("неизвестный статус даёт общий текст", () => {
    expect(describeStatus(418)).toBe(DEFAULT_ERROR_TEXT);
  });
});

describe("isTechnicalMessage", () => {
  it("считает машинными пустые и латинские строки", () => {
    expect(isTechnicalMessage("")).toBe(true);
    expect(isTechnicalMessage("   ")).toBe(true);
    expect(isTechnicalMessage("HTTP 500")).toBe(true);
    expect(isTechnicalMessage("not found")).toBe(true);
    expect(isTechnicalMessage("undefined")).toBe(true);
  });

  it("не считает машинной русскую строку", () => {
    expect(isTechnicalMessage("Запись не найдена")).toBe(false);
    expect(isTechnicalMessage("Ошибка, попробуйте ещё раз")).toBe(false);
  });

  it("считает машинными строки без букв: числа и коды", () => {
    // Регрессия: сообщение «500» без кириллицы и латиницы раньше проходило
    // в интерфейс как «человеческий» текст.
    expect(isTechnicalMessage("500")).toBe(true);
    expect(isTechnicalMessage("404")).toBe(true);
    expect(isTechnicalMessage("-1")).toBe(true);
    expect(isTechnicalMessage("0.5")).toBe(true);
    expect(isTechnicalMessage(" #42 ")).toBe(true);
    expect(describeApiError({ code: "VALIDATION_ERROR", message: "500" })).toBe(
      "Проверьте заполненные поля."
    );
  });
});
