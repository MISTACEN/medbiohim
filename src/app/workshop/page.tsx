"use client";

/**
 * Мастерская — общий пул студенческих материалов.
 *
 * Загрузка идёт «в один поток»: файлы грузятся по очереди, затем сервер
 * подсказывает тип, предмет и теги. Десять фото собираются в одну фотолекцию,
 * PDF с вопросами разбирается на отдельные вопросы на сервере.
 */
import Link from "next/link";
import { BookOpen, Check, History, Layers, Microscope, Plus, Search, ShieldCheck, X } from "lucide-react";
import LectureStudio from "@/components/workshop/LectureStudio";
import MyLibrary from "@/components/workshop/MyLibrary";
import QuestionBank from "@/components/workshop/QuestionBank";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { KIND_LABEL, STATUS_LABEL, formatDate } from "@/components/workshop/model";
import { WorkshopComposer } from "@/components/workshop/WorkshopComposer";
import { WorkshopDetail } from "@/components/workshop/WorkshopDetail";
import { useWorkshopPage } from "@/components/workshop/useWorkshopPage";

export default function WorkshopPage() {
  const page = useWorkshopPage();
  const {
    loggedIn, staff, settings, subjects, items, loading, note, error, tab, setTab,
    query, setQuery, subjectFilter, setSubjectFilter, kindFilter, setKindFilter,
    composer, setComposer, section, setSection, subjectName, openDetail, detail, dialog,
  } = page;

  if (!loggedIn) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">Мастерская</h1>
        <p className="page-subtitle">Войдите, чтобы делиться материалами</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Мастерская</h1>
          <p className="page-subtitle">Фотолекции, конспекты и вопросы от студентов — с версиями и модерацией</p>
          {/* Карточки-паки живут в своей вкладке карточек: сюда ведёт ссылка,
              чтобы не дублировать список в двух местах. */}
          <Link href="/cards?tab=workshop" className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)]">
            <Layers className="h-3.5 w-3.5" /> Карточки-паки в мастерской →
          </Link>
          {/* Свои снимки с микроскопа живут в практике предмета: здесь только
              вход, чтобы не дублировать загрузку и модерацию в двух местах. */}
          <Link href="/subjects/histology?tab=mine" className="ml-3 mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)]">
            <Microscope className="h-3.5 w-3.5" /> Свои препараты → атлас
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={"inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold " + (settings.moderation_mode === "manual" ? "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]" : "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]")}>
            {settings.moderation_mode === "manual" ? <ShieldCheck className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            {settings.moderation_mode === "manual" ? "Ручная проверка" : "Открытая публикация"}
          </span>
          {staff && <Link href="/admin/workshop" className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm font-semibold">Модерация</Link>}
          <button type="button" onClick={() => setComposer((value) => !value)} className="btn-primary inline-flex items-center gap-2 text-sm">
            {composer ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {composer ? "Закрыть" : "Загрузить материал"}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-1 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1">
        {([
          { id: "materials", label: "Материалы студентов" },
          { id: "lectures", label: staff ? "Занятия: все лекции" : "Мои занятия" },
          { id: "library", label: "Моя библиотека" },
          { id: "questions", label: "Мои вопросы" },
        ] as const).map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setSection(row.id)}
            aria-pressed={section === row.id}
            className={
              "rounded-xl px-3 py-1.5 text-sm font-semibold transition " +
              (section === row.id
                ? "bg-[var(--primary)] text-white"
                : "text-slate-600 hover:bg-slate-50")
            }
          >
            {row.label}
          </button>
        ))}
      </div>

      {note && <div className="rounded-xl bg-[var(--status-ok-bg)] p-3 text-sm text-[var(--status-ok-fg)]">{note}</div>}
      {error && <div className="rounded-xl bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}

      {section === "lectures" ? (
        <LectureStudio staff={staff} />
      ) : section === "library" ? (
        <MyLibrary />
      ) : section === "questions" ? (
        <QuestionBank />
      ) : (
        <>
          <WorkshopComposer page={page} />

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-[var(--border)] p-1">
              <button type="button" onClick={() => setTab("all")} className={"rounded-lg px-3 py-1.5 text-sm font-semibold " + (tab === "all" ? "bg-indigo-50 text-indigo-700" : "text-slate-500")}>Все материалы</button>
              <button type="button" onClick={() => setTab("mine")} className={"rounded-lg px-3 py-1.5 text-sm font-semibold " + (tab === "mine" ? "bg-indigo-50 text-indigo-700" : "text-slate-500")}>Мои</button>
            </div>
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по названию…" className="w-full rounded-xl border border-[var(--border)] py-2 pl-9 pr-3 text-sm" />
            </div>
            <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
              <option value="">Все предметы</option>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
            <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
              <option value="">Все типы</option>
              {Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          {loading ? <SkeletonList count={4} /> : items.length === 0 ? (
            <EmptyState
              icon={Layers}
              title={tab === "mine" ? "У вас пока нет материалов" : "Мастерская пуста"}
              description={tab === "mine" ? "Загрузите фото лекции или PDF — материал появится здесь." : "Станьте первым: поделитесь конспектом или вопросами."}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <article key={item.id} className="card flex flex-col gap-3 p-4">
                  <button type="button" onClick={() => void openDetail(item.id)} className="min-w-0 text-left">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">{KIND_LABEL[item.kind] || item.kind}</span>
                      {item.status !== "published" && <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--status-warn-fg)]">{STATUS_LABEL[item.status] || item.status}</span>}
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><History className="h-3 w-3" />v{item.version_no}</span>
                    </div>
                    <h2 className="line-clamp-2 font-bold leading-snug">{item.title}</h2>
                    <p className="mt-1 text-xs text-slate-500">{item.subject_name || (item.subject_id ? subjectName.get(item.subject_id) : "") || "Без предмета"}{item.topic ? ` · ${item.topic}` : ""}</p>
                  </button>
                  {!!item.tags?.length && (
                    <div className="flex flex-wrap gap-1">
                      {item.tags.slice(0, 5).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">#{tag}</span>)}
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2 text-xs text-slate-500">
                    <span className="truncate">{item.author_name || "Студент"} · {formatDate(item.created_at)}</span>
                    <button type="button" onClick={() => void openDetail(item.id)} className="inline-flex items-center gap-1 font-semibold text-indigo-600"><BookOpen className="h-3.5 w-3.5" />Открыть</button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {detail?.item && <WorkshopDetail page={page} />}
        </>
      )}
      {dialog}
    </div>
  );
}
