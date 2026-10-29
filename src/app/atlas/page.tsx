"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BookOpenCheck, FolderOpen, GraduationCap, Loader2, LogIn, Microscope } from "lucide-react";
import { HistologyAtlas } from "@/components/trainers/HistologyAtlas";
import { useAuth } from "@/components/auth/AuthProvider";

function AtlasPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const card = params.get("card") || "";
  const lesson = params.get("lesson") || "";

  function train(ids: string[], selectedLesson: string, kind: string) {
    const search = new URLSearchParams();
    // Короткий список передаём поимённо, длинный — темой или всем набором
    // выбранного типа: ссылка не должна вырастать до нескольких килобайт.
    if (selectedLesson) search.set("topic", selectedLesson);
    else if (ids.length && ids.length <= 30) search.set("cards", ids.join(","));
    else {
      search.set("all", "1");
      if (kind !== "all") search.set("kind", kind);
    }
    router.push("/trainers/feed/histology?" + search.toString());
  }

  if (authLoading) {
    return (
      <div className="card flex items-center gap-2 p-8 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Загружаем атлас…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <Microscope className="mx-auto h-9 w-9 text-indigo-300" />
        <p className="mt-3 font-semibold text-slate-800">Войдите, чтобы открыть атлас препаратов.</p>
        <p className="mt-1 text-sm text-slate-500">Фотографии микропрепаратов доступны только своим.</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex items-center gap-2">
          <LogIn className="h-4 w-4" /> Войти
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <Microscope className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Практика · препараты</p>
              <h1 className="mt-1 text-2xl font-extrabold text-slate-950 sm:text-3xl">Атлас микропрепаратов</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                Здесь только то, что смотрят под микроскопом: микропрепараты и электронограммы, сгруппированные по занятиям.
                Схемы, методички, тесты и учебники — в «Материалах», чтобы атлас оставался атласом.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Link
              href="/trainers/feed/histology"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2 font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              <GraduationCap className="h-4 w-4" /> Тренажёр
            </Link>
            <Link
              href="/subjects/histology?tab=materials"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FolderOpen className="h-4 w-4" /> Материалы
            </Link>
            <Link
              href="/practice"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
            >
              <BookOpenCheck className="h-4 w-4" /> База вопросов
            </Link>
          </div>
        </div>

        <div className="mt-4 grid gap-2 border-t border-indigo-100 pt-4 text-xs text-slate-600 sm:grid-cols-3">
          <div className="rounded-xl bg-white/80 px-3 py-2">
            <b className="text-slate-900">Атлас</b> — препараты и электронограммы, которые спрашивают на занятии.
          </div>
          <div className="rounded-xl bg-white/80 px-3 py-2">
            <b className="text-slate-900">Материалы</b> — всё остальное: схемы, методички, тесты, учебники.
          </div>
          <div className="rounded-xl bg-white/80 px-3 py-2">
            <b className="text-slate-900">Тренажёр</b> — проверка по тем же карточкам, атлас открывается рядом.
          </div>
        </div>

        <Link
          href="/trainers/feed/histology"
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-700 hover:underline"
        >
          Перейти к тренажёру <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      <HistologyAtlas
        focusCardId={card || undefined}
        initialLesson={lesson}
        onTrain={({ ids, lesson: selectedLesson, kind }) => train(ids, selectedLesson, kind)}
      />
    </div>
  );
}

export default function AtlasPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[var(--muted)]">Загружаем атлас…</div>}>
      <AtlasPageInner />
    </Suspense>
  );
}
