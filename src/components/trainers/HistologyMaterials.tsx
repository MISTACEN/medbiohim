"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, ClipboardList, Download, FileText, Image as ImageIcon, Loader2, Search, X } from "lucide-react";
import JSZip from "jszip";
import { fetchMaterialFile, getTrainerImageUrl, hasToken } from "@/lib/api";
import { listSubjectMaterials, listTrainerFeed, type SubjectMaterial } from "@/lib/content-api";

type Kind = "doc" | "photo";
type Category = "scheme" | "method" | "tests" | "exam" | "other" | "photo";
type Tab = "all" | "doc" | "photo" | "scheme" | "method" | "tests" | "exam" | "other";
type Item = SubjectMaterial & { kind: Kind; category: Category; currentSemester?: boolean };

function categoryOf(m: SubjectMaterial): Category {
  const k = String(m.source_key || "");
  if (k.startsWith("histology-em-")) return "scheme";
  if (k.includes("-scheme-") || k.includes("-spinal-schemes") || k.includes("-gif-")) return "scheme";
  if (k.includes("-method-")) return "method";
  if (k.includes("-test-") || k.includes("-fed-") || k.includes("-control-")) return "tests";
  if (k.includes("-exam-") || k.includes("-specimen-list")) return "exam";
  return "other";
}

function categoryLabel(c: Category): string {
  switch (c) {
    case "scheme": return "Схемы и ЭМ";
    case "method": return "Методички";
    case "tests": return "Тесты и контроль";
    case "exam": return "Экзамен и препараты";
    case "photo": return "Фото препаратов";
    default: return "Прочее";
  }
}

function categoryIcon(c: Category) {
  if (c === "method") return <BookOpen className="h-5 w-5" />;
  if (c === "tests" || c === "exam") return <ClipboardList className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
}

function DocumentView({ blob, title }: { blob: Blob; title: string }) {
  const [text, setText] = useState<string[]>([]);
  const [html, setHtml] = useState<string | null>(null);
  const [imgs, setImgs] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (blob.type.includes("html")) {
          setHtml(await blob.text());
          return;
        }
        const z = await JSZip.loadAsync(blob);
        const xml = await z.file("word/document.xml")?.async("string");
        if (!xml) throw new Error("Документ не содержит читаемого DOCX-текста.");
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        const ps = Array.from(doc.getElementsByTagNameNS(ns, "p"));
        const rows = ps.map((p) => Array.from(p.getElementsByTagNameNS(ns, "t")).map((n) => n.textContent || "").join("")).filter(Boolean);
        const media = Object.keys(z.files).filter((n) => n.startsWith("word/media/"));
        const data: string[] = [];
        for (const n of media) {
          const f = z.file(n); if (!f) continue;
          const b64 = await f.async("base64");
          const ext = n.split(".").pop()?.toLowerCase() || "png";
          const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : "image/png";
          data.push("data:" + mime + ";base64," + b64);
        }
        if (alive) { setText(rows); setImgs(data); }
      } catch (e) {
        if (alive) setText([e instanceof Error ? e.message : "Не удалось прочитать документ."]);
      } finally { if (alive) setBusy(false); }
    })();
    return () => { alive = false; };
  }, [blob]);

  if (busy) return <div className="flex min-h-[50vh] items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Открываем документ…</div>;
  if (html) return <iframe title={title} srcDoc={html} className="min-h-[70vh] w-full rounded-2xl border bg-white" sandbox="" />;
  return <article className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-sm sm:p-10">
    <h3 className="mb-7 text-center text-xl font-bold text-slate-900">{title}</h3>
    <div className="space-y-3 text-[15px] leading-7 text-slate-800">{text.map((x, i) => <p key={i}>{x}</p>)}</div>
    {imgs.length > 0 && <div className="mt-8 space-y-6 border-t pt-7">{imgs.map((src, i) => <img key={i} src={src} alt="" className="mx-auto max-h-[70vh] rounded-xl border object-contain" />)}</div>}
  </article>;
}

