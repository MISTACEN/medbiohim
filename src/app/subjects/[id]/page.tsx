"use client";

/**
 * Страница «Предмет + Курс + Семестр».
 * Блоки: план, билеты, практика, лекции, материалы, SRS, прогресс.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Brain,
  ChevronLeft,
  FileQuestion,
  FolderOpen,
  GraduationCap,
  ListChecks,
  TrendingUp,
} from "lucide-react";
import {
  getSubject,
  getSubjectPlan,
  getSubjectGradebook,
  listSubjectsCatalog,
  type SubjectPlan,
  type SubjectPlanWeek,
} from "@/lib/api";
import { resolveSubjectSlug, ticketBankAvailable } from "@/lib/subjectSlug";

type Subject = {
  id: string;
  name: string;
  course_number?: number | null;
  semester?: number | null;
  control_type?: string | null;
  total_hours?: number | null;
  credits?: number | null;
};
type Topic = { id?: string; title?: string };
type Module = { id?: string; title?: string; topics?: Topic[] };
type BlockId = "plan" | "tickets" | "practice" | "lectures" | "materials" | "cards" | "progress";

const BLOCKS: Array<{ id: BlockId; label: string; icon: typeof BookOpen }> = [
  { id: "plan", label: "Учебный план", icon: GraduationCap },
  { id: "tickets", label: "Билеты", icon: FileQuestion },
  { id: "practice", label: "Практика", icon: ListChecks },
  { id: "lectures", label: "Лекции", icon: BookOpen },
  { id: "materials", label: "Материалы", icon: FolderOpen },
  { id: "cards", label: "Карточки SRS", icon: Brain },
  { id: "progress", label: "Прогресс", icon: TrendingUp },
];

const SLUG_BY_NAME: Record<string, string> = {
  "органическая и физическая химия": "organic_chemistry",
  физиология: "physiology",
  "гистология, цитология": "histology",
  гистология: "histology",
};

function semesterLabel(s?: number | null) {
  if (s == null) return "семестр";
  return s % 2 === 1 ? `Осенний · ${s}` : `Весенний · ${s}`;
}

export default function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [plan, setPlan] = useState<SubjectPlan | null>(null);
  const [gradebook, setGradebook] = useState<Array<{display_name:string;hours?:number|null;credits?:number|null;control_form?:string|null;hours_scope?:string;source_note?:string|null}>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [block, setBlock] = useState<BlockId>("plan");
  const [subjectId, setSubjectId] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await params;
      if (cancelled) return;
      setSubjectId(p.id);
      try {
        const cat = await listSubjectsCatalog();
        if (cat.ok) {
          const byId = cat.data.items.find((x) => x.id === p.id || x.slug === p.id);
          const byName = cat.data.items.find(
            (x) => x.name.toLowerCase() === decodeURIComponent(p.id).toLowerCase()
          );
          const hit = byId || byName;
          if (hit) {
            setSubject({
              id: hit.id,
              name: hit.name,
              course_number: hit.course_number ?? null,
              semester: hit.semester ?? null,
              control_type: hit.control_type || null,
            });
            const slug = hit.slug || SLUG_BY_NAME[hit.name.toLowerCase()];
            if (slug) {
              const pr = await getSubjectPlan(slug);
              if (pr.ok) setPlan(pr.data.plan);
            }
          }
        }
        const r = await getSubject(p.id);
        if (cancelled) return;
        if (r.ok) {
          const s = r.data.subject as Subject;
          setSubject((prev) => (prev ? { ...prev, ...s } : s));
          setModules(Array.isArray(r.data.modules) ? (r.data.modules as Module[]) : []);
          const gb = await getSubjectGradebook(s.id);
          if (!cancelled && gb.ok) setGradebook(gb.data.items || []);
          const slug =
            SLUG_BY_NAME[(s.name || "").toLowerCase()] ||
            (s.name || "").toLowerCase().replace(/\s+/g, "_");
          const pr = await getSubjectPlan(slug);
          if (pr.ok) setPlan(pr.data.plan);
        } else if (!subject) {
          setError(r.error.message);
        }
      } catch {
        if (!cancelled) setError("Не удалось загрузить предмет");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const course = subject?.course_number ?? 2;
  const semester = subject?.semester ?? 3;
  const subjectSlug = resolveSubjectSlug(subjectId || subject?.id, subject?.name);
  const q = useMemo(
    () =>
      new URLSearchParams({
        subject: subjectId || subject?.id || "",
        subject_slug: subjectSlug,
        course: String(course),
        semester: String(semester),
      }).toString(),
    [subjectId, subject?.id, subjectSlug, course, semester]
  );

  return (
    <div className="space-y-6">
      <Link href="/subjects" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ChevronLeft className="h-4 w-4" />К предметам
      </Link>

      {loading ? (
        <div className="card p-6 text-sm text-slate-500">Загрузка предмета…</div>
      ) : error && !subject ? (
        <div className="card p-6 text-sm text-rose-600">{error}</div>
      ) : subject ? (
        <>
          <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">
              Предмет · Курс · Семестр
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              {subject.name}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {course} курс · {semesterLabel(semester)}
              {subject.control_type
                ? ` · ${
                    subject.control_type === "exam"
                      ? "Экзамен"
                      : subject.control_type === "credit"
                        ? "Зачёт"
                        : subject.control_type
                  }`
                : ""}
            </p>
          </header>

          <section className="card border-indigo-100 bg-indigo-50/40 p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-slate-800">Учебная нагрузка:</span>
              {subject.total_hours != null && <span>{subject.total_hours} ч</span>}
              {subject.credits != null && <span>· {subject.credits} з.е.</span>}
            </div>
            {gradebook.length > 0 && (
              <div className="mt-2 text-sm text-slate-600">
                <span className="font-semibold text-slate-800">Для зачётки:</span>{" "}
                {gradebook.map((g, i) => (
                  <span key={i}>
                    {i > 0 ? " · " : ""}
                    {g.display_name}
                    {g.hours != null ? " (" + g.hours + (g.credits != null ? "/" + g.credits : " ч") + ")" : ""}
                  </span>
                ))}
              </div>
            )}
            {gradebook.some((g) => g.source_note) && (
              <p className="mt-2 text-xs text-amber-700">В отдельных строках фото и XLSX содержат разные значения; они не смешиваются и сохранены раздельно.</p>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            {BLOCKS.map((b) => {
              const Icon = b.icon;
              const active = block === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBlock(b.id)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {b.label}
                </button>
              );
            })}
          </div>

          <section className="card space-y-4 p-5">
            {block === "plan" && (
              <>
                <div>
                  <h2 className="text-lg font-bold">Учебный план</h2>
                  <p className="text-sm text-slate-500">
                    {plan
                      ? `Контроль: ${plan.control || "—"} · ${(plan.weeks || []).length} занятий`
                      : "Темы и сроки семестра"}
                  </p>
                </div>
                {plan?.weeks?.length ? (
                  <div className="space-y-3">
                    {(plan.weeks as SubjectPlanWeek[]).map((w, i) => (
                      <article key={w.date || w.week || i} className="rounded-xl border bg-slate-50 p-4">
                        <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                          {w.date && <span>{w.date}</span>}
                          {w.week != null && <span>Неделя {w.week}</span>}
                        </div>
                        {w.lecture && (
                          <div className="mt-2 text-sm">
                            <span className="font-medium text-indigo-700">Лекция: </span>
                            {w.lecture}
                          </div>
                        )}
                        {w.practice && (
                          <div className="text-sm">
                            <span className="font-medium text-emerald-700">Практика: </span>
                            {w.practice}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                ) : modules.length ? (
                  modules.map((m, i) => (
                    <details key={m.id || m.title || i} className="rounded-xl border" open={i === 0}>
                      <summary className="cursor-pointer px-4 py-3 font-medium">
                        {m.title || `Модуль ${i + 1}`}
                      </summary>
                      <ul className="border-t px-4 py-2 text-sm">
                        {(m.topics || []).map((t, j) => (
                          <li key={t.id || j} className="border-b border-slate-50 py-2 last:border-0">
                            {t.title}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">План ещё не загружен.</p>
                )}
              </>
            )}

            {block === "tickets" &&
              (ticketBankAvailable(subjectSlug) ? (
                <Block
                  title="Билеты и вопросы"
                  text="Только банк этого предмета (не SRS-карточки)."
                  href={`/tickets?${q}`}
                  cta="Открыть билеты"
                />
              ) : (
                <div className="space-y-2">
                  <h2 className="text-lg font-bold">Билеты и вопросы</h2>
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Для «{subject.name}» банка билетов нет — чужой предмет (неорганика, биология 1
                    курса и т.д.) не подставляем.
                  </p>
                </div>
              ))}

            {block === "practice" && (
              <Block title="Практика" text="Тренажёры по темам предмета." href={`/practice?${q}`} cta="К практике" />
            )}
            {block === "lectures" && (
              <Block title="Лекции" text="Страницы лекций с формулами и видео." href={`/lectures?${q}`} cta="К лекциям" />
            )}
            {block === "materials" && (
              <Block title="Материалы" text="Таблицы, PDF, схемы — наполняет админ." href={`/materials?${q}`} cta="К материалам" />
            )}
            {block === "cards" && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold">Карточки SRS</h2>
                <p className="text-sm text-slate-500">
                  Общие и личные. Не путать с экзаменационными билетами.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Link href={`/cards?${q}&scope=shared`} className="rounded-xl border p-4 hover:bg-slate-50">
                    <div className="font-semibold">Общие</div>
                    <p className="mt-1 text-xs text-slate-500">Преподаватель</p>
                  </Link>
                  <Link href={`/cards?${q}&scope=personal`} className="rounded-xl border p-4 hover:bg-slate-50">
                    <div className="font-semibold">Мои</div>
                    <p className="mt-1 text-xs text-slate-500">Термины, формулы</p>
                  </Link>
                </div>
              </div>
            )}
            {block === "progress" && (
              <Block title="Прогресс по предмету" text="Покрытие, точность, готовность." href={`/progress?${q}`} cta="Смотреть прогресс" />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Block({
  title,
  text,
  href,
  cta,
}: {
  title: string;
  text: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-sm text-slate-500">{text}</p>
      <Link href={href} className="btn-primary inline-flex">
        {cta}
      </Link>
    </div>
  );
}
