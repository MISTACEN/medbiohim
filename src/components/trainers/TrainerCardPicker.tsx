"use client";

/** Экран выбора карточек тренажёра: группы по темам, фильтры и футер запуска. */
import Link from "next/link";
import { ArrowLeft, Check, ListChecks } from "lucide-react";
import { isElectronogramCard } from "@/lib/histologyOrder";
import { AtlasThumb } from "@/components/trainers/HistologyTrainerParts";
import type { TrainerFeedPageState } from "@/components/trainers/useTrainerFeedPage";
import type { PickFilter } from "@/components/trainers/model";

export function TrainerCardPicker({ page }: { page: TrainerFeedPageState }) {
  const {
    allCards, prepCount, emCount, pickFilter, setPickFilter, pickerGroups,
    picked, toggleCard, toggleGroup, pickedCount, startAll, startPicked,
  } = page;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-4 pb-32 sm:px-6">
        <header className="flex items-center justify-between gap-3 py-3">
          <Link href="/subjects" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/15"><ArrowLeft className="h-4 w-4" /> Предметы</Link>
          <div className="text-center"><div className="text-xs uppercase tracking-[0.2em] text-white/50">Гистология · МБХ</div><div className="mt-1 text-sm font-semibold">Выбор карточек</div></div>
          <div className="w-[92px]" />
        </header>

        <p className="mt-2 text-sm text-white/60">Отметь конкретные препараты и электронограммы для тренировки — или жми «Все подряд». Карточки сгруппированы по темам занятий.</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {([["all", `Все · ${allCards.length}`], ["preparation", `Препараты · ${prepCount}`], ["electronogram", `Электронограммы · ${emCount}`]] as [PickFilter, string][]).map(([f, label]) => (
            <button key={f} type="button" onClick={() => setPickFilter(f)} className={"rounded-xl border px-4 py-2 text-sm font-semibold transition " + (pickFilter === f ? "border-indigo-400 bg-indigo-500/20 text-indigo-200" : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10")}>{label}</button>
          ))}
        </div>

        <div className="mt-5 space-y-6">
          {pickerGroups.map(({ title, items }) => {
            const allOn = items.every((c) => picked[c.id]);
            const someOn = items.some((c) => picked[c.id]);
            return (
              <section key={title}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-white/90">{title} <span className="ml-1 font-normal text-white/40">· {items.length}</span></h2>
                  <button type="button" onClick={() => toggleGroup(items)} className={"inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition " + (allOn ? "border-indigo-400 bg-indigo-500/20 text-indigo-200" : "border-white/15 text-white/60 hover:bg-white/10")}>
                    <ListChecks className="h-3.5 w-3.5" />{allOn ? "Снять тему" : someOn ? "Выбрать всю тему" : "Выбрать всю тему"}
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {items.map((c) => {
                    const on = !!picked[c.id];
                    const em = isElectronogramCard(c);
                    return (
                      <button key={c.id} type="button" onClick={() => toggleCard(c.id)} className={"relative overflow-hidden rounded-xl border text-left transition " + (on ? "border-indigo-400 ring-2 ring-indigo-400/60" : "border-white/10 hover:border-white/30")}>
                        <div className="aspect-square bg-slate-800"><AtlasThumb id={String(c.id)} /></div>
                        <div className="bg-slate-900 p-2 text-xs font-medium text-white/90 line-clamp-2">{c.preparation?.name || "Препарат"}</div>
                        <span className={"absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur " + (em ? "bg-violet-500/70 text-white" : "bg-black/55 text-white/85")}>{em ? "ЭМ" : "Препарат"}</span>
                        {on && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-white shadow"><Check className="h-4 w-4" /></span>}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="text-sm text-white/70">Выбрано: <b className="text-white">{pickedCount}</b></div>
          <div className="flex gap-2">
            <button type="button" onClick={startAll} className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/10">Все подряд ({allCards.length})</button>
            <button type="button" disabled={pickedCount === 0} onClick={startPicked} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-40">Начать ({pickedCount})</button>
          </div>
        </div>
      </div>
    </div>
  );
}
