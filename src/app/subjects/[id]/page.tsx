"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import { BookOpen, ChevronLeft, ClipboardList, ExternalLink, Eye, FileQuestion, FlaskConical, FolderOpen, Globe, GraduationCap, ListChecks, Loader2, RefreshCw, TrendingUp, X } from "lucide-react";
import { generateTicket, getLecture, getProgress, getSubject, getSubjectGradebook, getSubjectPlan, listLectures, listMaterials, listSubjectsCatalog, listTests, listTicketBanks, type ApiTest, type Lecture, type SubjectPlan, type SubjectPlanWeek } from "@/lib/api";
import { LectureRenderer } from "@/components/lectures/LectureRenderer";
import { listSubjectMaterials, type SubjectMaterial } from "@/lib/content-api";
import { resolveSubjectSlug, ticketBankAvailable } from "@/lib/subjectSlug";
import { ChemRichText } from "@/components/chemistry/ChemRichText";
import SubjectTrainersHub from "@/components/trainers/SubjectTrainersHub";
import HistologyTrainer from "@/components/trainers/HistologyTrainer";
import HistologyMaterials from "@/components/trainers/HistologyMaterials";
import TestsHub from "@/components/tests/TestsHub";
import Labs from "@/components/Labs";
import AttestationList from "@/components/attestations/AttestationList";
import PhysiologyPractice from "@/components/physiology/PhysiologyPractice";
import Colloquium from "@/components/physiology/Colloquium";
import SubjectQuestionBank from "@/components/questions/SubjectQuestionBank";
import HobaPortal from "@/components/portals/HobaPortal";
import MatchingTrainer from "@/components/portals/MatchingTrainer";
import LegacyMCTests from "@/components/portals/LegacyMCTests";
import ChemSdf from "@/components/portals/ChemSdf";
import ArchiveLectures from "@/components/portals/ArchiveLectures";
import ChemPlan from "@/components/chem/ChemPlan";
import { ChemistryWorkbench } from "@/components/chemistry/ChemistryWorkbench";
import LatinRecipes from "@/components/portals/LatinRecipes";
import { legacyPortalConfig, loadTicketBank, type PortalTicketBank } from "@/lib/portalContent";
import ExternalPlatformLinks from "@/components/university/ExternalPlatformLinks";
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

type TabId = "plan" | "lessons" | "tickets" | "tests" | "practice" | "lectures" | "materials" | "trainer" | "trainers" | "labs" | "attestations" | "progress" | "colloquium" | "portal" | "chem" | "latin";
type GroupId = "plan" | "lessons" | "tests" | "materials" | "practice" | "attestations" | "progress" | "portal";

const TAB_IDS: TabId[] = ["plan", "lessons", "tickets", "tests", "practice", "lectures", "materials", "trainer", "trainers", "labs", "attestations", "progress", "colloquium", "portal", "chem", "latin"];

// Вкладки сгруппированы: верхний ряд — крупные разделы, внутри — точные режимы.
// Старые id сохранены, поэтому ссылки вида ?tab=tickets продолжают работать.
const GROUP_OF: Record<TabId, GroupId> = {
  plan: "plan",
  lessons: "lessons",
  tickets: "tests",
  tests: "tests",
  practice: "tests",
  lectures: "materials",
  materials: "materials",
  trainer: "practice",
  trainers: "practice",
  labs: "practice",
  attestations: "attestations",
  colloquium: "attestations",
  portal: "portal",
  progress: "progress",
  chem: "practice",
  latin: "practice",
};

const GROUP_DEFAULT: Record<GroupId, TabId> = {
  plan: "plan",
  lessons: "lessons",
  tests: "tests",
  materials: "lectures",
  practice: "trainers",
  attestations: "attestations",
  portal: "portal",
  progress: "progress",
};

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

type LibraryFile = { title: string; href: string; type: string };

