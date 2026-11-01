"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { useLectureProgress } from "@/hooks/useLectureProgress";

export type NavBlock = { title: string; questionIds: string[] };

type ListProps = {
  blocks: NavBlock[];
  activeIndex: number;
  onSelect: (index: number) => void;
  solvedIds: Set<string>;
  compact?: boolean;
};

function BlockList({ blocks, activeIndex, onSelect, solvedIds, compact }: ListProps) {
  return (
    <ol className={compact ? "space-y-0.5" : "space-y-1"}>
      {blocks.map((block, index) => {
        const total = block.questionIds.length;
        const solved = block.questionIds.filter((id) => solvedIds.has(String(id))).length;
        const active = index === activeIndex;
        const done = total > 0 && solved >= total;
        return (
          <li key={`${block.title}-${index}`}>
            <button
              type="button"
              onClick={() => onSelect(index)}
              aria-current={active ? "true" : undefined}
              className={
                "w-full rounded-xl border-l-[3px] px-3 text-left text-sm transition " +
                (compact ? "py-1.5 " : "py-2 ") +
                (active ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-transparent hover:bg-slate-50")
              }
            >
              <span className="flex items-start gap-2">
                <span className={"mt-0.5 w-4 shrink-0 text-xs font-bold " + (active ? "text-[var(--primary)]" : "text-[var(--muted)]")}>
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={"block leading-snug " + (active ? "font-bold" : "font-medium")}>{block.title}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--muted)]">
                    {total > 0 ? (
                      <>
                        {done ? <CheckCircle2 className="size-3 shrink-0 text-[var(--status-ok-fg)]" /> : null}
                        <span className="whitespace-nowrap">Решено задач: {solved} из {total}</span>
                      </>
                    ) : (
                      "Только теория"
                    )}
                  </span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Оглавление занятия: переключает только блоки (подтемы) внутри лекции.
 *  На телефоне свёрнуто в одну строку, на десктопе — постоянная колонка. */
export function LectureBlocksNav({
  blocks,
  activeIndex,
  onSelect,
  lectureId,
  lessonTitle,
  moduleTitle,
}: {
  blocks: NavBlock[];
  activeIndex: number;
  onSelect: (index: number) => void;
  lectureId: string;
  lessonTitle?: string;
  moduleTitle?: string;
}) {
  const progress = useLectureProgress();
  const solvedIds = new Set((progress[lectureId] ?? []).map(String));
  const [open, setOpen] = useState(false);
  const active = blocks[activeIndex];

  const header = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Содержание занятия</div>
        <h2 className="mt-0.5 text-sm font-extrabold leading-snug">{lessonTitle || "Лекция"}</h2>
        {moduleTitle ? <p className="mt-0.5 text-[11px] text-[var(--muted)]">{moduleTitle}</p> : null}
      </div>
      <span className="shrink-0 rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--primary)]">
        {blocks.length} блоков
      </span>
    </div>
  );

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      {/* Телефон: компактное раскрывающееся оглавление — контент остаётся первым. */}
      <details
        open={open}
        onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
        className="card overflow-hidden p-0 lg:hidden"
      >
        <summary className="flex list-none cursor-pointer items-center justify-between gap-3 px-4 py-3">
          <span className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
              Блок {activeIndex + 1} из {blocks.length}
            </span>
            <span className="mt-0.5 block truncate text-sm font-bold">{active?.title || "Содержание"}</span>
          </span>
          <ChevronDown className={"size-4 shrink-0 text-[var(--muted)] transition " + (open ? "rotate-180" : "")} />
        </summary>
        <div className="max-h-[60vh] overflow-y-auto border-t border-[var(--border)] p-2">
          <BlockList
            compact
            blocks={blocks}
            activeIndex={activeIndex}
            solvedIds={solvedIds}
            onSelect={(index) => {
              onSelect(index);
              setOpen(false);
            }}
          />
        </div>
      </details>

      {/* Десктоп: постоянная колонка со всеми блоками. */}
      <div className="card hidden p-4 lg:block">
        {header}
        <div className="mt-3">
          <BlockList blocks={blocks} activeIndex={activeIndex} solvedIds={solvedIds} onSelect={onSelect} />
        </div>
      </div>
    </aside>
  );
}
