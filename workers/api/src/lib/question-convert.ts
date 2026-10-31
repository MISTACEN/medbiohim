/**
 * Блок 1 бэклога: конвертация Workshop (kind=test_questions) → банк вопросов.
 *
 * Черновик сеется из вопросов элемента и OCR/PDF-текста, но публикация всегда
 * проходит через ручную сверку модератора (правило Pass 26A: никакой автоматой
 * в прод-банк). Валидатор возвращает machine-readable ошибки, а не исключения.
 */

export type ConvertOptionDraft = { label: string; correct?: boolean; image_file_id?: string | null };

export type ConvertQuestionDraft = {
  text: string;
  topic?: string | null;
  options?: ConvertOptionDraft[];
  answer?: string | null;
};

const MAX_QUESTION_TEXT = 2000;
const MAX_OPTION_LABEL = 500;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 8;

export type ConvertValidationResult =
  | { ok: true; questions: Required<Pick<ConvertQuestionDraft, "text" | "options" | "answer">>[] }
  | { ok: false; errors: Array<{ index: number; message: string }> };

/** Сид черновика: вопросы элемента + абзацы OCR-текста, заканчивающиеся «?»/«:». */
export function draftQuestionsFromItem(input: {
  questions?: Array<{ text?: unknown; topic?: unknown }>;
  ocrText?: unknown;
}): ConvertQuestionDraft[] {
  const drafts: ConvertQuestionDraft[] = [];
  for (const question of input.questions || []) {
    const text = String(question?.text ?? "").trim();
    if (text) drafts.push({ text: text.slice(0, MAX_QUESTION_TEXT), topic: question?.topic ? String(question.topic).slice(0, 200) : null, options: [] });
  }
  const ocr = String(input.ocrText ?? "");
  if (ocr) {
    // Нумерованные строки «1) …», «1. …» — почти наверняка отдельные вопросы.
    for (const line of ocr.split("\n")) {
      const match = line.trim().match(/^\d{1,2}[).]\s+(.{5,})$/);
      if (match) drafts.push({ text: match[1].trim().slice(0, MAX_QUESTION_TEXT), topic: null, options: [] });
    }
  }
  const seen = new Set<string>();
  return drafts.filter((draft) => {
    const key = draft.text.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 200);
}

/**
 * Ручная сверка модератора перед публикацией: текст, 2–8 варианта с ≥1
 * верным (для закрытых), image_file_id только из файлов исходного элемента.
 */
export function validateConvertedQuestions(
  input: unknown,
  allowedImageFileIds: Set<string>
): ConvertValidationResult {
  if (!Array.isArray(input)) return { ok: false, errors: [{ index: -1, message: "questions должен быть массивом" }] };
  if (input.length === 0) return { ok: false, errors: [{ index: -1, message: "Пустой список вопросов" }] };
  if (input.length > 200) return { ok: false, errors: [{ index: -1, message: "Слишком много вопросов за раз (макс 200)" }] };

  const errors: Array<{ index: number; message: string }> = [];
  const questions: Required<Pick<ConvertQuestionDraft, "text" | "options" | "answer">>[] = [];

  input.forEach((raw, index) => {
    const question = (raw ?? {}) as Record<string, unknown>;
    const text = String(question.text ?? "").trim();
    if (!text) { errors.push({ index, message: "Пустой текст вопроса" }); return; }
    if (text.length > MAX_QUESTION_TEXT) { errors.push({ index, message: `Текст вопроса длиннее ${MAX_QUESTION_TEXT} символов` }); return; }

    const rawOptions = Array.isArray(question.options) ? question.options : [];
    const options: ConvertOptionDraft[] = [];
    for (const rawOption of rawOptions) {
      if (typeof rawOption === "string") {
        const label = rawOption.trim();
        if (label) options.push({ label: label.slice(0, MAX_OPTION_LABEL), correct: false });
        continue;
      }
      const option = (rawOption ?? {}) as Record<string, unknown>;
      const label = String(option.label ?? option.text ?? "").trim();
      if (!label) continue;
      const imageFileId = option.image_file_id ? String(option.image_file_id) : null;
      if (imageFileId && !allowedImageFileIds.has(imageFileId)) {
        errors.push({ index, message: `Картинка варианта не принадлежит исходному элементу (${imageFileId.slice(0, 8)}…)` });
        return;
      }
      options.push({ label: label.slice(0, MAX_OPTION_LABEL), correct: Boolean(option.correct), image_file_id: imageFileId });
    }

    const hasImageOptions = options.some((option) => option.image_file_id);
    if (options.length > 0 && options.length < MIN_OPTIONS) {
      errors.push({ index, message: `Меньше ${MIN_OPTIONS} вариантов` });
      return;
    }
    if (options.length > MAX_OPTIONS) {
      errors.push({ index, message: `Больше ${MAX_OPTIONS} вариантов` });
      return;
    }
    if (options.length > 0 && !hasImageOptions && !options.some((option) => option.correct)) {
      // Закрытый вопрос без единого верного варианта: модератор мог забыть отметить.
      errors.push({ index, message: "Ни один вариант не помечен верным" });
      return;
    }
    if (options.length === 0 && !String(question.answer ?? "").trim()) {
      errors.push({ index, message: "Открытый вопрос без эталона ответа" });
      return;
    }

    questions.push({
      text,
      options,
      answer: String(question.answer ?? "").trim().slice(0, MAX_OPTION_LABEL) || null,
    });
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, questions };
}