// Исходные пособия кафедры физиологии (папка «физиологии»): каждое пособие —
// отдельный файл, поэтому они показываются в «Материалах» прямо в предмете.
const PHYSIOLOGY_LIBRARY: LibraryFile[] = [
  { title: "Вводное занятие. Физиология возбудимых систем", href: "/library/physiology/vozbudimye-sistemy.docx", type: "Word · практические занятия" },
  { title: "Физиология ЦНС", href: "/library/physiology/cns.doc", type: "Word · практические работы и самоподготовка" },
  { title: "Физиология крови и эндокринной системы", href: "/library/physiology/krov-endokrin.doc", type: "Word · методичка" },
  { title: "Физиология системы кровообращения", href: "/library/physiology/serdce-sosudistaya.doc", type: "Word · методичка" },
  { title: "Физиология дыхания и выделения", href: "/library/physiology/dyhanie-vydelenie.doc", type: "Word · методичка" },
  { title: "Физиология пищеварения и обмена веществ", href: "/library/physiology/pishchevarenie-obmen.docx", type: "Word · методичка" },
  { title: "Сенсорные системы и ВНД", href: "/library/physiology/sensornye-vnd.doc", type: "Word · методичка" },
  { title: "Агаджанян Н.А. Основы физиологии человека, том 1", href: "/library/physiology/agadzhanyan-fiziologiya-t1.pdf", type: "PDF · учебник" },
];