export default function HistologyMaterials() {
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Item | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllCourse, setShowAllCourse] = useState(false);

  useEffect(() => {
    if (!hasToken()) { setLoading(false); return; }
    Promise.all([listSubjectMaterials({ subjectSlug: "histology" }), listTrainerFeed("histology", "mbh", 500)])
      .then(([m, f]) => {
        if (!m.ok) { setError(m.error.message); return; }
        const feedItems: any[] = f.ok ? f.data.items || [] : [];
        const currentCardNames = new Set(feedItems.filter((x) => x.plan_topic_id).map((x) => String(x.preparation?.name || "").trim()));
        const docs: Item[] = (m.data.items || []).map((x) => ({ ...x, kind: "doc", category: categoryOf(x) }));
        const photos: Item[] = feedItems.map((x: any) => ({
          id: String(x.id), subject_id: x.subject_id || "", subject_name: "Гистология", subject_slug: "histology",
          type: "image", title: x.preparation?.name || "Микропрепарат", source_key: x.source_key || null,
          module_title: x.plan_module_title || null, topic_title: x.plan_topic_title || null,
          kind: "photo", category: "photo",
        }));
        // Keep the full ZIP in the database, but the default UI is strictly the
        // current 3rd-semester plan. Next-semester cards stay available via the
        // explicit "Весь курс" switch.
        setItems([...docs.map((x) => ({
          ...x,
          currentSemester: (() => {
            const k = String(x.source_key || "");
            const n = k.match(/histology-zip-(?:scheme|gif)-(\d+)/)?.[1];
            if (n && Number(n) > 9) return false;
            if (k.startsWith("histology-em-")) return currentCardNames.has(String(x.title || "").trim());
            return true;
          })(),
        })), ...photos.map((x: any) => ({ ...x, currentSemester: !!x.plan_topic_id }))] as Item[]);

      })
      .catch(() => setError("Не удалось загрузить материалы."))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((x) => {
      const tabOk = tab === "all" || tab === x.kind || tab === x.category;
      const semesterOk = showAllCourse || x.currentSemester !== false;
      const text = [x.title, x.module_title, x.topic_title, x.source_key].filter(Boolean).join(" ").toLowerCase();
      return tabOk && semesterOk && (!needle || text.includes(needle));
    }).sort((a, b) => {
      const at = a.topic_title || a.module_title || "Без темы";
      const bt = b.topic_title || b.module_title || "Без темы";
      return at.localeCompare(bt, "ru") || a.category.localeCompare(b.category, "ru") || a.title.localeCompare(b.title, "ru");
    });
  }, [items, tab, q, showAllCourse]);

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const x of visible) {
      const key = x.topic_title || x.module_title || "Материалы без привязки к текущему учебному плану";
      const arr = map.get(key) || []; arr.push(x); map.set(key, arr);
    }
    return [...map.entries()];
  }, [visible]);

  async function open(x: Item) {
    setActive(x); setBlob(null); setPhoto(null);
    if (x.kind === "doc") setBlob(await fetchMaterialFile(x.id));
    else setPhoto(await getTrainerImageUrl(x.id));
  }

  const tabs: Array<[Tab, string]> = [
    ["all", "Все"], ["scheme", "Схемы и ЭМ"], ["method", "Методички"], ["tests", "Тесты"], ["exam", "Экзамен"], ["photo", "Фото препаратов"]
  ];

  if (loading) return <div className="card p-8 text-sm text-slate-500">Загрузка материалов…</div>;

  return <div className="space-y-5">
    <section className="card p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="text-lg font-bold">Материалы по гистологии</h2><p className="mt-1 text-sm text-slate-500">3 семестр · материалы разложены по темам учебного плана. Материалы следующих семестров не смешиваются с текущим.</p></div>
        <label className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти материал…" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pl-9 text-sm text-slate-900 placeholder:text-slate-400" /></label>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {tabs.map(([k,l]) => <button key={k} type="button" onClick={() => setTab(k)} className={"shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold " + (tab === k ? "border-indigo-600 bg-indigo-600 text-white" : "bg-white text-slate-700")}>{l}</button>)}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-800">
        <span>{showAllCourse ? "Показан весь архив курса, включая материалы следующего семестра." : "Показан только текущий 3 семестр."}</span>
        <button type="button" onClick={() => setShowAllCourse((v) => !v)} className="shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 font-semibold text-indigo-700">
          {showAllCourse ? "Только 3 семестр" : "Весь курс"}
        </button>
      </div>
      {error && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    </section>

    {grouped.length === 0 ? <div className="card p-8 text-center text-sm text-slate-500">По выбранному фильтру материалов нет.</div> :
      grouped.map(([topic, group]) => (
        <section key={topic} className="card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="font-bold text-slate-900">{topic}</h3><p className="text-xs text-slate-500">{group.length} материалов</p></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.map((x) => <button key={x.id} type="button" onClick={() => void open(x)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">{x.kind === "photo" ? <ImageIcon className="h-5 w-5" /> : categoryIcon(x.category)}</div>
                <div className="min-w-0"><h4 className="line-clamp-2 font-semibold text-slate-900">{x.title}</h4><p className="mt-1 text-xs text-slate-500">{x.kind === "photo" ? "Фото препарата" : categoryLabel(x.category)}</p></div>
              </div>
            </button>)}
          </div>
        </section>
      ))
    }

    {active && <div className="fixed inset-0 z-[70] bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5" onMouseDown={() => setActive(null)}>
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-slate-100 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 border-b bg-white px-4 py-4 sm:px-5">
          <div className="min-w-0"><div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{active.kind === "photo" ? "Фото препарата" : categoryLabel(active.category)}</div><h2 className="mt-1 break-words font-bold text-slate-900">{active.title}</h2>{active.topic_title && <div className="mt-1 text-xs text-slate-500">{active.topic_title}</div>}</div>
          <div className="flex shrink-0 gap-2">
            {active.kind === "doc" && active.source?.download_url && <a href={active.source.download_url} target="_blank" rel="noreferrer" className="rounded-xl border bg-white p-2 text-slate-600" title="Открыть оригинал"><Download className="h-4 w-4" /></a>}
            <button type="button" onClick={() => setActive(null)} className="rounded-xl p-2 hover:bg-slate-100" aria-label="Закрыть"><X className="h-5 w-5" /></button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3 sm:p-6">
          {active.kind === "photo"
            ? (photo ? <div className="flex min-h-full items-center justify-center"><img src={photo} alt={active.title} className="max-h-[82vh] max-w-full rounded-2xl object-contain shadow-lg" /> </div> : <div className="flex justify-center pt-20"><Loader2 className="h-6 w-6 animate-spin" /></div>)
            : blob
              ? <DocumentView blob={blob} title={active.title} />
              : <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center text-sm text-slate-500"><p className="font-semibold text-slate-800">Документ пока не доступен для просмотра.</p><p className="mt-1">Если файл не размещён на SpaceWeb, он появится после загрузки папки <code>content/histology</code>.</p>{active.source?.download_url && <a href={active.source.download_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white">Открыть оригинал</a>}</div>}
        </div>
      </div>
    </div>}
  </div>;
