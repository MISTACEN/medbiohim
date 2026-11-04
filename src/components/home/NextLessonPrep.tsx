"use client";

/**
 * Блок «Подготовка к занятию» — связанный учебный сценарий для ближайшей
 * предстоящей пары на главной (полный продукт §1 «Карточка занятия»).
 *
 * Собирает вокруг занятия то, что уже существует в проекте:
 *  - лекцию предмета (совпадение по теме, иначе первая доступная);
 *  - материалы предмета (заголовки + количество);
 *  - тренажёр/препараты, тесты и экзаменационные вопросы — прямые ссылки
 *    на существующие вкладки страницы предмета.
 *
 * Принципы: только реальные данные API; пустые разделы честно скрываются;
 * сетевые сбои не ломают карточку занятия (блок не критичен, гаснет тихо).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Boxes, FlaskConical, HelpCircle, ChevronRight } from "lucide-react";
import { listLectures, listMaterials, getTrainerFeed } from "@/lib/api";

type SubjectRef = { id: string; name: string; slug: string };

type LectureRef = { id: string; title: string };
type MaterialRef = { id: string; title: string };
type TrainerRef = { total: number };

type Prep = {
  lecture: LectureRef | null;
  lectureMatched: boolean;
  materials: MaterialRef[];
  trainer: TrainerRef | null;
};

function str(row: unknown, ...keys: string[]): string {
  if (!row || typeof row !== "object") return "";
  const rec = row as Record<string, unknown>;
  for (const key of keys) {
    const value = rec[key];
    if (value == null || value === "") continue;
    return String(value);
  }
  return "";
}

/** Заголовок совпадает с темой занятия (нечувствительно к регистру и подстроке). */
function matchesTheme(title: string, theme: string): boolean {
  const t = theme.trim().toLowerCase();
  if (t.length < 5) return false;
  return title.toLowerCase().includes(t.slice(0, Math.max(12, Math.floor(t.length * 0.6))));
}

export function NextLessonPrep({ subject, theme }: { subject: SubjectRef; theme: string }) {
  const [prep, setPrep] = useState<Prep | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "hidden">("loading");

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setPrep(null);
    (async () => {
      const [lecturesRes, materialsRes, trainerRes] = await Promise.allSettled([
        listLectures(subject.id, { signal: controller.signal }),
        listMaterials({ subject_id: subject.id }, { signal: controller.signal }),
        subject.slug
          ? getTrainerFeed(subject.slug, "mbh", 1, 0)
          : Promise.resolve({ ok: false } as { ok: boolean; data?: { total?: number; items?: unknown[] } }),
      ]);
      if (controller.signal.aborted) return;

      // Лекции: ответы бывают {items:[]} и {lectures:[]} — нормализуем оба.
      let lecture: LectureRef | null = null;
      let lectureMatched = false;
      if (lecturesRes.status === "fulfilled" && lecturesRes.value?.ok) {
        const data = (lecturesRes.value.data ?? {}) as Record<string, unknown>;
        const raw = Array.isArray(data.items) ? data.items : Array.isArray(data.lectures) ? data.lectures : [];
        const list = raw
          .map((l: unknown) => ({ id: str(l, "id"), title: str(l, "title", "name") }))
          .filter((l) => l.id && l.title);
        lecture = list.find((l) => theme && matchesTheme(l.title, theme)) || null;
        lectureMatched = Boolean(lecture);
        if (!lecture) lecture = list[0] || null;
      }

      let materials: MaterialRef[] = [];
      if (materialsRes.status === "fulfilled" && materialsRes.value?.ok) {
        const data = (materialsRes.value.data ?? {}) as Record<string, unknown>;
        const raw = Array.isArray(data.items) ? data.items : Array.isArray(data.materials) ? data.materials : [];
        materials = raw
          .map((m: unknown) => ({ id: str(m, "id"), title: str(m, "title", "name") }))
          .filter((m) => m.id && m.title)
          .slice(0, 3);
      }

      let trainer: TrainerRef | null = null;
      if (trainerRes.status === "fulfilled" && trainerRes.value?.ok) {
        const data = (trainerRes.value.data ?? {}) as { total?: number; items?: unknown[] };
        const total = Number(data.total ?? (Array.isArray(data.items) ? data.items.length : 0));
        if (Number.isFinite(total) && total > 0) trainer = { total };
      }

      if (controller.signal.aborted) return;
      const empty = !lecture && !materials.length && !trainer;
      if (empty) {
        setState("hidden");
        return;
      }
      setPrep({ lecture, lectureMatched, materials, trainer });
      setState("ready");
    })().catch(() => {
      if (!controller.signal.aborted) setState("hidden");
    });
    return () => controller.abort();
  }, [subject.id, subject.slug, theme]);

  if (state === "hidden") return null;

  const subjectHref = `/subjects/${encodeURIComponent(subject.id)}`;

  return (
    <div className="mt-2 rounded-lg border border-slate-100 bg-white/70 p-2 dark:border-slate-800 dark:bg-slate-900/60">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Подготовка к занятию
        {state === "loading" ? <span className="ml-2 font-normal normal-case opacity-60">загрузка…</span> : null}
      </p>
      <ul className="mt-1 space-y-0.5">
        {prep?.lecture ? (
          <li>
            <Link
              href={`/lectures/${encodeURIComponent(prep.lecture.id)}`}
              className="flex items-start gap-1.5 rounded-lg px-1 py-1 text-xs text-slate-700 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-400 motion-reduce:transition-none"
            >
              <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
              <span className="min-w-0 break-words">
                {prep.lectureMatched ? "Лекция по теме: " : "Лекция предмета: "}
                {prep.lecture.title}
              </span>
            </Link>
          </li>
        ) : null}
        {prep?.materials.length ? (
          <li>
            <Link
              href={`${subjectHref}?tab=materials`}
              className="flex items-start gap-1.5 rounded-lg px-1 py-1 text-xs text-slate-700 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-400 motion-reduce:transition-none"
            >
              <Boxes className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
              <span className="min-w-0 break-words">
                Материалы: {prep.materials.map((m) => m.title).join(", ")}
              </span>
            </Link>
          </li>
        ) : null}
        {prep?.trainer ? (
          <li>
            <Link
              href={subject.slug ? `/trainers/feed/${encodeURIComponent(subject.slug)}` : `${subjectHref}?tab=trainers`}
              className="flex items-start gap-1.5 rounded-lg px-1 py-1 text-xs text-slate-700 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-400 motion-reduce:transition-none"
            >
              <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
              <span className="min-w-0 break-words">
                Препараты и отработка · {prep.trainer.total} карточек
              </span>
            </Link>
          </li>
        ) : null}
        <li>
          <Link
            href={`${subjectHref}?tab=exam`}
            className="flex items-start gap-1.5 rounded-lg px-1 py-1 text-xs text-slate-700 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-400 motion-reduce:transition-none"
          >
            <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
            <span className="min-w-0 break-words">Тесты и экзаменационные вопросы предмета</span>
            <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-slate-300 dark:text-slate-600" />
          </Link>
        </li>
      </ul>
    </div>
  );
}
