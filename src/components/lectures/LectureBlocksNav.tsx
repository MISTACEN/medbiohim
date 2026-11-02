"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { useLectureProgress } from "@/hooks/useLectureProgress";

export type NavBlock = { title: string; questionIds: string[] };

type ItemProps = {
  block: NavBlock;
  index: number;
  active: boolean;
  solvedIds: Set<string>;
  onSelect: (index: number) => void;
  compact?: boolean;
};

/** Один пункт оглавления: номер, тема и счётчик решённых задач. */
function BlockItem({ block, index, active, solvedIds, onSelect, compact }: ItemProps) {
  const total = block.questionIds.length;
  const solved = block.questionIds.filter((id) => solvedIds.has(String(id))).length;
  const done = total > 0 && solved >= total;
  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      aria-current={active ? "true" : undefined}
      className={
        "flex w-full items-start gap-3 rounded-lg border-l-[3px] px-3 text-left text-sm transition " +
        (compact ? "py-2 " : "py-2.5 ") +
        (active
          ? "border-[var(--primary)] bg-[var(--card)] font-bold text-slate-900 shadow-sm"
          : "border-transparent text-slate-700 hover:bg-white/70")
      }
    >
      <span
        className={
          "mt-0.5 w-4 shrink-0 text-xs font-semibold tabular-nums " +
          (active ? "text-[var(--primary)]" : "text-[var(--muted)]")
        }
      >
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block leading-snug">{block.title}</span>
        <span className="mt-0.5 flex items-center gap-1 text-[11px] font-normal text-[var(--muted)]">
          {total > 0 ? (
            <>
              {done ? <CheckCircle2 className="size-3 shrink-0 text-[var(--status-ok-fg)]" /> : null}
              <span className="whitespace-nowrap">
                Решено задач: {solved} из {total}
              </span>
            </>
          ) : (
            "Только теория"
          )}
        </span>
      </span>
    </button>
  );
}

/** Оглавление занятия: переключает только блоки (подтемы) внутри лекции.
 *  Внешний вид повторяет референс: узкая колонка на светлой подложке, номера
 *  пунктов, счётчик решённых задач, активный пункт — белой карточкой.
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
  // Длинный список не разворачиваем целиком: пункты выше активного прячем
  // за «Показать предыдущие», как в референсе.
  const [showAll, setShowAll] = useState(false);
  const TRIM = 2;
  const hiddenCount = !showAll && activeIndex > TRIM ? activeIndex - TRIM : 0;
  const visible = useMemo(
    () => blocks.map((block, index) => ({ block, index })).slice(hiddenCount),
    [blocks, hiddenCount]
  );
  const active = blocks[activeIndex];

  return (
    <div className="lg:sticky lg:top-24 lg:self-start">
      {/* Телефон: компактное раскрывающееся оглавление — контент остаётся первым. */}
      <details
        open={open}
        onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
        className="border-b border-[var(--border)] lg:hidden"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
          <span className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
              Блок {activeIndex + 1} из {blocks.length}
            </span>
            <span className="mt-0.5 block truncate text-sm font-bold">{active?.title || "Содержание"}</span>
          </span>
          <ChevronDown className={"size-4 shrink-0 text-[var(--muted)] transition " + (open ? "rotate-180" : "")} />
        </summary>
        <nav className="max-h-[60vh] overflow-y-auto bg-slate-50/70 px-2 py-2" aria-label="Содержание занятия">
          <ol className="space-y-0.5">
            {blocks.map((block, index) => (
              <li key={`${block.title}-${index}`}>
                <BlockItem
                  compact
                  block={block}
                  index={index}
                  active={index === activeIndex}
                  solvedIds={solvedIds}
                  onSelect={(next) => {
                    onSelect(next);
                    setOpen(false);
                  }}
                />
              </li>
            ))}
          </ol>
        </nav>
      </details>

      {/* Десктоп: колонка со всеми блоками на светлой подложке. */}
      <div className="hidden border-r border-[var(--border)] bg-slate-50/70 p-3 lg:block">
        {lessonTitle ? (
          <p className="px-3 pb-2 pt-1 text-[11px] font-medium leading-snug text-[var(--muted)]">
            {moduleTitle ? `${moduleTitle} · ` : ""}
            {lessonTitle}
          </p>
        ) : null}
        {hiddenCount ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mb-1 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--muted)] transition hover:bg-white/70 hover:text-[var(--primary)]"
          >
            <span>Показать предыдущие ({hiddenCount})</span>
            <ChevronDown className="size-3.5" />
          </button>
        ) : null}
        <nav className="max-h-[calc(100vh-13rem)] overflow-y-auto" aria-label="Содержание занятия">
          <ol className="space-y-0.5">
            {visible.map(({ block, index }) => (
              <li key={`${block.title}-${index}`}>
                <BlockItem
                  block={block}
                  index={index}
                  active={index === activeIndex}
                  solvedIds={solvedIds}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </div>
  );
}
