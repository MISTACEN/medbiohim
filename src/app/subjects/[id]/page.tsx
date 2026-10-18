"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import { BookOpen, ChevronLeft, ExternalLink, FileQuestion, FolderOpen, GraduationCap, ListChecks, Microscope, TrendingUp, X } from "lucide-react";
import { generateTicket, getProgress, getSubject, getSubjectGradebook, getSubjectPlan, listLectures, listMaterials, listSubjectsCatalog, listTests, listTicketBanks, type ApiTest, type SubjectPlan, type SubjectPlanWeek } from "@/lib/api";
import { listSubjectMaterials, type SubjectMaterial } from "@/lib/content-api";
import { resolveSubjectSlug, ticketBankAvailable } from "@/lib/subjectSlug";
import { ChemRichText } from "@/components/chemistry/ChemRichText";
import SubjectTrainersHub from "@/components/trainers/SubjectTrainersHub";
import HistologyTrainer from "@/components/trainers/HistologyTrainer";
import { useAuth } from "@/components/auth/AuthProvider";
import PhysiologyColloquium from "@/components/physiology/PhysiologyColloquium";

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

type TabId = "plan" | "tickets" | "tests" | "practice" | "lectures" | "materials" | "trainer" | "trainers" | "progress" | "colloquium";

const TAB_IDS: TabId[] = ["plan", "tickets", "tests", "practice", "lectures", "materials", "trainer", "trainers", "progress", "colloquium"];

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
  const [, setModules] = useState<Module[]>([]);
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
  const [activeMaterial, setActiveMaterial] = useState<any | null>(null);
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
        const responseData: any = r.ok ? r.data : null;
        const subjectPayload = responseData?.subject || responseData?.item ||
          (responseData?.id ? responseData : null);
        const s: any = { ...(hit || {}), ...(subjectPayload || {}) };
        if (!s.name && hit?.name) s.name = hit.name;
        if (!s.slug && hit?.slug) s.slug = hit.slug;
        if (s.course_number == null && hit?.course_number != null) s.course_number = hit.course_number;
        if (s.semester == null && hit?.semester != null) s.semester = hit.semester;
        setSubject(s);
        const moduleRows = responseData?.modules || responseData?.subject?.modules || [];
        setModules(Array.isArray(moduleRows) ? (moduleRows as Module[]) : []);
        const slug = slugNames[(s?.name || "").toLowerCase()] || s?.slug || "";
        if (s?.id) {
          const planRequest = slug ? getSubjectPlan(slug, s.course_number ?? 2, s.semester ?? 3) : Promise.resolve({ ok: false } as any);
          const testsRequest = listTests(s.id, user?.groupId, slug, s.course_number ?? 2, s.semester ?? 3);
          const auxiliaryRequest = Promise.all([
            getSubjectGradebook(s.id),
            listSubjectMaterials({ subjectId: s.id }),
            listTicketBanks(),
            getProgress(s.id, user?.groupId),
            listMaterials(slug ? { subjectSlug: slug } : {}),
            listLectures(slug),
          ]);
          const [pr, tt] = await Promise.all([planRequest, testsRequest]);
          if (cancelled) return;
          if (!cancelled && pr.ok) {
            const planData = pr.data.plan || pr.data;
            const planSubject = pr.data.subject && typeof pr.data.subject === "object" ? pr.data.subject : {};
            const planWeeks = Array.isArray(planData.weeks) ? planData.weeks : (Array.isArray(planData.items) ? planData.items.map((item: any, index: number) => {
              const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
              const kind = String(item.item_type || "").toLowerCase();
              return {
                ...item,
                date: item.planned_date || metadata.date || null,
                week: metadata.week ?? metadata.calendar_week ?? index + 1,
                lecture: kind === "lecture" ? item.title : (metadata.lecture || item.title),
                practice: ["practice", "lab", "seminar"].includes(kind) ? item.title : (metadata.practice || null),
                preparations: Array.isArray(item.preparations) ? item.preparations : (Array.isArray(metadata.preparations) ? metadata.preparations : []),
              };
            }) : []);
            const planSubjectFields: Record<string, unknown> = {
              id: planSubject.id,
              name: planSubject.name || (typeof planData.subject === "string" ? planData.subject : planData.title),
              slug: planSubject.slug || planData.subject_slug || slug,
              course_number: planSubject.course_number ?? planData.course_number ?? planData.course,
              semester: planSubject.semester ?? planData.semester,
              control_type: planSubject.control_type ?? planData.control ?? planData.control_type,
              total_hours: planSubject.total_hours ?? planData.total_hours ?? planData.hours?.total,
              credits: planSubject.credits ?? planData.credits,
              lecture_hours: planSubject.lecture_hours ?? planData.hours?.lecture,
              practice_hours: planSubject.practice_hours ?? planData.hours?.practice,
              self_study_hours: planSubject.self_study_hours ?? planData.hours?.self_study,
              description: planSubject.description ?? planData.description,
            };
            setSubject((current: any) => {
              const merged = { ...(planSubject || {}), ...(current || {}) };
              for (const [key, value] of Object.entries(planSubjectFields)) {
                if ((merged[key] == null || merged[key] === "") && value != null && value !== "") merged[key] = value;
              }
              return merged;
            });
            setPlan({ ...planData, weeks: planWeeks, control: planData.control || pr.data.plan_meta?.control });
          }
          if (!cancelled) {
            setResourceErrors({
              ...(!pr.ok ? { plan: pr.error?.message || "Не удалось загрузить учебный план." } : {}),
              ...(!tt.ok ? { tests: tt.error?.message || "Не удалось загрузить тесты." } : {}),
            });
            if (tt.ok) setTests(tt.data.items || []);
            setLoading(false);
          }
          const [gb, mm, bb, pg, mr, ll] = await auxiliaryRequest;
          if (!cancelled) {
            setResourceErrors((current) => ({
              ...current,
              ...(!bb.ok ? { tickets: bb.error?.message || "Не удалось загрузить банки билетов." } : {}),
            }));
            if (gb.ok) setGradebook(gb.data.items || []);
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
  const slug = resolveSubjectSlug(subject?.slug || "", subject?.name) || resolveSubjectSlug(subjectId, subject?.name);
  const histology = slug === "histology" || /гистол.*цитол|цитол.*гистол/i.test(subject?.name || "");
  const physiology = slug === "physiology" || /физиолог/i.test(subject?.name || "");
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

  useEffect(() => {
    const firstAvailableBank = subjectBanks.find((bank: any) => Number(bank.count ?? 0) > 0);
    setTicketBankId(firstAvailableBank ? String(firstAvailableBank.id) : "");
    setTicketQuestions([]);
    setTicketTitle("");
    setTicketNote(null);
    setReveal({});
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
    { id: "colloquium", label: "Коллоквиум", Icon: GraduationCap },
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
        {(subject?.total_hours != null || subject?.credits != null) && (
          <p className="mt-1 text-sm text-slate-500">
            Учебная нагрузка:
            {subject?.total_hours != null ? ` ${subject.total_hours} ч` : ""}
            {subject?.credits != null ? ` · ${subject.credits} з.е.` : ""}
          </p>
        )}
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Разделы предмета">
        {nav
          .filter((item) => {
            if (item.id === "trainer" && !histology) return false;
            if (item.id === "colloquium" && !physiology) return false;
            return true;
          })
          .map(({ id, label, Icon }) => {
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
                  : "border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50")
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="min-h-64">
        {tab === "plan" && (
          <section className="card space-y-4 p-5">
            <h2 className="text-lg font-bold">Учебный план</h2>
            {resourceErrors.plan && <p className="text-sm text-amber-700">{resourceErrors.plan}</p>}
            {plan?.control && <p className="text-sm text-slate-600">{String(plan.control)} · {plan.weeks?.length || 0} занятий</p>}
            <div className="space-y-3">
              {(plan?.weeks || []).map((w: SubjectPlanWeek, i: number) => (
                <article key={i} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-xs font-semibold text-indigo-600">
                    {w.date ? String(w.date) : ""}{w.week != null ? ` · неделя ${w.week}` : ""}
                  </p>
                  {w.lecture && <p className="mt-1 text-sm"><b>Лекция:</b> {w.lecture}</p>}
                  {w.practice && <p className="mt-1 text-sm"><b>Практика:</b> {w.practice}</p>}
                </article>
              ))}
              {!plan?.weeks?.length && !resourceErrors.plan && (
                <p className="text-sm text-slate-500">План пока пуст.</p>
              )}
            </div>
          </section>
        )}

        {tab === "colloquium" && physiology && (
          <PhysiologyColloquium />
        )}

        {tab === "tickets" && (
          <section className="card space-y-4 p-5">
            <h2 className="text-lg font-bold">Билеты</h2>
            {resourceErrors.tickets && <p className="text-sm text-amber-700">{resourceErrors.tickets}</p>}
            {!ticketBankAvailable(slug) && (
              <p className="text-sm text-slate-500">Для этого предмета банк билетов пока не подключён.</p>
            )}
            {ticketBankAvailable(slug) && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-sm">
                    Вопросов
                    <input type="number" min={1} max={20} value={ticketCount} onChange={(e) => setTicketCount(Number(e.target.value) || 3)} className="ml-2 w-16 rounded-lg border px-2 py-1" />
                  </label>
                  <select value={ticketMode} onChange={(e) => setTicketMode(e.target.value as "practice" | "exam")} className="rounded-lg border px-2 py-1 text-sm">
                    <option value="exam">Экзамен</option>
                    <option value="practice">Практика</option>
                  </select>
                  <button type="button" disabled={!ticketBankId || ticketBusy} onClick={genTicket} className="btn-primary text-sm">
                    {ticketBusy ? "Генерация…" : "Сгенерировать билет"}
                  </button>
                </div>
                {ticketNote && <p className="text-sm text-rose-600">{ticketNote}</p>}
                {ticketTitle && <p className="text-sm font-semibold">{ticketTitle}</p>}
                <ul className="space-y-2">
                  {ticketQuestions.map((q: any, i: number) => (
                    <li key={q.id || i} className="rounded-xl border border-slate-100 p-3 text-sm">
                      <p className="font-medium">{i + 1}. {q.question || q.text || q.title}</p>
                      {(q.answer || q.explanation) && (
                        <button type="button" className="mt-1 text-xs text-indigo-600" onClick={() => setReveal((r) => ({ ...r, [String(q.id || i)]: !r[String(q.id || i)] }))}>
                          {reveal[String(q.id || i)] ? "Скрыть" : "Показать ответ"}
                        </button>
                      )}
                      {reveal[String(q.id || i)] && <p className="mt-2 text-slate-600">{q.answer || q.explanation}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {tab === "tests" && (
          <section className="card space-y-4 p-5">
            <h2 className="text-lg font-bold">Тесты</h2>
            {resourceErrors.tests && <p className="text-sm text-amber-700">{resourceErrors.tests}</p>}
            <ul className="space-y-2">
              {subjectTests.map((t: any) => (
                <li key={t.id}>
                  <Link href={`/tests/${t.id}?${query}`} className="block rounded-xl border border-slate-100 p-3 text-sm hover:border-indigo-200 hover:bg-indigo-50/50">
                    <span className="font-semibold">{t.title || t.name}</span>
                    {t.questions_count != null && <span className="ml-2 text-slate-500">{t.questions_count} вопр.</span>}
                  </Link>
                </li>
              ))}
              {!subjectTests.length && !resourceErrors.tests && <p className="text-sm text-slate-500">Тестов пока нет.</p>}
            </ul>
          </section>
        )}

        {tab === "practice" && (
          <section className="card space-y-4 p-5">
            <h2 className="text-lg font-bold">База вопросов</h2>
            <p className="text-sm text-slate-600">Открой практику по предмету для работы с банком вопросов.</p>
            <Link href={`/practice?${query}`} className="btn-primary inline-flex text-sm">Перейти к практике</Link>
          </section>
        )}

        {tab === "lectures" && (
          <section className="card space-y-4 p-5">
            <h2 className="text-lg font-bold">Лекции</h2>
            <ul className="space-y-2">
              {subjectLectures.map((l: any) => (
                <li key={l.id}>
                  <Link href={`/lectures/${l.id}`} className="block rounded-xl border border-slate-100 p-3 text-sm hover:border-indigo-200">
                    {l.title || l.name}
                  </Link>
                </li>
              ))}
              {!subjectLectures.length && <p className="text-sm text-slate-500">Лекций пока нет.</p>}
            </ul>
          </section>
        )}

        {tab === "materials" && (
          <section className="card space-y-4 p-5">
            <h2 className="text-lg font-bold">Материалы</h2>
            <ul className="space-y-2">
              {[...materials, ...materialsRich].map((m: any, i: number) => (
                <li key={m.id || i}>
                  <button type="button" onClick={() => setActiveMaterial(m)} className="w-full rounded-xl border border-slate-100 p-3 text-left text-sm hover:border-indigo-200">
                    <span className="font-semibold">{m.title || m.name}</span>
                    <span className="ml-2 text-xs text-slate-500">{materialTypeLabel(m.type || m.material_type)}</span>
                  </button>
                </li>
              ))}
              {!materials.length && !materialsRich.length && <p className="text-sm text-slate-500">Материалов пока нет.</p>}
            </ul>
          </section>
        )}

        {tab === "trainer" && histology && (
          <HistologyTrainer embedded />
        )}

        {tab === "trainers" && (
          <SubjectTrainersHub lectureHref="?tab=lectures" />
        )}

        {tab === "progress" && (
          <section className="card space-y-4 p-5">
            <h2 className="text-lg font-bold">Прогресс</h2>
            {progress ? (
              <pre className="overflow-auto rounded-xl bg-slate-50 p-3 text-xs">{JSON.stringify(progress, null, 2)}</pre>
            ) : (
              <p className="text-sm text-slate-500">Данных прогресса пока нет.</p>
            )}
            {gradebook?.length > 0 && (
              <div>
                <h3 className="text-sm font-bold">Журнал</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {gradebook.map((g: any, i: number) => (
                    <li key={i}>{g.title || g.name || JSON.stringify(g)}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>

      {activeMaterial && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setActiveMaterial(null)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <header className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="text-lg font-bold">{activeMaterial.title || activeMaterial.name}</h3>
              <button type="button" onClick={() => setActiveMaterial(null)} aria-label="Закрыть"><X className="h-5 w-5" /></button>
            </header>
            <div className="p-5 text-sm">
              {activeMaterial.html || activeMaterial.content ? (
                <ChemRichText html={String(activeMaterial.html || activeMaterial.content)} />
              ) : activeMaterial.body ? (
                <div className="whitespace-pre-wrap">{stripHtml(activeMaterial.body)}</div>
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
