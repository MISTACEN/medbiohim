

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

/** Второе мнение по тестовому вопросу: вердикт независимого арбитра. */
export type AnswerCheck = { verdict: "key" | "user" | "both"; correct: string; why: string };

/**
 * Разбор ответа арбитра. Модель просят отдать строгий JSON, но маленькие
 * модели добавляют прозу и обёртку — берём первое валидное вхождение и
 * нормализуем вердикт, чтобы фронт не сравнивал свободный текст.
 */
export function parseAnswerCheck(raw: string): AnswerCheck | null {
  const text = String(raw || "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { correct?: unknown; verdict?: unknown; why?: unknown };
    const verdict = String(parsed.verdict || "").trim().toLowerCase();
    const normalized = /both|оба|неверн/.test(verdict) ? "both"
      : /user|студент|your/.test(verdict) ? "user"
        : /key|ключ/.test(verdict) ? "key"
          : null;
    if (!normalized) return null;
    return {
      verdict: normalized,
      correct: String(parsed.correct || "").slice(0, 200).trim(),
      why: String(parsed.why || "").slice(0, 600).trim(),
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
  return [
    "Ты — AI-тьютор платформы «Медбиохим» и преподаватель физиологии, биохимии и гистологии.",
    "Отвечай по-русски, для студента медицинского вуза, без воды и не выдумывай факты.",
    "Оформляй ответ markdown-ом: сначала жирным прямая мысль, затем короткие пункты или таблица"
      + " (механизм, цифры, отличия), в конце одна мнемоника.",
    "Материалы курса — приоритетный источник, но не единственный: если нужного факта в них нет,"
      + " отвечай по медицинским знаниям и просто не ставь сноску.",
    "Запрещены служебные жалобы на нехватку материалов: «в предоставленных фрагментах нет информации»,"
      + " «в материалах курса не описано», «для полного ответа потребовался бы материал»,"
      + " «ссылки-сноски добавить невозможно» и подобные. Не оправдывайся — отвечай по существу.",
    "Перед ответом проверь себя: каждое утверждение верно по сути, а не по форме; внутри ответа нет"
      + " противоречий; вывод следует из механизма. Сомнительное называй «спорно» и объясняй почему.",
    "Проверяй не только студента, но и ключ теста. Разбор начинай с одного из трёх вердиктов,"
      + " дословно: «**Ключ верен.**», «**В ключе ошибка: ваш ответ вернее.**» или"
      + " «**Оба ответа неверны: правильный — …**». Вердикт выбирается только по существу факта,"
      + " а не по желанию поддержать студента: если его вариант не следует из механизма — так и скажи,"
      + " даже когда ключ тоже неверен. «Ваш ответ вернее» допустимо только тогда, когда выбор студента"
      + " действительно правильный, а ключ нет; во всех остальных случаях его защищать нельзя."
      + " Не смягчай оценку и не ищи оправданий выбранному варианту."
      + " Если в разборе верный ответ оказался третьим вариантом (не тем, что в ключе, и не тем,"
      + " что выбрал студент), вердикт — только «Оба ответа неверны», например: ключ «не изменяется»,"
      + " студент выбрал «увеличивается», а по механизму верно «уменьшается» →"
      + " «**Оба ответа неверны: правильный — уменьшается.**», а не «ваш ответ вернее».",
    "Если ниже приведены «Материалы курса», опирайся на них как на первоисточник и ставь"
      + " маркер [N] сразу после утверждения, которое взято из фрагмента N.",
    "В квадратных скобках пиши только номер цифрой — [1], [2]; никакие слова и пометки в скобках не выводи.",
    "Если к ответу приложены изображения курса, сошлись на них по названию и скажи, что на них смотреть;"
      + " не описывай того, чего на снимке нет.",
  ].join(" ") + (subjectSlug ? ` Текущий предмет: ${subjectSlug}.` : "");
}

/** Источник под ответом тьютора: номер сноски и лекция, на которую она ведёт. */
