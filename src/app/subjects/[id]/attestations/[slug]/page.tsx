"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, ArrowLeft, CalendarClock } from "lucide-react";
import { getAttestation } from "@/lib/api";
import type { Attestation } from "@/types/attestations";
import AttestationRunner from "@/components/attestations/AttestationRunner";

export default function AttestationPage() {
  const params = useParams<{ id: string; slug: string }>();
  const subject = params?.id || "";
  const slug = params?.slug || "";
  const [item, setItem] = useState<Attestation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!subject || !slug) return;
    setLoading(true);
    setError(null);
    getAttestation(subject, slug).then((result) => {
      if (!alive) return;
      setLoading(false);
      if (result.ok) setItem(result.data.item as Attestation);
      else if (result.error.code === "NOT_AVAILABLE") setError("Аттестация сейчас закрыта. Проверьте сроки проведения.");
      else if (result.error.code === "NOT_FOUND") setError("Аттестация не найдена или ещё не опубликована.");
      else setError(result.error.message || "Не удалось загрузить аттестацию.");
    });
    return () => {
      alive = false;
    };
  }, [subject, slug]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl animate-pulse space-y-4">
        <div className="h-4 w-32 rounded bg-slate-100" />
        <div className="h-52 rounded-[26px] border border-[var(--border)] bg-[var(--card)]" />
        <div className="grid gap-4 lg:grid-cols-[248px_minmax(0,1fr)]">
          <div className="h-64 rounded-2xl bg-slate-100/70" />
          <div className="space-y-3">
            <div className="h-28 rounded-2xl bg-slate-100/70" />
            <div className="h-28 rounded-2xl bg-slate-100/70" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="mt-4 font-serif text-2xl font-semibold">{error || "Аттестация недоступна"}</h1>
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-500">
          <CalendarClock className="h-4 w-4" /> Материалы появятся, когда преподаватель опубликует их.
        </p>
        <Link
          href={`/subjects/${subject}`}
          className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          <ArrowLeft className="h-4 w-4" /> Вернуться к предмету
        </Link>
      </div>
    );
  }

  return <AttestationRunner attestation={item} />;
}
