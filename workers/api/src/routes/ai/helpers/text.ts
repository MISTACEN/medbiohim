

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ProviderResult = { text: string; provider: string; model: string };

/** Режимы ответа тьютора: «точный» держится на лекциях, «быстрый» — без RAG. */

/** Режимы ответа тьютора: «точный» держится на лекциях, «быстрый» — без RAG. */
export type ChatMode = "precise" | "fast";

export const MODE_TEMPERATURE: Record<ChatMode, number> = { precise: 0.2, fast: 0.5 };
/** Быстрая модель второго прохода: отвечает за секунды, а не за полминуты. */

/** Быстрая модель второго прохода: отвечает за секунды, а не за полминуты. */
export const FAST_WORKERS_AI_MODEL = "@cf/meta/llama-3.2-3b-instruct";

export function normalizeChatMode(value: unknown): ChatMode {
  return value === "fast" ? "fast" : "precise";
}

export type OralVerdict = { score: number; verdict: string; missed: string[]; mistakes: string[]; follow_up: string };

export function decodeBase64Url(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function decodeBase64Text(base64: string): string {
  try {
    return new TextDecoder().decode(decodeBase64Url(base64));
  } catch {
    return "";
  }
}

export type ImageExtract = { text: string; code: string; message: string };

/**
 * Расшифровка аудио в текст (roadmap 2.5.2 «конспект из записи»): Groq Whisper.
 * Расшифровка идёт в тот же конспект-промпт, что и PDF/фото. Groq выбран потому,
 * что whisper-large-v3 у него быстрый (×200 realtime) и ключ уже есть у воркера.
 * Без GROQ_API_KEY — честный 503 AUDIO_NOT_CONFIGURED.
 */

/**
 * Парсинг вердикта экзаменатора. Провайдеры иногда оборачивают JSON в
 * markdown-код-блок или добавляют прозу — вырезаем первое валидное вхождение.
 */
export function parseOralVerdict(raw: string): OralVerdict | null {
  const text = String(raw || "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<OralVerdict>;
    const score = Math.max(0, Math.min(10, Math.round(Number(parsed.score) || 0)));
    return {
      score,
      verdict: String(parsed.verdict || "").slice(0, 300),
      missed: (Array.isArray(parsed.missed) ? parsed.missed : []).map((m) => String(m).slice(0, 300)).slice(0, 8),
      mistakes: (Array.isArray(parsed.mistakes) ? parsed.mistakes : []).map((m) => String(m).slice(0, 300)).slice(0, 8),
      follow_up: String(parsed.follow_up || "").slice(0, 500),
    };
  } catch {
    return null;
  }
}

/**
 * Второй проход по уменьшенному запросу. Биндинг Workers AI отвечает ровно и
 * быстро на короткий промпт (3-7 с), но иногда зависает сверх 25 с — тогда
 * ответ не успевал и студент получал 502. Повтор с урезанным контекстом и
 * меньшим лимитом токенов укладывается в бюджет прокси и обычно проходит.
 */
export function compactForWorkersAi(messages: ChatMessage[]): ChatMessage[] {
  const system = messages.find((message) => message.role === "system");
  const rest = messages.filter((message) => message.role !== "system").slice(-4);
  return [
    ...(system ? [{ role: "system" as const, content: system.content.slice(0, 4000) }] : []),
    ...rest.map((message) => ({ role: message.role, content: message.content.slice(0, 4000) })),
  ];
}

export function systemPrompt(subjectSlug?: string | null): string {
  return "Ты — AI-тьютор платформы «Медбиохим». Отвечай по-русски, понятно студенту медицинского вуза. Объясняй последовательно, не выдумывай факты. Если вопрос учебный — выделяй ключевые понятия, механизм и короткий вывод."
    + " Если ниже приведены «Материалы курса», опирайся на них как на первоисточник и ставь"
    + " маркер [N] сразу после утверждения, которое взято из фрагмента N."
    + " В квадратных скобках пиши только номер цифрой — [1], [2]; никакие слова и пометки в скобках не выводи."
    + (subjectSlug ? ` Текущий предмет: ${subjectSlug}.` : "");
}

/** Источник под ответом тьютора: номер сноски и лекция, на которую она ведёт. */
