"use client";

/** Экран прохода: изображение препарата, варианты ответа и разбор. */
import { ArrowLeft, CheckCircle2, ChevronRight, CircleHelp, RotateCcw, SkipForward } from "lucide-react";
import { ImageLightbox } from "@/components/media/ImageLightbox";
import type { TrainerFeedPageState } from "@/components/trainers/useTrainerFeedPage";

export function TrainerCardRunner({ page, imageUrl, imageLoading }: {
  page: TrainerFeedPageState;
  imageUrl: string | null;
  imageLoading: boolean;
}) {
  const {
    queue, index, card, selected, result, busy, answered, note,
    backToPicker, restartRun, choose, skip, next,
  } = page;

  return (
    <div className="fixed inset-0 z-40 bg-slate-950 text-white">
      <div className="mx-auto flex h-full max-w-5xl flex-col">
        <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button type="button" onClick={backToPicker} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/15"><ArrowLeft className="h-4 w-4" /> Выбор</button>
          <div className="text-center"><div className="text-xs uppercase tracking-[0.2em] text-white/50">Гистология · МБХ</div><div className="mt-1 text-sm font-semibold">{index + 1} / {queue!.length}</div></div>
          <button type="button" onClick={restartRun} className="rounded-xl bg-white/10 p-2 hover:bg-white/15" aria-label="Начать сначала"><RotateCcw className="h-4 w-4" /></button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="overflow-hidden rounded-3xl bg-white shadow-2xl">
              <div className="relative aspect-[4/3] bg-slate-900">
                {imageUrl ? (
                  <ImageLightbox
                    src={imageUrl}
                    alt={card!.preparation?.name || "Препарат"}
                    title={card!.preparation?.name || "Препарат"}
                    caption={card!.mode_set === "electronogram" ? "Электронограмма" : "Микропрепарат"}
                    className="h-full w-full"
                    imageClassName="h-full w-full object-contain"
                  />
                ) : imageLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-white/60">Загружаем изображение…</div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/60">
                    <span>Изображение пока недоступно</span>
                    <span className="text-xs">Медиа-файл должен быть установлен в content/histology.</span>
                  </div>
                )}
                {/* Название препарата до ответа скрыто: вопрос «Что изображено?»
                    с показанным ответом теряет смысл. */}
                {answered && <div className="absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold backdrop-blur">{card!.mode_set === "electronogram" ? "Электронограмма" : "Препарат"}</div>}
                {answered ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-3 pb-2 pt-8">
                    <div className="text-sm font-bold text-white">{card!.preparation?.name || "Препарат"}</div>
                    {card!.preparation?.stain ? <div className="text-[11px] text-white/70">{card!.preparation.stain}</div> : null}
                  </div>
                ) : null}
              </div>
              <div className="p-5 text-slate-900 sm:p-7">
                {answered && <div className="text-xs font-semibold uppercase tracking-wider text-indigo-500">{card!.preparation?.name || "Препарат"}</div>}
                <h1 className="mt-2 text-xl font-extrabold sm:text-2xl">{card!.question?.prompt || "Что изображено?"}</h1>
                <div className="mt-5 grid gap-2">
                  {(card!.question?.options || []).map((option: { id: string; label: string; correct?: boolean }) => {
                    const active = selected === option.id;
                    const correct = result !== null && option.correct;
                    return <button key={option.id} type="button" disabled={busy || result !== null} onClick={() => void choose(option.id)} className={"rounded-2xl border px-4 py-3 text-left text-sm transition " + (correct ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : active && result === false ? "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]" : active ? "border-indigo-400 bg-indigo-50 text-indigo-800" : "border-slate-200 hover:bg-slate-50")}>{option.label}</button>;
                  })}
                </div>
                {result !== null && <div className={"mt-5 rounded-2xl p-4 text-sm " + (result ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]")}><div className="flex items-center gap-2 font-bold">{result ? <CheckCircle2 className="h-5 w-5" /> : <CircleHelp className="h-5 w-5" />}{result ? "Правильно" : "Неверно"}</div>{result ? (
                  <p className="mt-2">Эталон не показываем — ты ответил правильно.</p>
                ) : (
                  <>
                    <p className="mt-2">Показываем эталонный разбор.</p>
                    {card!.hotspots?.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{card!.hotspots.map((h: any, i: number) => <div key={String(h.id || i)} className="rounded-xl bg-white/70 p-2"><span className="font-semibold">{String(h.id || "")}</span><span className="ml-2">{String(h.label || h.title || "")}</span></div>)}</div>}
                    {card!.question?.explanation && <p className="mt-3 leading-6">{card!.question.explanation}</p>}
                  </>
                )}
                </div>}
                {result !== null && Array.isArray(card!.preparation?.captions) && card!.preparation.captions.length > 0 && (
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Подписи к препарату</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 leading-6">
                      {card!.preparation.captions.map((caption: unknown, i: number) => (
                        <li key={i}>{String(caption)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <button type="button" disabled={busy || result !== null} onClick={() => void skip()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"><SkipForward className="h-4 w-4" /> Пропустить</button>
                  {result !== null && <button type="button" onClick={next} className="btn-primary inline-flex items-center gap-2">Следующая <ChevronRight className="h-4 w-4" /></button>}
                </div>
              </div>
            </div>
            {note && <div className="mt-3 rounded-xl bg-[var(--status-critical-fg)]/10 p-3 text-sm text-[var(--status-critical-fg)]">{note}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
