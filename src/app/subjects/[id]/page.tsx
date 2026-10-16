"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import { BookOpen, ChevronLeft, ExternalLink, Eye, FileQuestion, FolderOpen, GraduationCap, ListChecks, Loader2, Microscope, RefreshCw, TrendingUp, X } from "lucide-react";
import { generateTicket, getProgress, getSubject, getSubjectGradebook, getSubjectPlan, listLectures, listMaterials, listSubjectsCatalog, listTests, listTicketBanks, type ApiTest, type SubjectPlan, type SubjectPlanWeek } from "@/lib/api";
import { listSubjectMaterials, type SubjectMaterial } from "@/lib/content-api";
import { resolveSubjectSlug, ticketBankAvailable } from "@/lib/subjectSlug";
import { ChemRichText } from "@/components/chemistry/ChemRichText";
import SubjectTrainersHub from "@/components/trainers/SubjectTrainersHub";
import HistologyTrainer from "@/components/trainers/HistologyTrainer";
import HistologyMaterials from "@/components/trainers/HistologyMaterials";
import { useAuth } from "@/components/auth/AuthProvider";

type Subject = {
  id: string;
  name: string;
  course_number?: number | null;
  semester?: number | null;
  control_type?: string | null;
  total_hours?: number | null;
  credits?: number | null;
  slug?: string | null;
};
type Module = { id?: string; title?: string; topics?: { id?: string; title?: string }[] };

type TabId = "plan" | "tickets" | "tests" | "practice" | "lectures" | "materials" | "trainer" | "trainers" | "progress";

const TAB_IDS: TabId[] = ["plan", "tickets", "tests", "practice", "lectures", "materials", "trainer", "trainers", "progress"];

function normalizeTab(v: string) {
  if (v === "cards") return "trainers" as TabId;
  if (v === "trainer") return "trainer" as TabId;
  return v as TabId;
}

const slugNames: Record<string, string> = {
  "гистология, цитология": "histology",
  гистология: "histology",
  физиология: "physiology",
  "органическая и физическая химия": "chemistry_organic_physical",
};
const semester = (n: number) => (n % 2 ? "Осенний" : "Весенний");

function isTabId(v: string): v is TabId {
  return (TAB_IDS as string[]).includes(v);
}

function materialTypeLabel(type?: string | null) {
  const map: Record<string, string> = { lecture: "Лекция", pdf: "PDF", pptx: "Презентация", docx: "Word", lab: "Лабораторная", table: "Таблица", html: "Страница", video: "Видео", other: "Материал" };
  return map[String(type || "")] || String(type || "Материал");
}

