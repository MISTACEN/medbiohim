/**
 * Готовые ИИ-действия по лекции (фаза 2.9 карты).
 *
 * Промпты живут в одном месте и тестируются без сети: кнопка — это только выбор
 * пресета, а не «магия» в компоненте. Требование к формулировкам одно — не
 * выдумывать факты: стиль меняется, содержание нет.
 */

export type AiPresetId = "mnemonic" | "exam" | "child" | "gossip" | "scheme";

export type AiPreset = {
  id: AiPresetId;
  label: string;
  instruction: string;
};

/** Сколько символов лекции отправляем как контекст: хватает на термины, но не на весь текст. */
export const PRESET_EXCERPT_LIMIT = 1200;

export const AI_PRESETS: AiPreset[] = [
  {
    id: "mnemonic",
    label: "Мнемоника",
    instruction:
      "Придумай короткую мнемонику (2–5 строк), которая помогает запомнить ключевые понятия темы. Без выдуманных фактов и без лишних пояснений.",
  },
  {
    id: "exam",
    label: "Как на экзамене",
    instruction:
      "Объясни тему так, как отвечают на экзамене: определение, механизм, ключевые термины, короткий вывод. Плотно и по делу, без вступления.",
  },
  {
    id: "child",
    label: "Как пятилетнему",
    instruction:
      "Объясни тему очень простыми словами с одной бытовой аналогией. Суть не искажай: упрощай язык, а не факты.",
  },
  {
    id: "gossip",
    label: "Как сплетню",
    instruction:
      "Расскажи тему как увлекательную сплетню — живо и коротко. Факты, термины и связи должны остаться верными.",
  },
  {
    id: "scheme",
    label: "Схема на доске",
    instruction:
      "Ответь ТОЛЬКО блоком кода ```mermaid с диаграммой flowchart TD: 6–10 узлов, короткие подписи по-русски, без текста вне блока.",
  },
];

export type PresetContext = {
  title: string;
  subjectSlug?: string | null;
  excerpt?: string | null;
};

/** Собирает сообщение пользователю-тьютору: пресет + тема + фрагмент лекции. */
export function buildPresetMessage(preset: AiPreset, context: PresetContext): string {
  const title = String(context.title || "").trim() || "текущая тема";
  const subject = String(context.subjectSlug || "").trim();
  const excerpt = String(context.excerpt || "").replace(/\s+/g, " ").trim().slice(0, PRESET_EXCERPT_LIMIT);
  return [
    preset.instruction,
    "",
    `Тема: «${title}»${subject ? ` (предмет: ${subject})` : ""}.`,
    excerpt ? `Фрагмент лекции: ${excerpt}` : "",
    "",
    "Опирайся только на материалы курса. Если данных не хватает — прямо скажи об этом.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function presetById(id: AiPresetId): AiPreset {
  return AI_PRESETS.find((preset) => preset.id === id) || AI_PRESETS[0];
}
