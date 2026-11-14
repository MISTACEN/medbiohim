"use client";

/**
 * Блок «Источники» под ответом тьютора (Фаза 2 дорожной карты):
 * каждая сноска [N] из ответа — ссылка на лекцию, из которой взят фрагмент.
 * Принимает и новый формат {n,title,lecture_id}, и старые строки-названия.
 */
import Link from "next/link";
import { BookOpen } from "lucide-react";
import type { AiSource } from "@/lib/features-api";

export function normalizeSources(sources: unknown): AiSource[] {
  if (!Array.isArray(sources)) return [];
  const out: AiSource[] = [];
  sources.forEach((entry, index) => {
    if (typeof entry === "string") {
      const title = entry.trim();
      if (title) out.push({ n: index + 1, title, lecture_id: null });
      return;
    }
    if (entry && typeof entry === "object") {
      const row = entry as Record<string, unknown>;
      const title = String(row.title ?? "").trim();
      if (!title) return;
      out.push({
        n: Number(row.n) > 0 ? Number(row.n) : index + 1,
        title,
        lecture_id: row.lecture_id ? String(row.lecture_id) : null,
      });
    }
  });
  return out;
}

export function AnswerSources({
  sources,
  className = "",
}: {
  sources?: unknown;
  className?: string;
}) {
  const list = normalizeSources(sources);
  if (!list.length) return null;
  return (
    <div className={"mt-2 border-t border-dashed border-[var(--border)] pt-2 " + className}>
      <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        <BookOpen className="h-3 w-3" /> Источники
      </p>
      <ol className="mt-1 space-y-0.5">
        {list.map((source) => (
          <li key={`${source.n}-${source.title}`} className="text-[11px] leading-4 text-[var(--muted)]">
            <span className="font-semibold">[{source.n}]</span>{" "}
            {source.lecture_id ? (
              <Link href={`/lectures/${encodeURIComponent(source.lecture_id)}`} className="font-semibold text-[var(--primary)] hover:underline">
                {source.title}
              </Link>
            ) : (
              source.title
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
