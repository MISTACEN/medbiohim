"use client";

import Link from "next/link";
import { BookOpen, Microscope, Search } from "lucide-react";
import type { ApiMaterial } from "@/lib/api";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { MaterialCard } from "@/components/materials/MaterialCard";
import { MaterialViewerModal } from "@/components/materials/MaterialViewerModal";
import { useMaterialsPage } from "@/components/materials/useMaterialsPage";

export default function MaterialsPage() {
  const page = useMaterialsPage();
  const { q, setQ, filter, setFilter, loading, note, noteIsError, active, setActive, load, visible, subjectNames } = page;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Материалы</h1>
          <p className="page-subtitle">
            Документы и конспекты превращаются в страницы сайта. Оригинал остаётся доступным отдельно.
            Фотографии микропрепаратов удобнее смотреть в атласе — там только препараты, без схем и методичек.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/atlas"
            className="btn-pill inline-flex items-center gap-1.5 text-sm font-semibold"
          >
            <Microscope className="h-4 w-4" /> Атлас микропрепаратов
          </Link>
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void load(); }} placeholder="Поиск по материалам…" className="w-64 rounded-pill border border-slate-200 bg-white/90 py-2 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/25" />
          </label>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-pill border border-slate-200 bg-white/90 px-4 py-2 text-sm outline-none">
            <option value="all">Все предметы</option>
            {subjectNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      </div>

      {note && noteIsError ? (
        <ErrorState title="Материалы не загрузились" message={note} retry={() => void load()} />
      ) : note ? (
        <div className="card p-4 text-sm" style={{ color: "var(--text)" }}>{note}</div>
      ) : null}

      {loading ? <SkeletonCards count={6} /> : visible.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Материалы пока не загружены"
          description="После импорта пакета документы появятся здесь уже как страницы сайта."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((m: ApiMaterial) => (
            <MaterialCard key={m.id} material={m} onRead={setActive} />
          ))}
        </div>
      )}

      {active && <MaterialViewerModal material={active} onClose={() => setActive(null)} />}
    </div>
  );
}