function stripHtml(html?: string | null) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export default function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, loading: authLoading } = useAuth();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [plan, setPlan] = useState<SubjectPlan | null>(null);
  const [gradebook, setGradebook] = useState<any[]>([]);
  const [tests, setTests] = useState<ApiTest[]>([]);
  const [materials, setMaterials] = useState<SubjectMaterial[]>([]);
  const [materialsRich, setMaterialsRich] = useState<any[]>([]);
  const [lectures, setLectures] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resourceErrors, setResourceErrors] = useState<Record<string, string>>({});
  const [subjectId, setSubjectId] = useState("");
  const [tab, setTab] = useState<TabId>("plan");
  // Материалы: модальное чтение без перехода со страницы предмета.
  const [activeMaterial, setActiveMaterial] = useState<any | null>(null);
  // Билеты: встроенный генератор.
  const [ticketBankId, setTicketBankId] = useState("");
  const [ticketCount, setTicketCount] = useState(3);
  const [ticketMode, setTicketMode] = useState<"practice" | "exam">("exam");
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketQuestions, setTicketQuestions] = useState<any[]>([]);
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketNote, setTicketNote] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromHash = window.location.hash.replace(/^#/, "");
    const fromQuery = new URLSearchParams(window.location.search).get("tab");
    const initial = fromQuery || fromHash;
    const normalized = initial ? normalizeTab(initial) : "";
    if (normalized && isTabId(normalized)) setTab(normalized);

    const onHash = () => {
      const h = window.location.hash.replace(/^#/, "");
      const normalized = h ? normalizeTab(h) : "";
      if (normalized && isTabId(normalized)) setTab(normalized);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return () => { cancelled = true; };
    (async () => {
      try {
        const p = await params;
        if (cancelled) return;
        setSubjectId(p.id);
        // Catalog and subject are independent: start both requests immediately
        // so Vercel -> SpaceWeb latency does not create a waterfall.
        const [cat, r] = await Promise.all([listSubjectsCatalog(), getSubject(p.id)]);
        const hit = cat.ok
          ? cat.data.items.find((x: any) => x.id === p.id || x.slug === p.id) ||
            cat.data.items.find((x: any) => x.name.toLowerCase() === decodeURIComponent(p.id).toLowerCase())
          : null;
        if (cancelled) return;
        if (!r.ok && !hit) {
          setError(r.error.message);
          setLoading(false);
          return;
        }
        const s: any = r.ok ? r.data.subject : hit;
        setSubject(s);
        setModules(r.ok && Array.isArray(r.data.modules) ? (r.data.modules as Module[]) : []);
        const slug = slugNames[(s?.name || "").toLowerCase()] || s?.slug || "";
        if (s?.id) {
          // Everything below is independent after the subject is known.
          const [pr, gb, tt, mm, bb, pg, mr, ll] = await Promise.all([
            slug ? getSubjectPlan(slug, s.course_number ?? 2, s.semester ?? 3) : Promise.resolve({ ok: false } as any),
            getSubjectGradebook(s.id),
            listTests(s.id, user?.groupId, slug, s.course_number ?? 2, s.semester ?? 3),
            listSubjectMaterials({ subjectId: s.id }),
            listTicketBanks(),
            getProgress(s.id, user?.groupId),
            listMaterials(slug ? { subjectSlug: slug } : {}),
            listLectures(slug),
          ]);
          if (!cancelled && pr.ok) {
            const planData = pr.data.plan || pr.data;
            const planWeeks = Array.isArray(planData.weeks) ? planData.weeks : (Array.isArray(planData.items) ? planData.items.map((item: any, index: number) => {
              const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
              const kind = String(item.item_type || "").toLowerCase();
              return {
                ...item,
                date: item.planned_date || metadata.date || null,
                week: metadata.week ?? index + 1,
                lecture: kind === "lecture" ? item.title : (metadata.lecture || item.title),
                practice: ["practice", "lab", "seminar"].includes(kind) ? item.title : (metadata.practice || null),
              };
            }) : []);
            setPlan({ ...planData, weeks: planWeeks, control: planData.control || pr.data.plan_meta?.control });
          }
          if (!cancelled) {
            setResourceErrors({
              ...(!pr.ok ? { plan: pr.error?.message || "Не удалось загрузить учебный план." } : {}),
              ...(!tt.ok ? { tests: tt.error?.message || "Не удалось загрузить тесты." } : {}),
              ...(!bb.ok ? { tickets: bb.error?.message || "Не удалось загрузить банки билетов." } : {}),
            });
            if (gb.ok) setGradebook(gb.data.items || []);
            if (tt.ok) setTests(tt.data.items || []);
            if (mm.ok) setMaterials(mm.data.items || []);
            if (bb.ok) setBanks(bb.data.items || []);
            if (pg.ok) setProgress(pg.data);
            if (mr.ok) setMaterialsRich(mr.data.items || []);
            if (ll.ok) setLectures(ll.data.items || []);
          }
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
  }, [params, authLoading, user?.groupId]);

  function selectTab(id: TabId) {
    setTab(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      url.hash = id;
      window.history.replaceState(null, "", url.toString());
    }
  }

  const course = subject?.course_number ?? 2;
  const sem = subject?.semester ?? 3;
  // The route id is usually a UUID. Resolve the canonical slug from the
  // subject's own slug/name first so banks and linked views don't get filtered
  // by that UUID.
  const slug = resolveSubjectSlug(subject?.slug || "", subject?.name) || resolveSubjectSlug(subjectId, subject?.name);
  const histology = slug === "histology" || /гистол.*цитол|цитол.*гистол/i.test(subject?.name || "");
  const query = new URLSearchParams({
    subject: subjectId,
    subject_slug: slug,
    course: String(course),
    semester: String(sem),
  }).toString();
  const subjName = (subject?.name || "").toLowerCase().trim();
  const subjectBanks = banks.filter((b) => {
    const bankSlug = String(b.subject_slug || "").trim();
    if (bankSlug) return bankSlug === slug;
    const bankName = String(b.subject || b.subject_name || "").toLowerCase().trim();
    return !!subjName && (bankName === subjName || bankName.includes(subjName) || subjName.includes(bankName));
  });
  const subjectTests = tests.filter((t: any) => {
    if (t.subject_id && t.subject_id === subject?.id) return true;
    const sameSubject = String(t.subject_slug || "") === slug;
    const sameCourse = !t.course_number || Number(t.course_number) === Number(subject?.course_number ?? 2);
    const sameSemester = !t.semester || Number(t.semester) === Number(subject?.semester ?? 3);
    if (sameSubject && sameCourse && sameSemester) return true;
    if (histology && (t.subject_id === "histology" || /цитолог|эмбриолог|гистолог/i.test(String(t.title || t.name || "")))) return true;
    return false;
  });
  const subjectLectures = lectures.filter((l) => {
    const ls = String(l?.subject || "").toLowerCase().trim();
    if (!ls || !subjName) return false;
    return ls === subjName || ls.includes(subjName) || subjName.includes(ls);
  });

  // Банк билетов предмета подставляем сразу — ничего выбирать не нужно.
  useEffect(() => {
    if (!ticketBankId && subjectBanks.length) setTicketBankId(String(subjectBanks[0].id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banks, slug]);

  async function genTicket() {
    if (!ticketBankId || ticketBusy) return;
    setTicketBusy(true);
    setReveal({});
    setTicketNote(null);
    const res = await generateTicket(ticketBankId, ticketCount, ticketMode);
    setTicketBusy(false);
    if (!res.ok) {
      setTicketNote(res.error.message);
      return;
    }
    setTicketQuestions(res.data.questions || []);
    setTicketTitle(res.data.bank?.title || "");
  }

  const nav: { id: TabId; label: string; Icon: ComponentType<{ className?: string }> }[] = [
    { id: "plan", label: "Учебный план", Icon: GraduationCap },
    { id: "tickets", label: "Билеты", Icon: FileQuestion },
    { id: "tests", label: "Тесты", Icon: FileQuestion },
    { id: "practice", label: "База вопросов", Icon: ListChecks },
    { id: "lectures", label: "Лекции", Icon: BookOpen },
    { id: "materials", label: "Материалы", Icon: FolderOpen },
    { id: "trainer", label: "Микропрепараты", Icon: Microscope },
    { id: "trainers", label: "Тренажёры", Icon: ListChecks },
    { id: "progress", label: "Прогресс", Icon: TrendingUp },
  ];

  if (loading) return (
    <div className="mx-auto max-w-6xl space-y-4" aria-label="Загрузка">
      <div className="h-4 w-28 animate-pulse rounded-full bg-slate-200" />
      <div className="card space-y-3 p-5">
        <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
        <div className="h-8 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {[1,2,3,4].map((n) => <div key={n} className="h-11 w-28 shrink-0 animate-pulse rounded-xl bg-slate-200" />)}
      </div>
      <div className="card min-h-48 animate-pulse p-5" />
    </div>
  );
  if (error && !subject) return <div className="card p-6 text-sm text-rose-600">{error}</div>;

  return (
    <div className="space-y-6">
      <Link href="/subjects" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ChevronLeft className="h-4 w-4" />К предметам
      </Link>

      <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">Предмет · Курс · Семестр</p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{subject?.name}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {course} курс · {semester(sem)} · {sem}
          {subject?.control_type
            ? " · " +
              (subject.control_type === "exam" ? "Экзамен" : subject.control_type === "credit" ? "Зачёт" : subject.control_type)
            : ""}
        </p>
      </header>

      <section className="card border-indigo-100 bg-indigo-50/40 p-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <b>Учебная нагрузка:</b>
          {subject?.total_hours != null && <span>{subject.total_hours} ч</span>}
          {subject?.credits != null && <span>· {subject.credits} з.е.</span>}
        </div>
        {gradebook.length > 0 && (
          <div className="mt-2 text-sm text-slate-600">
            <b>Для зачётки:</b>{" "}
            {gradebook.map((g: any, i: number) => (
              <span key={i}>
                {i ? " · " : ""}
                {g.display_name}
                {g.hours != null ? " (" + g.hours + (g.credits != null ? "/" + g.credits : " ч") + ")" : ""}
              </span>
            ))}
          </div>
        )}
      </section>

      <nav className="mobile-scroll-x flex flex-nowrap gap-2 overflow-x-auto pb-1 md:flex-wrap" role="tablist" aria-label="Разделы предмета">
        {nav.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(id)}
              className={
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition " +
                (active
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </nav>

      <div role="tabpanel" className="min-h-[12rem]">
        {tab === "plan" && (
          <section className="card p-5">
            <h2 className="text-lg font-bold">Учебный план</h2>
            <p className="mt-1 text-sm text-slate-500">
              {plan ? (plan.control || "Контроль не указан") + " · " + (plan.weeks || []).length + " занятий" : resourceErrors.plan || "План ещё не загружен."}
            </p>
            {plan?.weeks?.length ? (
              <div className="mt-4 grid gap-3">
                {(plan.weeks as SubjectPlanWeek[]).map((w: any, i: number) => (
                  <article key={i} className="rounded-xl border bg-slate-50 p-4">
                    <div className="text-xs text-slate-400">
                      {w.date || ""}
                      {w.week != null ? " · неделя " + w.week : ""}
                    </div>
                    {w.lecture && (
                      <div className="mt-2 text-sm">
                        <b className="text-indigo-700">Лекция:</b> {w.lecture}
                      </div>
                    )}
                    {w.practice && (
                      <div className="text-sm">
                        <b className="text-emerald-700">Практика:</b> {w.practice}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : modules.length ? (
              <div className="mt-4 space-y-2">
                {modules.map((m, i) => (
                  <details key={m.id || i} className="rounded-xl border" open={i === 0}>
                    <summary className="cursor-pointer px-4 py-3 font-semibold">{m.title || "Модуль " + (i + 1)}</summary>
                    <div className="border-t px-4 py-2 text-sm">
                      {(m.topics || []).map((tp, j) => (
                        <div key={tp.id || j} className="border-b py-2 last:border-0">
                          {tp.title}
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            ) : null}
          </section>
        )}

        {tab === "tickets" && (
          <section className="card p-5">
            <h2 className="text-lg font-bold">Билеты</h2>
            <p className="mt-1 text-sm text-slate-500">Генератор билетов прямо здесь — никуда переходить не нужно. Билеты отдельный банк, с SRS не смешиваются.</p>
            {ticketBankAvailable(slug) && subjectBanks.length ? (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <select
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2"
                    value={ticketBankId}
                    onChange={(e) => setTicketBankId(e.target.value)}
                  >
                    {subjectBanks.map((b: any) => (
                      <option key={b.id} value={b.id}>{b.title} ({b.count})</option>
                    ))}
                  </select>
                  <select
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={ticketCount}
                    onChange={(e) => setTicketCount(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n} вопрос(а)</option>
                    ))}
                  </select>
                  <select
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={ticketMode}
                    onChange={(e) => setTicketMode(e.target.value as "practice" | "exam")}
                  >
                    <option value="practice">Практика (с эталоном)</option>
                    <option value="exam">Экзамен</option>
                  </select>
                  <button
                    type="button"
                    className="btn-primary inline-flex items-center justify-center gap-2 text-sm md:col-span-4"
                    onClick={() => void genTicket()}
                    disabled={ticketBusy || !ticketBankId}
                  >
                    {ticketBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Сгенерировать билет
                  </button>
                </div>
                {ticketNote && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{ticketNote}</div>}
                {ticketQuestions.length > 0 && (
                  <>
                    {ticketTitle && <h3 className="mt-5 text-base font-semibold">{ticketTitle}</h3>}
                    <ol className="mt-3 space-y-4">
                      {ticketQuestions.map((qq: any, idx: number) => (
                        <li key={qq.id || idx} className="rounded-xl border bg-slate-50 p-4">
                          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Вопрос {idx + 1}{qq.subject ? ` · ${qq.subject}` : ""}</div>
                          <div className="mt-2 font-medium leading-snug">
                            <ChemRichText text={String(qq.text || "")} />
                          </div>
                          {ticketMode === "practice" && (qq.answer || qq.has_answer) && (
                            <div className="mt-3">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-sm text-indigo-600"
                                onClick={() => setReveal((r) => ({ ...r, [qq.id]: !r[qq.id] }))}
                              >
                                <Eye className="h-4 w-4" />
                                {reveal[qq.id] ? "Скрыть эталон" : "Показать эталон"}
                              </button>
                              {reveal[qq.id] && (
                                <div className="mt-2 rounded-xl bg-white p-3 text-sm text-slate-700">
                                  <ChemRichText text={String(qq.answer || "")} asHtml />
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </>
            ) : (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {resourceErrors.tickets || "Банк билетов для этого предмета пока не подключён."}
              </p>
            )}
          </section>
        )}

        {tab === "tests" && (
          <section className="card space-y-4 p-5">
            <div>
              <h2 className="text-lg font-bold">Тесты</h2>
              <p className="mt-1 text-sm text-slate-500">
                {histology
                  ? "Закрытые тесты по цитологии и эмбриологии + банк предмета. Режим выбирается кнопкой на карточке."
                  : "Все тесты предмета — сразу с кнопками режима, без перехода в общий раздел."}
              </p>
            </div>
            {subjectTests.length > 0 ? (
              <>
              <div className="flex flex-wrap gap-2">
                <Link href={"/subjects/" + encodeURIComponent(subjectId) + "/tests"} className="btn-primary inline-flex items-center gap-2 text-sm">
                  <ListChecks className="h-4 w-4" /> Открыть весь раздел тестов
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {subjectTests.map((t) => (
                  <div key={t.id} className="rounded-xl border bg-slate-50 p-4">
                    <div className="font-semibold">{t.title || t.name || "Тест"}</div>
                    <div className="mt-1 text-xs text-slate-500">{t.questions_count || 0} вопросов</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={"/tests/preparation/" + encodeURIComponent(t.id)} className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-indigo-700 hover:border-indigo-300">Подготовка</Link>
                      <Link href={"/tests/preparation/" + encodeURIComponent(t.id) + "?mode=exam"} className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300">Экзамен</Link>
                    </div>
                  </div>
                ))}
              </div>
              </>
            ) : (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {resourceErrors.tests || "Опубликованных тестов для этого предмета пока нет."}
              </p>
            )}
          </section>
        )}

        {tab === "practice" && (
          <section className="card p-5">
            <h2 className="text-lg font-bold">Практика</h2>
            <p className="mt-1 text-sm text-slate-500">
              {histology ? "Микропрепараты, электронограммы и задания МБХ." : "Темы и практические задания предмета."}
            </p>
            {modules.length > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {modules.slice(0, 6).map((m, i) => (
                  <div key={m.id || i} className="rounded-xl border p-3 text-sm font-medium">
                    {m.title}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={"/practice?" + query}
                className="btn-primary inline-flex"
              >
                Открыть базу вопросов
              </Link>
              {histology && (
                <button type="button" onClick={() => selectTab("trainers")} className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:border-indigo-300">
                  Открыть тренажёр
                </button>
              )}
            </div>
          </section>
        )}

        {tab === "lectures" && (
          <section className="card p-5">
            <h2 className="text-lg font-bold">Лекции</h2>
            <p className="mt-1 text-sm text-slate-500">Лекции этого предмета — открываются в один клик.</p>
            {subjectLectures.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {subjectLectures.map((lec: any) => (
                  <Link
                    key={lec.id}
                    href={"/lectures/" + encodeURIComponent(lec.id)}
                    className="flex gap-3 rounded-xl border bg-slate-50 p-4 transition hover:border-indigo-300 hover:bg-white"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold leading-snug">{lec.title}</div>
                      {lec.summary && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{lec.summary}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Опубликованных лекций по этому предмету пока нет.
              </p>
            )}
          </section>
        )}

        {tab === "materials" && (
          histology ? (
            <HistologyMaterials />
          ) : (
            <section className="card p-5">
              <h2 className="text-lg font-bold">Материалы</h2>
              <p className="mt-1 text-sm text-slate-500">
                {materialsRich.length
                  ? materialsRich.length + " материалов — читаются прямо здесь, оригинал доступен отдельно."
                  : "Материалы пока не найдены."}
              </p>
              {materialsRich.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {materialsRich.map((m: any) => (
                    <article key={m.id} className="rounded-xl border bg-slate-50 p-4">
                      <div className="font-semibold leading-snug">{m.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{materialTypeLabel(m.type)}{m.source?.name ? " · " + m.source.name : ""}</div>
                      {stripHtml(m.content_html) && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{stripHtml(m.content_html)}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className="btn-primary text-xs" onClick={() => setActiveMaterial(m)}>Читать</button>
                        {m.source?.download_url ? (
                          <a href={m.source.download_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                            <ExternalLink className="h-3.5 w-3.5" /> Исходник
                          </a>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )
        )}

        {tab === "trainer" && (
          histology ? (
            <HistologyTrainer embedded />
          ) : (
            <section className="card p-5">
              <h2 className="text-lg font-bold">Микропрепараты</h2>
              <p className="mt-1 text-sm text-slate-500">Для этого предмета микропрепараты пока не подключены.</p>
            </section>
          )
        )}

        {tab === "trainers" && (
          histology ? (
            <SubjectTrainersHub lectureHref={`/subjects/${encodeURIComponent(subjectId)}?tab=lectures`} />
          ) : (
            <section className="card p-5">
              <h2 className="text-lg font-bold">Тренажёры</h2>
              <p className="mt-1 text-sm text-slate-500">Для этого предмета тренажёры пока не подключены.</p>
            </section>
          )
        )}

        {tab === "progress" && (
          <section className="card p-5">
            <h2 className="text-lg font-bold">Прогресс</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Общий</div>
                <b className="text-2xl">{progress?.overall_pct != null ? Math.round(progress.overall_pct) + "%" : "—"}</b>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Тесты</div>
                <b className="text-2xl">{tests.length}</b>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Материалы</div>
                <b className="text-2xl">{materials.length}</b>
              </div>
            </div>
            {tests.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {tests.slice(0, 6).map((t) => (
                  <Link key={t.id} href={"/tests/preparation/" + encodeURIComponent(t.id)} className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50">
                    {t.title || t.name || "Тест"} · {t.questions_count || 0} вопросов
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {activeMaterial && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6" onMouseDown={() => setActiveMaterial(null)}>
          <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{subject?.name} · {materialTypeLabel(activeMaterial.type)}</div>
                <h2 className="mt-1 text-xl font-extrabold text-slate-900">{activeMaterial.title}</h2>
                {activeMaterial.source?.name && <div className="mt-1 text-xs text-slate-500">Исходный файл: {activeMaterial.source.name}</div>}
              </div>
              <button type="button" className="rounded-xl p-2 hover:bg-slate-100" onClick={() => setActiveMaterial(null)} aria-label="Закрыть"><X className="h-5 w-5" /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              {activeMaterial.content_html ? (
                <article className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: activeMaterial.content_html }} />
              ) : activeMaterial.external_url ? (
                <iframe src={activeMaterial.external_url} title={activeMaterial.title} className="h-full min-h-[60vh] w-full rounded-xl border" />
              ) : (
                <div className="rounded-2xl bg-slate-50 p-8 text-sm text-slate-500">У этого материала пока нет преобразованного текста.</div>
              )}
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50 px-5 py-4">
              <span className="text-xs text-slate-500">{activeMaterial.source_key ? "Источник: " + activeMaterial.source_key : "Источник не указан"}</span>
              <div className="flex gap-2">
                {activeMaterial.source?.download_url ? (
                  <a href={activeMaterial.source.download_url} target="_blank" rel="noreferrer" className="btn-pill inline-flex items-center gap-2 text-sm">
                    <ExternalLink className="h-4 w-4" /> Открыть оригинал
                  </a>
                ) : null}
                <button type="button" className="btn-primary text-sm" onClick={() => setActiveMaterial(null)}>Закрыть</button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
