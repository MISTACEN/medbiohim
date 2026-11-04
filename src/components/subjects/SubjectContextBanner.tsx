"use client";

/**
 * Контекстная плашка «открыто из такого-то предмета».
 *
 * Читает query в браузере, а не через `useSearchParams`, чтобы её можно было
 * вставить в любую существующую страницу без Suspense-обвязки и без
 * превращения статической страницы в динамическую.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Compass } from "lucide-react";
import {
  resolveSubjectAreaKey,
  subjectAreaName,
  type SubjectAreaKey,
} from "@/lib/learning/modules";

export default function SubjectContextBanner() {
  const [state, setState] = useState<{ area: SubjectAreaKey | null; topic: string }>({
    area: null,
    topic: "",
  });

  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.search);
      const subject = params.get("subject") || "";
      const topic = params.get("topic") || "";
      setState({
        area: subject ? resolveSubjectAreaKey({ slug: subject, name: subject }) : null,
        topic,
      });
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  if (!state.area) return null;
  const area = subjectAreaName(state.area);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--primary-soft)] px-3 py-2 text-xs">
      <Compass className="h-4 w-4 shrink-0 text-[var(--primary)]" />
      <span>
        Открыто для предмета <b>{area}</b>
        {state.topic ? <> · тема «{state.topic}»</> : null}. Инструмент общий: прогресс сохраняется за вами,
        а не за дисциплиной.
      </span>
      <Link
        href={`/subjects?q=${encodeURIComponent(area)}`}
        className="ml-auto font-semibold text-[var(--primary)] hover:underline"
      >
        К предмету
      </Link>
    </div>
  );
}
