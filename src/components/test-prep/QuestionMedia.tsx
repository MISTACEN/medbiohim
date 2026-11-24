"use client";

/**
 * Рисунки к вопросу в прохождении теста и в банке.
 *
 * Структурные формулы сборника нельзя набрать строкой: они нарезаны в WebP и
 * приходят полем `media`. Компонент намеренно необязательный — если рисунков
 * нет или поле не пришло, он ничего не рендерит и не ломает карточку.
 */

import Image from "next/image";

export type QuestionMediaItem = {
  url?: string;
  kind?: string;
  width?: number;
  height?: number;
  label?: string;
  alt?: string;
};

export function QuestionMedia({ media, className }: { media?: QuestionMediaItem[] | null; className?: string }) {
  const items = (Array.isArray(media) ? media : []).filter((item) => item && String(item.url || "").trim());
  if (!items.length) return null;

  return (
    <div className={className || "space-y-2"}>
      {items.map((item, index) => (
        <figure key={index} className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          <Image
            src={String(item.url)}
            alt={String(item.alt || item.label || "Рисунок к вопросу")}
            width={Number(item.width) || 1000}
            height={Number(item.height) || 700}
            className="h-auto w-full"
            sizes="(max-width: 768px) 100vw, 720px"
          />
          {item.label ? (
            <figcaption className="border-t px-3 py-1.5 text-xs text-[var(--muted)]">{String(item.label)}</figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}
