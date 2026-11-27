/**
 * Свободный ответ: что считать верным и что показать в разборе.
 *
 * Части «назови объект» можно отвечать словами. Сначала сравниваем правила
 * (`grading-text.ts`), и только если они не совпали — один запрос к ИИ. ИИ
 * никогда не вызывается для вариантов ответа и не перебивает точное совпадение,
 * поэтому проверка остаётся дешёвой и предсказуемой.
 */
import { aiCompareAnswer } from "./ai-grade";
import { compareAnswer } from "./grading-text";
import type { AnswerKey, Question } from "./types";

export type TextOutcome = {
  /** Что ввёл студент (обрезано до 300 символов). */
  input: string;
  /** Эталон, с которым сравнивали. */
  target: string;
  verdict: "correct" | "incorrect" | "unsure";
  confidence: number;
  source: "exact" | "contains" | "fuzzy" | "ai" | "none";
  reason?: string;
};

export type TextEnv = {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  AI_TEXT_GRADING?: string;
};

export async function judgeTextAnswers(input: {
  question: Question;
  answers: AnswerKey;
  submittedText: Record<string, string>;
  env: TextEnv;
}): Promise<{ verdicts: Record<string, boolean>; outcomes: Record<string, TextOutcome> }> {
  const verdicts: Record<string, boolean> = {};
  const outcomes: Record<string, TextOutcome> = {};
  let aiUsed = false;

  for (const [partId, raw] of Object.entries(input.submittedText)) {
    const part = input.question.parts.find((entry) => entry.id === partId);
    const key = input.answers.parts[partId];
    // Свободный ввод имеет смысл только там, где ответ — название объекта.
    // У multi-частей ответ остаётся набором вариантов.
    if (!part || !key || part.kind !== "single") continue;

    const targets = key.correct
      .map((id) => part.options.find((option) => option.id === id)?.label || "")
      .filter(Boolean);
    if (!targets.length) continue;

    const answer = String(raw ?? "").slice(0, 300).trim();
    let grade = compareAnswer(answer, targets);
    let source: TextOutcome["source"] = grade.source;
    let reason = grade.reason;

    if (grade.verdict !== "correct" && answer && !aiUsed) {
      const ai = await aiCompareAnswer({
        answer,
        target: targets[0],
        prompt: part.title,
        env: input.env,
      });
      // Одна попытка ИИ на ответ: в сложном задании несколько текстовых частей,
      // но платить за каждую не нужно — правила уже отработали.
      aiUsed = true;
      if (ai) {
        source = "ai";
        reason = ai.reason;
        // «Частично верно» не зачитываем: название препарата либо то, либо нет.
        // Такой ответ остаётся сомнительным и виден в разборе с пояснением ИИ.
        grade = {
          verdict: ai.verdict === "partial" ? "unsure" : ai.verdict,
          confidence: ai.confidence,
          source: "none",
        };
      }
    }

    const verdict: TextOutcome["verdict"] =
      grade.verdict === "correct" ? "correct" : grade.verdict === "unsure" ? "unsure" : "incorrect";
    verdicts[partId] = verdict === "correct";
    outcomes[partId] = {
      input: answer,
      target: targets[0],
      verdict,
      confidence: grade.confidence,
      source,
      ...(reason ? { reason } : {}),
    };
  }

  return { verdicts, outcomes };
}
