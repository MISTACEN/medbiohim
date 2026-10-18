"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, GraduationCap } from "lucide-react";
import PhysiologyColloquium from "@/components/physiology/PhysiologyColloquium";
import { useAuth } from "@/components/auth/AuthProvider";
import { getSubject, listSubjectsCatalog } from "@/lib/api";
import { resolveSubjectSlug } from "@/lib/subjectSlug";

/**
 * Temporary slim subject page for physiology colloquium rollout.
 * Full tabs return after merging page.colloquium.patch onto main page.tsx.
 */
export default function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { loading: authLoading } = useAuth();
  const [subject, setSubject] = useState<{ id?: string; name?: string; slug?: string } | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [tab, setTab] = useState<"home" | "colloquium">("home");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return () => { cancelled = true; };
    (async () => {
      try {
        const p = await params;
        if (cancelled) return;
        setSubjectId(p.id);
        const [cat, r] = await Promise.all([listSubjectsCatalog(), getSubject(p.id)]);
        const hit = cat.ok
          ? cat.data.items.find((x: any) => x.id === p.id || x.slug === p.id) ||
            cat.data.items.find((x: any) => x.name.toLowerCase() === decodeURIComponent(p.id).toLowerCase())
          : null;
        if (!r.ok && !hit) {
          setError(r.error?.message || "Не найден");
          setLoading(false);
          return;
        }
        const responseData: any = r.ok ? r.data : null;
        const subjectPayload = responseData?.subject || responseData?.item || (responseData?.id ? responseData : null);
        const s: any = { ...(hit || {}), ...(subjectPayload || {}) };
        setSubject(s);
      } catch {
        if (!cancelled) setError("Не удалось загрузить предмет");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params, authLoading]);

  const slug = resolveSubjectSlug(subject?.slug || "", subject?.name) || resolveSubjectSlug(subjectId, subject?.name);
  const physiology = slug === "physiology" || /физиолог/i.test(subject?.name || "");

  if (loading) return <div className="card p-6 text-sm text-slate-500">Загрузка…</div>;
  if (error && !subject) return <div className="card p-6 text-sm text-rose-600">{error}</div>;

  return (
    <div className="space-y-6">
      <Link href="/subjects" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ChevronLeft className="h-4 w-4" />К предметам
      </Link>
      <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">Предмет</p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{subject?.name || "—"}</h1>
        <p className="mt-2 text-sm text-amber-800">
          Временная страница ветки коллоквиума. Полные вкладки (план, тесты, билеты) — после merge патча page.colloquium.patch на main page.tsx.
        </p>
      </header>
      {physiology && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setTab("home")} className={"rounded-xl px-3 py-2 text-sm font-semibold " + (tab === "home" ? "bg-indigo-600 text-white" : "bg-slate-100")}>
            Обзор
          </button>
          <button type="button" onClick={() => setTab("colloquium")} className={"inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold " + (tab === "colloquium" ? "bg-indigo-600 text-white" : "bg-slate-100")}>
            <GraduationCap className="h-4 w-4" /> Коллоквиум
          </button>
        </div>
      )}
      {tab === "colloquium" && physiology ? (
        <PhysiologyColloquium />
      ) : (
        <section className="card space-y-3 p-5">
          <h2 className="text-lg font-bold">Физиология</h2>
          <p className="text-sm text-slate-600">
            Открой вкладку <b>Коллоквиум</b> — 7 модулей с ответами и пояснениями к итоговому занятию по возбудимым системам.
          </p>
          {physiology && (
            <button type="button" onClick={() => setTab("colloquium")} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
              Перейти к коллоквиуму
            </button>
          )}
        </section>
      )}
    </div>
  );
}
