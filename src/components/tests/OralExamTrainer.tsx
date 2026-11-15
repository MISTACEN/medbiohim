"use client";

/**
 * Устный экзамен (roadmap 2.8): студент отвечает вслух, микрофон расшифровывает
 * ответ, ИИ-экзаменатор сравнивает его с эталоном банка и ставит балл 0-10
 * с уточняющим вопросом. Нет распознавания речи — остаётся поле «напишите ответ».
 */
import { useCallback, useRef, useState } from "react";
import { ArrowRight, Mic, MicOff, Loader2, RotateCcw, Send } from "lucide-react";
import { aiOralEvaluate, type OralVerdict } from "@/lib/features-api";
import { createSpeechRecognition, speechSupported } from "@/lib/study/speech";
import { describeApiError } from "@/lib/errors";

export type OralQuestion = { text: string; answer?: string | null };

type VerdictState = { verdict: OralVerdict; question: string } | null;

const SCORE_COLORS = ["var(--status-critical-fg)", "var(--status-warn-fg)", "var(--status-ok-fg)"] as const;
function scoreColor(score: number): string {
  return score >= 7 ? SCORE_COLORS[2] : score >= 4 ? SCORE_COLORS[1] : SCORE_COLORS[0];
}

export function OralExamTrainer({ questions, subjectTitle }: { questions: OralQuestion[]; subjectTitle?: string | null }) {
  const [idx, setIdx] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState<VerdictState>(null);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition>>(null);
  const supported = speechSupported();
  const question = questions[idx];

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setInterim("");
  }, []);

  const startListening = useCallback(() => {
    if (listening) return;
    setSpeechError(null);
    const recognition = createSpeechRecognition({
      onTranscript: (final, interimText) => {
        if (final) setTranscript((current) => (current ? current + " " + final : final).replace(/\s+/g, " ").trim());
        setInterim(interimText);
      },
      onEnd: () => setListening(false),
      onError: (message) => { if (message) setSpeechError(message); },
    });
    if (!recognition) {
      setSpeechError("Браузер не поддерживает распознавание речи — напишите ответ текстом.");
      return;
    }
    recognitionRef.current = recognition;
    setListening(true);
    try { recognition.start(); } catch { /* повторный start() за один такт — Chrome бросает */ }
  }, [listening]);

  async function evaluate() {
    const answer = transcript.trim();
    if (!question || !answer || evaluating) return;
    stopListening();
    setEvaluating(true);
    setError(null);
    const response = await aiOralEvaluate({ question: question.text, reference: question.answer || undefined, answer });
    setEvaluating(false);
    if (!response.ok) {
      setError(describeApiError(response.error));
      return;
    }
    setResult({ verdict: response.data, question: question.text });
  }

  function next() {
    setResult(null);
    setTranscript("");
    setInterim("");
    setSpeechError(null);
    setIdx((current) => Math.min(current + 1, questions.length - 1));
  }

  if (!question) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">Вопрос {idx + 1} из {questions.length}</span>
        <span className="text-[var(--muted)]">{subjectTitle || ""}</span>
      </div>

      <section className="card p-5">
        <p className="text-lg font-bold leading-snug">{question.text}</p>
        <p className="mt-1.5 text-xs text-[var(--muted)]">Ответьте вслух, как на экзамене у кафедры. Оговорки распознавания не влияют на балл — экзаменатор оценивает смысл.</p>
      </section>

      {!result ? (
        <section className="card space-y-3 p-5">
          <textarea
            value={transcript + (interim ? (transcript ? " " : "") + interim : "")}
            onChange={(e) => { setTranscript(e.target.value); setInterim(""); }}
            rows={5}
            placeholder={supported ? "Нажмите на микрофон и отвечайте — текст появится здесь. Или напишите ответ вручную." : "Ваш браузер не поддерживает распознавание речи — напишите ответ текстом."}
            className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
          />
          <div className="flex flex-wrap items-center gap-2">
            {supported ? (
              <button
                type="button"
                onClick={() => (listening ? stopListening() : startListening())}
                className={"inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white " + (listening ? "bg-[var(--status-critical-fg)]" : "bg-[var(--primary)]")}
                aria-pressed={listening}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {listening ? "Закончить ответ" : "Говорить"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void evaluate()}
              disabled={evaluating || !transcript.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {evaluating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {evaluating ? "Экзаменатор слушает…" : "Сдать ответ на оценку"}
            </button>
            {transcript ? (
              <button type="button" onClick={() => { setTranscript(""); setInterim(""); }} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm font-semibold">
                <RotateCcw className="h-3.5 w-3.5" /> Заново
              </button>
            ) : null}
            {listening ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--status-critical-fg)]"><span className="h-2 w-2 animate-pulse rounded-full bg-[var(--status-critical-fg)]" /> идёт запись</span> : null}
          </div>
          {speechError ? <p className="text-sm text-[var(--status-critical-fg)]">{speechError}</p> : null}
          {error ? <p className="text-sm text-[var(--status-critical-fg)]">{error}</p> : null}
        </section>
      ) : (
        <section className="card space-y-3 p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border-2" style={{ borderColor: scoreColor(result.verdict.score) }}>
              <span className="text-2xl font-extrabold" style={{ color: scoreColor(result.verdict.score) }}>{result.verdict.score}</span>
              <span className="text-[10px] text-[var(--muted)]">из 10</span>
            </div>
            <p className="text-sm font-semibold leading-snug">{result.verdict.verdict || (result.verdict.score >= 7 ? "Принято." : "Ответ недостаточно полный.")}</p>
          </div>
          {result.verdict.missed.length ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Не названо</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                {result.verdict.missed.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          ) : null}
          {result.verdict.mistakes.length ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Ошибки</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                {result.verdict.mistakes.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          ) : null}
          {result.verdict.follow_up ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Уточняющий вопрос экзаменатора</p>
              <p className="mt-1 text-sm">{result.verdict.follow_up}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={next}
              disabled={idx >= questions.length - 1}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              Следующий вопрос <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => { setResult(null); setSpeechError(null); }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm font-semibold"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Ответить ещё раз
            </button>
          </div>
          {error ? <p className="text-sm text-[var(--status-critical-fg)]">{error}</p> : null}
        </section>
      )}
    </div>
  );
}
