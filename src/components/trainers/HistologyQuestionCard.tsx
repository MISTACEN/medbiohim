"use client";

import type React from "react";

import { Check, SkipForward, X } from "lucide-react";

type Option = { id: string; label: string; correct?: boolean };
type CapSlot = { kind?: string; key?: string | null; label?: string };

export type HistologyQuestionProps = {
  a: {
    id: string;
    question_id: string;
    user_answer?: string | null;
    is_correct?: boolean | null;
    is_skipped?: boolean;
    options: Option[];
    question_snapshot: any;
    review_snapshot?: any;
  };
  i: number;
  total: number;
  compact?: boolean;
  labelMode?: string | null;
  contentType?: string | null;
  working?: boolean;
  ImageBox: (props: { id: string }) => React.ReactNode;
  onAnswer: (value: string | null, skip?: boolean) => void;
};

const formControlClass =
  "w-full rounded-xl border border-slate-200 !bg-white px-3 py-2 text-sm !text-slate-900 placeholder:text-slate-400 shadow-none outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-70";

export function HistologyQuestionCard({
  a,
  i,
  total,
  compact = false,
  labelMode,
  contentType,
  working = false,
  ImageBox,
  onAnswer,
}: HistologyQuestionProps) {
  const q = a.question_snapshot as any;
  const answeredNow = a.user_answer != null || a.is_skipped;
  const manual = labelMode === "manual";
  const tags = Array.isArray(q?.tags) ? q.tags.map(String) : [];
  const mode = String(q?.mode_set || q?.modeSet || "").toLowerCase();
  const isEm =
    contentType === "electronogram" ||
    mode.includes("electron") ||
    tags.some((t: string) => t.includes("electron") || t.includes("электронограм"));
  const reviewCaps = Array.isArray((a.review_snapshot as any)?.preparation?.captions)
    ? (a.review_snapshot as any).preparation.captions.map(String).filter(Boolean)
    : [];
  const snapCaps = Array.isArray(q?.preparation?.captions)
    ? q.preparation.captions.map(String).filter(Boolean)
    : [];
  const captions: string[] = snapCaps.length ? snapCaps : reviewCaps;
  // Подписи и название препарата — только после ответа: пользователь в тренажёре
  // отвечает сам (изучение с подписями — это «Атлас»). Старые сессии с
  // label_mode «with» больше не раскрывают подсказки до ответа.
  const showCaptions = answeredNow && captions.length > 0;
  const reviewPrep = (a.review_snapshot as any)?.preparation;
  const prepNameFromReview = reviewPrep?.name ? String(reviewPrep.name) : null;
  const prepNameFromCorrect = answeredNow
    ? (a.options.find((o) => o.correct)?.label || null)
    : null;
  const showPrepName = answeredNow
    ? (prepNameFromReview || prepNameFromCorrect || (q?.preparation?.name ? String(q.preparation.name) : null))
    : null;
  const prompt = isEm
    ? (q?.question?.prompt || "Что изображено на электронограмме?")
    : (q?.question?.prompt || "Что изображено?");

  const slots: CapSlot[] = Array.isArray(q?.preparation?.caption_slots)
    ? q.preparation.caption_slots
    : [];
  const hasSlots = isEm && manual && slots.length > 0;
  const answerDomId = "answer-" + a.id;

  const collectSlotAnswer = (): string => {
    if (!hasSlots) {
      const e = document.getElementById(answerDomId) as HTMLTextAreaElement | HTMLInputElement | null;
      return e?.value.trim() || "";
    }
    const lines: string[] = [];
    slots.forEach((slot, idx) => {
      const el = document.getElementById(`${answerDomId}-slot-${idx}`) as HTMLInputElement | null;
      const val = (el?.value || "").trim();
      if (!val) return;
      if (slot.kind === "num" && slot.key) lines.push(`${slot.key}. ${val}`);
      else if (slot.kind === "letter" && slot.key) lines.push(`${slot.key} — ${val}`);
      else lines.push(val);
    });
    return lines.join("\n");
  };

  return (
    <article className="histology-question-card overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="flex justify-between border-b bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <span>Вопрос {i + 1} / {total}</span>
        <span>
          {a.is_correct === true
            ? "Верно"
            : a.is_correct === false
              ? "Ошибка"
              : a.is_skipped
                ? "Пропущен"
                : "Не отвечен"}
        </span>
      </div>
      <div className="relative">
        <ImageBox id={a.question_id} />
        {showPrepName ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8">
            <div className="text-sm font-semibold text-white drop-shadow">{showPrepName}</div>
          </div>
        ) : null}
      </div>
      <div className={compact ? "p-4" : "p-5"}>
        {showPrepName ? (
          <div
            className={
              "mb-3 rounded-xl p-3 text-sm " +
              (answeredNow
                ? a.is_correct
                  ? "bg-emerald-50 text-emerald-900"
                  : "bg-indigo-50 text-indigo-900"
                : "bg-indigo-50")
            }
          >
            <b>Препарат:</b> {showPrepName}
          </div>
        ) : null}
        <h2 className="text-xl font-bold">{prompt}</h2>
        {isEm && !answeredNow ? (
          <p className="mt-1 text-sm text-slate-500">
            {manual
              ? hasSlots
                ? "Впишите текст каждой подписи в своё поле (номера уже заданы). Без нумерации — порядок не важен."
                : "Перечислите все подписи по памяти."
              : "Выберите название электронограммы. Подписи — после ответа."}
          </p>
        ) : null}
        {manual ? (
          hasSlots ? (
            <div className="mt-4 space-y-2">
              {slots.map((slot, idx) => {
                const prefix = slot.label || (slot.kind === "free" ? "•" : "");
                return (
                  <div key={idx} className="flex items-center gap-2">
                    {prefix ? (
                      <span className="w-12 shrink-0 text-sm font-semibold text-slate-600">{prefix}</span>
                    ) : null}
                    <input
                      id={`${answerDomId}-slot-${idx}`}
                      disabled={answeredNow}
                      placeholder="подпись…"
                      autoCapitalize="sentences"
                      autoCorrect="on"
                      spellCheck
                      className={formControlClass}
                    />
                  </div>
                );
              })}
              {!answeredNow && (
                <button onClick={() => void onAnswer(collectSlotAnswer() || null)} className="btn-primary mt-2">
                  Ответить
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4">
              <textarea
                disabled={answeredNow}
                defaultValue={a.user_answer || ""}
                id={answerDomId}
                placeholder={isEm ? "Подписи с новой строки" : "Введите ответ"}
                rows={isEm ? 5 : 1}
                className={formControlClass + " !min-h-[48px]"}
              />
              {!answeredNow && (
                <button
                  onClick={() => {
                    const e = document.getElementById(answerDomId) as HTMLTextAreaElement | null;
                    void onAnswer(e?.value.trim() || null);
                  }}
                  className="btn-primary mt-2"
                >
                  Ответить
                </button>
              )}
            </div>
          )
        ) : (
          <div className="mt-4 space-y-2">
            {a.options.map((o) => {
              const good = answeredNow && o.correct;
              const bad = answeredNow && a.user_answer === o.id && !o.correct;
              return (
                <button
                  key={o.id}
                  disabled={answeredNow || working}
                  onClick={() => void onAnswer(o.id)}
                  className={
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-left " +
                    (good
                      ? "border-emerald-400 bg-emerald-50"
                      : bad
                        ? "border-rose-400 bg-rose-50"
                        : "hover:bg-slate-50")
                  }
                >
                  {good ? <Check className="h-4 w-4" /> : bad ? <X className="h-4 w-4" /> : <span className="h-4 w-4 rounded-full border" />}
                  {o.label}
                </button>
              );
            })}
          </div>
        )}
        {!answeredNow && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button disabled={working} onClick={() => void onAnswer(null, true)} className="rounded-xl border px-3 py-2 text-sm">
              <SkipForward className="mr-1 inline h-4 w-4" />
              Пропустить
            </button>
            <button disabled={working} onClick={() => void onAnswer(null, true)} className="rounded-xl border px-3 py-2 text-sm text-slate-600">
              Я не знаю
            </button>
          </div>
        )}
        {showCaptions ? (
          <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3">
            <b className="text-sm text-indigo-900">Подписи (эталон)</b>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-800">
              {captions.map((c, idx) => (
                <li key={idx}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </article>
  );
}