const STATIC_PLANS: Record<string, string> = {
  organic_chemistry: "chem/plan-organic-2025-2026.json",
  optics: "chem/plan-optics-2025-2026.json",
  probability: "chem/plan-probability-2025-2026.json",
  informatics: "chem/plan-informatics-2025-2026.json",
  histology: "histology/plan-semester3-2026-2027.json",
  physiology: "physiology/plan-semester3-2026-2027.json",
};

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
  // Лекция читается прямо в предмете: переход на /lectures/:id уводил со страницы.
  const [activeLecture, setActiveLecture] = useState<Lecture | null>(null);
  const [lectureLoading, setLectureLoading] = useState(false);
  const [lectureError, setLectureError] = useState("");
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
        // Cloudflare returns the subject row directly; the legacy SpaceWeb
        // contract may wrap it as { subject, modules }. Accept both shapes and
        // retain the catalog row as a safe fallback so a shape mismatch cannot
        // blank the entire subject page.
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
          // Render the core subject view as soon as its plan and test catalog
          // arrive. Slow auxiliary panels (progress, tickets, media and CMS)
          // should not leave the whole subject page on a skeleton.
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
            // Some older API versions return the subject and plan as separate
            // resources. Merge workload fields defensively so the page header
            // never goes blank merely because one response omitted them.
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
  // The route id is usually a UUID. Resolve the canonical slug from the
  // subject's own slug/name first so banks and linked views don't get filtered
  // by that UUID.
  const slug = resolveSubjectSlug(subject?.slug || "", subject?.name) || resolveSubjectSlug(subjectId, subject?.name);
  const histology = slug === "histology" || /гистол.*цитол|цитол.*гистол/i.test(subject?.name || "");
  const chemistry = /chem|хим/i.test(`${slug || ""} ${subject?.name || ""}`);
  const latin = /lat|латин/i.test(`${slug || ""} ${subject?.name || ""}`) && !chemistry;
  const portal = legacyPortalConfig(slug);
  const subjName = (subject?.name || "").toLowerCase().trim();
  const subjectBanks = banks.filter((b) => {
    const bankSlug = String(b.subject_slug || "").trim();
    if (bankSlug) return bankSlug === slug;
    const bankName = String(b.subject || b.subject_name || "").toLowerCase().trim();
    return !!subjName && (bankName === subjName || bankName.includes(subjName) || subjName.includes(bankName));
  });
  const subjectLibrary: LibraryFile[] = slug === "physiology" ? PHYSIOLOGY_LIBRARY : [];
  const subjectLectures = lectures.filter((l) => {
    // Лекции привязаны через subject_slug; поле subject у них пустое, из-за
    // чего вкладка всегда показывала «лекций нет».
    const ls = String(l?.subject_slug || l?.subject || "").toLowerCase().trim();
    if (!ls || !subjName) return false;
    return ls === subjName || ls.includes(subjName) || subjName.includes(ls);
  });

  // Архивный билетный банк кафедры (статические questions_by_subject).
  const [archiveBank, setArchiveBank] = useState<PortalTicketBank | null>(null);
  useEffect(() => {
    let cancelled = false;
    setArchiveBank(null);
    loadTicketBank(slug).then((bank) => {
      if (!cancelled && bank?.items?.length) setArchiveBank(bank);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Банк билетов предмета подставляем сразу — ничего выбирать не нужно.
  useEffect(() => {
    const firstAvailableBank = subjectBanks.find((bank: any) => Number(bank.count ?? 0) > 0);
    setTicketBankId(firstAvailableBank ? String(firstAvailableBank.id) : archiveBank ? "archive" : "");
    setTicketQuestions([]);
    setTicketTitle("");
    setTicketNote(null);
    setReveal({});
    // Reset the generated ticket when navigating between subjects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banks, slug, archiveBank]);

  async function genTicket() {
    if (!ticketBankId || ticketBusy) return;
    if (ticketBankId === "archive" && archiveBank) {
      // Локальная генерация из архивного банка кафедры.
      const pool = [...archiveBank.items];
      const picked: any[] = [];
      const n = Math.min(ticketCount, pool.length);
      for (let i = 0; i < n; i += 1) {
        const idx = Math.floor(Math.random() * pool.length);
        picked.push(pool.splice(idx, 1)[0]);
      }
      setReveal({});
      setTicketNote(null);
      setTicketQuestions(picked);
      setTicketTitle(`Билет · ${archiveBank.subject} · архив кафедры`);
      return;
    }
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

  const nav: { id: GroupId; label: string; Icon: ComponentType<{ className?: string }> }[] = [
    { id: "plan", label: "План", Icon: GraduationCap },
    ...(slug === "physiology" ? [{ id: "lessons" as GroupId, label: "Занятия", Icon: ListChecks }] : []),
    { id: "tests", label: "Тесты", Icon: FileQuestion },
    { id: "materials", label: "Материалы", Icon: FolderOpen },
    { id: "practice", label: "Практика", Icon: FlaskConical },
    ...(portal ? [{ id: "portal" as GroupId, label: portal.tabLabel, Icon: Globe }] : []),
    { id: "attestations", label: "Аттестации", Icon: ClipboardList },
    { id: "progress", label: "Прогресс", Icon: TrendingUp },
  ];
  const group = GROUP_OF[tab];
  const subnav: { id: TabId; label: string }[] =
    group === "tests"
      ? [
          { id: "tests", label: "Тесты" },
          { id: "practice", label: "База вопросов" },
          { id: "tickets", label: "Билеты" },
        ]
      : group === "materials"
        ? [
            { id: "lectures", label: "Лекции" },
            { id: "materials", label: "Материалы" },
          ]
        : group === "practice"
          ? [
              { id: "trainers", label: "Тренажёры" },
              { id: "trainer", label: histology ? "Микропрепараты" : "Препараты" },
              { id: "labs", label: "Лабораторные" },
              ...(chemistry ? [{ id: "chem" as TabId, label: "Структуры" }] : []),
              ...(latin ? [{ id: "latin" as TabId, label: "Рецепты" }] : []),
            ]
          : group === "attestations" && slug === "physiology"
            ? [
                { id: "attestations", label: "Аттестации" },
                { id: "colloquium", label: "Коллоквиум" },
              ]
            : [];

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
          const active = group === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(GROUP_DEFAULT[id])}
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

      {subnav.length > 1 && (
        <nav className="flex flex-wrap gap-1.5" aria-label="Режимы раздела">
          {subnav.map(({ id, label }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => selectTab(id)}
                className={
                  "rounded-full px-3 py-1.5 text-xs font-bold transition " +
                  (active ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700")
                }
              >
                {label}
              </button>
            );
          })}
        </nav>
      )}

      <div role="tabpanel" className="min-h-[12rem]">
        {tab === "colloquium" && slug === "physiology" && <Colloquium embedded />}

        {tab === "chem" && chemistry && <ChemistryWorkbench embedded />}

        {tab === "latin" && latin && (
          <section className="card p-4 sm:p-5">
            <h2 className="text-lg font-bold">Латинский язык · рецепты</h2>
            <p className="mt-1 text-sm text-slate-500">
              Формы рецептов по Чернявскому: разделы, поиск и карточки Rp./Da./Signa — без ухода с предмета.
            </p>
            <div className="mt-4">
              <LatinRecipes />
            </div>
          </section>
        )}

        {tab === "portal" && portal && (
          <div className="space-y-6">
            {portal.hoba && <HobaPortal />}
            {portal.sdf && <ChemSdf />}
            {portal.parasitology && <MatchingTrainer />}
            {portal.lectures && <ArchiveLectures setId={portal.lectures} />}
            {portal.mcSubjectIds?.length ? (
              <section className="space-y-3">
                <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-slate-400">Тестовые тренировки</h2>
                <LegacyMCTests subjectIds={portal.mcSubjectIds} />
              </section>
            ) : null}
            <ExternalPlatformLinks subjectSlug={slug} />
          </div>
        )}

        {tab === "lessons" && slug === "physiology" && (
          <PhysiologyPractice backHref={`/subjects/${encodeURIComponent(subjectId)}?tab=plan`} backLabel="К учебному плану" />
        )}
        {tab === "plan" && STATIC_PLANS[slug] && <ChemPlan planFile={STATIC_PLANS[slug]} />}
        {tab === "plan" && !STATIC_PLANS[slug] && (
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
                      <div className="text-sm whitespace-pre-line">
                        <b className="text-emerald-700">Практика:</b> {w.practice}
                      </div>
                    )}
                    {Array.isArray(w.preparations) && w.preparations.length > 0 && (
                      <div className="mt-2 text-xs leading-relaxed text-slate-600">
                        <b className="text-slate-700">Микропрепараты:</b>
                        <ol className="mt-1 list-decimal space-y-1 pl-5">
                          {w.preparations.map((prep: any, j: number) => (
                            <li key={prep?.id || (prep?.number != null ? String(prep.number) : "prep-" + j)}>
                              {prep?.number != null ? String(prep.number) + ". " : ""}
                              {typeof prep === "string" ? prep : (prep?.title || prep?.name || "Препарат")}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {w.electronograms === true && (
                      <div className="mt-2 text-xs font-medium text-violet-700">К занятию есть электронограммы</div>
                    )}
                    {w.description && (
                      <div className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600">
                        {w.description}
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
            {(ticketBankAvailable(slug) && subjectBanks.length) || archiveBank ? (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <select
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2"
                    value={ticketBankId}
                    onChange={(e) => setTicketBankId(e.target.value)}
                  >
                    {subjectBanks.map((b: any) => (
                      <option key={b.id} value={b.id} disabled={Number(b.count ?? 0) <= 0}>
                        {b.title} ({Number(b.count ?? 0) > 0 ? b.count : "нет опубликованных вопросов"})
                      </option>
                    ))}
                    {archiveBank && (
                      <option value="archive">
                        Архив билетов кафедры ({archiveBank.count})
                      </option>
                    )}
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
          <TestsHub
            subjectId={subject?.id || subjectId}
            subjectSlug={slug}
            subjectName={subject?.name}
            course={subject?.course_number ?? 2}
            semester={subject?.semester ?? 3}
            embedded
          />
        )}

        {tab === "practice" && (
          <div className="space-y-3">
            <SubjectQuestionBank subjectId={subject?.id || ""} subjectSlug={slug} subjectName={subject?.name} />
            {modules.length > 0 && (
              <section className="card p-5">
                <h2 className="text-lg font-bold">Темы предмета</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {histology ? "Темы, к которым привязаны микропрепараты, электронограммы и задания МБХ." : "Темы и практические задания предмета."}
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {modules.slice(0, 6).map((m, i) => (
                    <div key={m.id || i} className="rounded-xl border p-3 text-sm font-medium">
                      {m.title}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === "lectures" && activeLecture && (
          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setActiveLecture(null)}
                className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-700"
              >
                <ChevronLeft className="h-4 w-4" /> К списку лекций
              </button>
              <span className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{activeLecture.subject || subject?.name}</span>
            </div>
            <h2 className="mt-3 text-xl font-extrabold">{activeLecture.title}</h2>
            {activeLecture.published_at && (
              <p className="mt-1 text-xs text-slate-500">Опубликовано: {new Date(activeLecture.published_at).toLocaleString("ru-RU")}</p>
            )}
            <article className="mt-4">
              <LectureRenderer markdown={activeLecture.body_md || ""} html={activeLecture.body_html || ""} />
            </article>
          </section>
        )}

        {tab === "lectures" && !activeLecture && (
          <section className="card p-5">
            <h2 className="text-lg font-bold">Лекции</h2>
            <p className="mt-1 text-sm text-slate-500">Лекции этого предмета — читаются прямо здесь.</p>
            {lectureLoading && <p className="mt-3 text-sm text-slate-500">Открываю лекцию…</p>}
            {lectureError && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{lectureError}</p>}
            {subjectLectures.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {subjectLectures.map((lec: any) => (
                  <button
                    key={lec.id}
                    type="button"
                    onClick={() => {
                      setLectureError("");
                      setLectureLoading(true);
                      void getLecture(String(lec.id)).then((result) => {
                        if (result.ok) setActiveLecture(result.data.lecture);
                        else setLectureError(result.error.message || "Не удалось открыть лекцию.");
                        setLectureLoading(false);
                      });
                    }}
                    className="flex gap-3 rounded-xl border bg-slate-50 p-4 text-left transition hover:border-indigo-300 hover:bg-white"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold leading-snug">{lec.title}</div>
                      {lec.summary && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{lec.summary}</p>}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Опубликованных лекций по этому предмету пока нет.
              </p>
            )}
          </section>
        )}                {tab === "materials" && (
          histology ? (
            <HistologyMaterials />
          ) : (
            <section className="card p-5">
              <h2 className="text-lg font-bold">Материалы</h2>
              <p className="mt-1 text-sm text-slate-500">
                {materialsRich.length
                  ? materialsRich.length + " материалов — читаются прямо здесь, оригинал доступен отдельно."
                  : subjectLibrary.length
                    ? subjectLibrary.length + " исходных пособий кафедры — открываются здесь же."
                    : "Материалы пока не найдены."}
              </p>
              {subjectLibrary.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {subjectLibrary.map((file) => (
                    <a
                      key={file.href}
                      href={file.href}
                      target="_blank"
                      rel="noreferrer"
                      className="flex gap-3 rounded-xl border bg-slate-50 p-4 transition hover:border-indigo-300 hover:bg-white"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                        <FolderOpen className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold leading-snug">{file.title}</span>
                        <span className="mt-1 block text-xs text-slate-500">{file.type}</span>
                      </span>
                    </a>
                  ))}
                </div>
              )}
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
              {!materialsRich.length && !subjectLibrary.length && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => selectTab("practice")} className="btn-primary inline-flex">Открыть базу вопросов</button>
                  <button type="button" onClick={() => selectTab("tests")} className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:border-indigo-300">
                    Перейти к тестам
                  </button>
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
              <p className="mt-1 text-sm text-slate-500">
                Для этого предмета микропрепараты пока не подключены. Потренируйтесь на вопросах с эталонами или запустите тест.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => selectTab("practice")} className="btn-primary inline-flex">Открыть базу вопросов</button>
                <button type="button" onClick={() => selectTab("tests")} className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:border-indigo-300">
                  Перейти к тестам
                </button>
              </div>
            </section>
          )
        )}

        {tab === "trainers" && (
          histology ? (
            <SubjectTrainersHub lectureHref={`/subjects/${encodeURIComponent(subjectId)}?tab=lectures`} />
          ) : (
            <section className="card p-5">
              <h2 className="text-lg font-bold">Тренажёры</h2>
              <p className="mt-1 text-sm text-slate-500">
                Интерактивные тренажёры по этому предмету пока не подключены. Можно отработать материал в базе вопросов или в тестах.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => selectTab("practice")} className="btn-primary inline-flex">Открыть базу вопросов</button>
                <button type="button" onClick={() => selectTab("tests")} className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:border-indigo-300">
                  Перейти к тестам
                </button>
              </div>
            </section>
          )
        )}

        {tab === "labs" && (
          <section className="space-y-3">
            <div className="card p-5">
              <h2 className="text-lg font-bold">Интерактивные лабораторные</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Пошаговые лабораторные работы по этому предмету: задания внутри сессии, ответы и проверка преподавателем.
              </p>
            </div>
            <Labs subject={slug} />
          </section>
        )}

        {tab === "attestations" && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-600">
                <ClipboardList className="h-4 w-4" /> Аттестации
              </div>
              <h2 className="mt-1.5 font-serif text-xl font-semibold">Коллоквиумы, экзамены, зачёты и контрольные</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Открывайте аттестацию по этапам: теория с конспектом ответа, проверяемые тесты и задачи с эталонным решением. Прогресс сохраняется автоматически.
              </p>
            </div>
            <AttestationList subjectSlug={slug} subjectName={subject?.name} />
          </section>
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
