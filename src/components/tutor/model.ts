import { BookOpenCheck, GraduationCap, ListChecks, NotebookPen, Sparkles } from "lucide-react";
import type { AiProvider } from "@/lib/features-api";

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  auto: "Авто — лучший доступный",
  openai: "OpenAI",
  groq: "Groq",
  gigachat: "GigaChat",
  gemini: "Gemini",
  mistral: "Mistral",
  openrouter: "OpenRouter",
  custom: "Своя модель",
};

/** Порядок в дропдауне: авто, российский контур, глобальные, своя модель. */
export const PROVIDER_ORDER: AiProvider[] = ["auto", "gigachat", "gemini", "groq", "mistral", "openai", "openrouter", "custom"];

/** Резервный список моделей, пока /ai/providers не отдал свой. */
export const FALLBACK_MODELS: Partial<Record<AiProvider, string[]>> = {
  gigachat: ["GigaChat-2-Max", "GigaChat-2-Pro", "GigaChat-2", "GigaChat"],
  groq: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  gemini: ["gemini-3.6-flash", "gemini-2.0-flash"],
  mistral: ["mistral-small-latest", "mistral-medium-latest"],
  openai: ["gpt-4.1-mini", "gpt-4o-mini"],
};

/**
 * Что модель умеет в рамках нашего чата (честно и без маркетинга):
 * все — текст/таблицы/схемы mermaid в ответе; мультимодальность и рассуждения —
 * только у отдельных моделей. Изображения не генерирует никто из подключённых.
 */
export const PROVIDER_CAPABILITIES: Partial<Record<AiProvider, string>> = {
  gigachat: "Русский язык, нормативка РФ · таблицы · без картинок",
  gemini: "Видит изображения · длинный контекст · из RU недоступен",
  groq: "Самый быстрый · reasoning-модель gpt-oss",
  mistral: "Быстрый, Европа · таблицы",
  openai: "Сильная универсальная · таблицы",
  openrouter: "Шлюз к сотням моделей",
  custom: "Ваша модель · возможности зависят от неё",
};

/** Инструменты чата: подставляют готовую инструкцию в поле ввода. */
export const CHAT_TOOLS = [
  { label: "Таблица", prompt: "Оформи ответ таблицей в markdown: " },
  { label: "Схема", prompt: "Покажи схему/алгоритм mermaid-диаграммой: " },
  { label: "Формулы", prompt: "Объясни с формулами (LaTeX в $...$): " },
  { label: "Карточки", prompt: "Составь 5 пар вопрос–ответ для карточек по теме: " },
];

/** Стартовые вопросы блока «Подготовка ЦНС» — темы корпуса знаний ЦНС. */
export const CNS_STARTERS = [
  "Объясни типы торможения в ЦНС и их медиаторы — по методичке",
  "ЭЭГ-ритмы: когда какой ритм и почему это любят спрашивать в тестах",
  "Проведи через ситуационную задачу по синаптической передаче",
  "Кратко: спинной мозг — проводящие пути и рефлексы",
  "ВНС: отличия симпатической и парасимпатической на уровне медиаторов",
];

export const MODULE_LINKS = [
  { href: "/study#подготовка", label: "План подготовки", icon: ListChecks },
  { href: "/cards", label: "Карточки SRS", icon: BookOpenCheck },
  { href: "/cards?tab=packs", label: "Пак карточек по теме", icon: Sparkles },
  { href: "/tests/preparation", label: "Устный экзамен", icon: GraduationCap },
  { href: "__attach__", label: "Конспект из файла/аудио", icon: NotebookPen },
];

export const VISION_PROVIDERS = new Set<AiProvider>(["gemini", "openai", "groq", "openrouter", "custom"]);

export type TutorNotesResult = { filename: string; notes: string; provider: string; model: string; savedId: string | null };

/**
 * Модель иногда сама дописывает в конец ответа «Источники: [1] … [N]».
 * Под ответом уже есть панель сносок AnswerSources — инлайновый дубль убираем,
 * но только если сервер действительно отдал sources.
 */
export function stripInlineSourceList(md: string) {
  return md.replace(/\n+\s*(?:\*\*|__)?Источники(?:\*\*|__)?\s*:[\s\S]*$/i, "").trim();
}
