import { TOPICS_PER_DAY, WEAK_PERCENT } from "./constants";
import type { PrepTopic, PrepItem, PrepDay } from "./types";
import { addDays, diffDays, fmtDay } from "./dates";
import { masteryWhy, studyHref } from "./topics";

/** Раскладка тем по дням до события + финальный прогон накануне. */
export function buildPlanDays(input: {
  topics: PrepTopic[];
  today: string;
  eventDate: string;
  subjectSlug: string | null;
  readiness: number;
}): PrepDay[] {
  const { topics, today, eventDate, subjectSlug, readiness } = input;
  const days: PrepDay[] = [];
  const planHref = studyHref(subjectSlug, "plan");
  const ordered = [...topics].sort((a, b) => a.mastery_pct - b.mastery_pct || a.title.localeCompare(b.title));

  const left = diffDays(today, eventDate);
  // Финальный прогон — вечер накануне; если событие уже завтра или сегодня, прогон сегодня.
  const rehearsal = left >= 2 ? addDays(eventDate, -1) : today;
  const teachEnd = addDays(rehearsal, -1);

  const teachDays: string[] = [];
  for (let cursor = today; diffDays(cursor, teachEnd) >= 0; cursor = addDays(cursor, 1)) {
    teachDays.push(cursor);
    if (teachDays.length >= 14) break;
  }

  const neededDays = Math.max(1, Math.ceil(ordered.length / TOPICS_PER_DAY));
  const slots: string[] = [];
  if (teachDays.length && ordered.length) {
    const count = Math.min(neededDays, teachDays.length);
    for (let index = 0; index < count; index += 1) {
      const position = count === 1 ? 0 : Math.round((index * (teachDays.length - 1)) / (count - 1));
      const date = teachDays[position];
      if (!slots.includes(date)) slots.push(date);
    }
  }

  slots.forEach((date, slotIndex) => {
    const chunk = ordered.slice(slotIndex * TOPICS_PER_DAY, slotIndex * TOPICS_PER_DAY + TOPICS_PER_DAY);
    const items: PrepItem[] = [];
    if (!chunk.length) {
      items.push({
        kind: "plan",
        title: "Свериться с планом предмета и выписать темы события",
        href: planHref,
        why: "по плану предмета темы с идентификаторами не нашлись — темы нужно уточнить вручную",
        done: false,
      });
    }
    for (const topic of chunk) {
      items.push({
        kind: "plan",
        title: `Разобрать по плану: ${topic.title}`,
        href: planHref,
        why: masteryWhy(topic.mastery_pct),
        done: false,
      });
      items.push({
        kind: "cards",
        title: `Собрать пак карточек по теме «${topic.title}»`,
        href: "/cards",
        why: "карточки дают активное повторение вместо перечитывания",
        done: false,
      });
      if (topic.mastery_pct < WEAK_PERCENT) {
        items.push({
          kind: "test",
          title: `Пройти тест по теме «${topic.title}»`,
          href: "/tests",
          why: `освоено ${topic.mastery_pct}% — тест покажет реальные пробелы`,
          done: false,
        });
      }
    }
    days.push({
      date,
      label: `День ${slotIndex + 1} из ${slots.length} · ${fmtDay(date)}`,
      items,
    });
  });

  const rehearsalItems: PrepItem[] = [
    {
      kind: "srs",
      title: "Прогнать все повторения по темам события",
      href: "/cards",
      why: "финальный прогон накануне: короткие повторения дают больше, чем новый материал",
      done: false,
    },
    {
      kind: "test",
      title: ordered.length
        ? `Пробный тест по всем темам: ${ordered.map((topic) => topic.title).slice(0, 4).join(", ")}`
        : "Пробный тест по предмету",
      href: "/tests",
      why: "проверка под формат события: видно, что ещё не отвечается",
      done: false,
    },
  ];
  if (ordered.length && readiness < WEAK_PERCENT) {
    const weakest = ordered[0];
    rehearsalItems.push({
      kind: "plan",
      title: `Перечитать конспект: ${weakest.title}`,
      href: planHref,
      why: `самая слабая тема события — ${weakest.mastery_pct}%`,
      done: false,
    });
  }
  days.push({
    date: rehearsal,
    label: `Финальный прогон · ${fmtDay(rehearsal)}`,
    items: rehearsalItems,
  });

  return days.sort((a, b) => a.date.localeCompare(b.date));
}
