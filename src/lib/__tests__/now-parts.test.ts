import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { nowParts, pickNextLesson, PLATFORM_TZ, type NowParts } from "@/lib/now-parts";

type Row = { id?: string; date?: string | null; start_time?: string | null };

function at(utcIso: string) {
  vi.setSystemTime(new Date(utcIso));
}

beforeEach(() => {
  // Время «замораживаем», setTimeout/fetch не трогаем.
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("nowParts: таймзона платформы", () => {
  it("считает дату и время во Владивостоке (UTC+10), а не в UTC", () => {
    at("2026-10-28T02:30:00Z");
    const now = nowParts();

    expect(PLATFORM_TZ).toBe("Asia/Vladivostok");
    expect(now).toMatchObject({
      year: 2026,
      month: 10,
      day: 28,
      hour: 12,
      minute: 30,
      date: "2026-10-28",
      minutes: 12 * 60 + 30,
      timeLabel: "12:30",
    });
  });

  it("на границе суток переключает дату на следующий день", () => {
    // 14:00 UTC = 00:00 следующего дня во Владивостоке.
    at("2026-10-27T14:00:00Z");
    const now = nowParts();

    expect(now.date).toBe("2026-10-28");
    expect(now.hour).toBe(0);
    expect(now.minutes).toBe(0);
    expect(now.timeLabel).toBe("00:00");
  });

  it("в конце суток остаётся тот же день и 23:59", () => {
    at("2026-10-28T13:59:00Z");
    const now = nowParts();

    expect(now.date).toBe("2026-10-28");
    expect(now.timeLabel).toBe("23:59");
    expect(now.minutes).toBe(23 * 60 + 59);
  });

  it("уважает явно переданную таймзону", () => {
    at("2026-10-28T02:30:00Z");
    expect(nowParts("UTC")).toMatchObject({ date: "2026-10-28", timeLabel: "02:30" });
  });
});

describe("pickNextLesson", () => {
  const now: NowParts = {
    year: 2026,
    month: 10,
    day: 28,
    hour: 12,
    minute: 30,
    date: "2026-10-28",
    minutes: 12 * 60 + 30,
    timeLabel: "12:30",
  };

  it("выбирает первую пару, которая ещё наступит сегодня", () => {
    const rows: Row[] = [
      { id: "past", date: "2026-10-28", start_time: "09:00" },
      { id: "next", date: "2026-10-28", start_time: "14:00" },
      { id: "later", date: "2026-10-28", start_time: "16:00" },
    ];

    expect(pickNextLesson(rows, now)?.id).toBe("next");
  });

  it("считает пару, начинающуюся ровно сейчас, ближайшей", () => {
    const rows: Row[] = [{ id: "now", date: "2026-10-28", start_time: "12:30" }];
    expect(pickNextLesson(rows, now)?.id).toBe("now");
  });

  it("если сегодня пар больше нет — берёт первую пару следующего дня", () => {
    const rows: Row[] = [
      { id: "tomorrow-late", date: "2026-10-29", start_time: "15:00" },
      { id: "today-past", date: "2026-10-28", start_time: "08:00" },
      { id: "tomorrow-early", date: "2026-10-29", start_time: "09:00" },
    ];

    expect(pickNextLesson(rows, now)?.id).toBe("tomorrow-early");
  });

  it("сортирует непереданные в порядке записи строки по дате и времени", () => {
    const rows: Row[] = [
      { id: "b", date: "2026-10-30", start_time: "09:00" },
      { id: "a", date: "2026-10-29", start_time: "16:00" },
      { id: "c", date: "2026-10-29", start_time: "10:00" },
      { id: "d", date: "2026-10-28", start_time: "11:00" }, // уже прошла
    ];

    expect(pickNextLesson(rows, now)?.id).toBe("c");
  });

  it("пустой список и список из прошлых пар дают null", () => {
    expect(pickNextLesson([], now)).toBeNull();
    expect(
      pickNextLesson([{ id: "old", date: "2026-10-27", start_time: "10:00" }], now)
    ).toBeNull();
  });

  it("без start_time пара считается началом дня (00:00) и не побеждает днём", () => {
    const rows: Row[] = [
      { id: "no-time", date: "2026-10-28" },
      { id: "evening", date: "2026-10-28", start_time: "18:00" },
    ];

    expect(pickNextLesson(rows, now)?.id).toBe("evening");
  });

  it("секунды в start_time не мешают сравнению (14:00:00 → 14:00)", () => {
    const rows: Row[] = [
      { id: "seconds", date: "2026-10-28", start_time: "14:00:00" },
      { id: "later", date: "2026-10-28", start_time: "16:00" },
    ];

    expect(pickNextLesson(rows, now)?.id).toBe("seconds");
  });

  it("не мутирует исходный массив строк", () => {
    const rows: Row[] = [
      { id: "b", date: "2026-10-29", start_time: "16:00" },
      { id: "a", date: "2026-10-29", start_time: "09:00" },
    ];
    pickNextLesson(rows, now);
    expect(rows.map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("время без ведущего нуля сравнивается по минутам, а не по строке", () => {
    // Регрессия: «9:00» лексикографически больше «12:30», и вечерняя пара
    // выбиралась раньше утренней.
    const rows: Row[] = [
      { id: "late", date: "2026-10-29", start_time: "12:30" },
      { id: "early", date: "2026-10-29", start_time: "9:00" },
    ];

    expect(pickNextLesson(rows, now)?.id).toBe("early");
  });

  it("пара с некорректным временем не выбирается вместо корректной", () => {
    const rows: Row[] = [
      { id: "broken", date: "2026-10-30", start_time: "25:99" },
      { id: "valid", date: "2026-10-30", start_time: "08:00" },
    ];

    expect(pickNextLesson(rows, now)?.id).toBe("valid");
  });
});
