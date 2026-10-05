"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, ClipboardList, FileText, Image as ImageIcon, Loader2, Search, X } from "lucide-react";
import JSZip from "jszip";
import { fetchMaterialFile, getTrainerImageUrl, hasToken } from "@/lib/api";
import { listSubjectMaterials, listTrainerFeed } from "@/lib/content-api";

type Item = any;

function categoryOf(x: Item): string {
  const k = String(x.source_key || "");
  if (k.startsWith("histology-em-") || k.includes("-scheme-") || k.includes("-gif-") || k.includes("-spinal-schemes")) return "scheme";
  if (k.includes("-method-")) return "method";
  if (k.includes("-test-") || k.includes("-fed-") || k.includes("-control-")) return "tests";
  if (k.includes("-exam-") || k.includes("-specimen-list")) return "exam";
  return x.kind === "photo" ? "photo" : "other";
}

const categoryLabel: Record<string, string> = {
  scheme: "Схемы и ЭМ",
  method: "Методички",
  tests: "Тесты и контроль",
  exam: "Экзамен и препараты",
  photo: "Фото препаратов",
  other: "Прочее",
};

function categoryIcon(category: string) {
  if (category === "method") return <BookOpen className="h-5 w-5" />;
  if (category === "tests" || category === "exam") return <ClipboardList className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
}

function DocumentView({ blob, title }: { blob: Blob; title: string }) {
  const [text, setText] = useState<string[]>([]);
  const [html, setHtml] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (blob.type.includes("html")) {
          const value = await blob.text();
          if (alive) setHtml(value);
          return;
        }
        const zip = await JSZip.loadAsync(blob);
        const xml = await zip.file("word/document.xml")?.async("string");
        if (!xml) throw new Error("Документ не содержит читаемого DOCX-текста.");
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        const paragraphs = Array.from(doc.getElementsByTagNameNS(ns, "p"));
        const rows = paragraphs
          .map((p) => Array.from(p.getElementsByTagNameNS(ns, "t")).map((n) => n.textContent || "").join(""))
          .filter(Boolean);
        const media = Object.keys(zip.files).filter((name) => name.startsWith("word/media/"));
        const nextImages: string[] = [];
        for (const name of media) {
          const file = zip.file(name);
          if (!file) continue;
          const b64 = await file.async("base64");
          const ext = name.split(".").pop()?.toLowerCase() || "png";
          const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : "image/png";
          nextImages.push("data:" + mime + ";base64," + b64);
        }
        if (alive) {
          setText(rows);
          setImages(nextImages);
        }
      } catch (error) {
        if (alive) setText([error instanceof Error ? error.message : "Не удалось прочитать документ."]);
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [blob]);

  if (busy) return <div className="flex min-h-[50vh] items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Открываем документ…</div>;
  if (html) return <iframe title={title} srcDoc={html} className="min-h-[70vh] w-full rounded-2xl border bg-white" sandbox="" />;
  return (
    <article className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-sm sm:p-10">
      <h3 className="mb-7 text-center text-xl font-bold text-slate-900">{title}</h3>
      <div className="space-y-3 text-[15px] leading-7 text-slate-800">{text.map((row, index) => <p key={index}>{row}</p>)}</div>
      {images.length > 0 && <div className="mt-8 space-y-6 border-t pt-7">{images.map((src, index) => <img key={index} src={src} alt="" className="mx-auto max-h-[70vh] rounded-xl border object-contain" />)}</div>}
    </article>
  );
}

export default function HistologyMaterials() {
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [active, setActive] = useState<Item | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasToken()) {
      setLoading(false);
      return;
    }

    Promise.all([
      listSubjectMaterials({ subjectSlug: "histology" }),
      listTrainerFeed("histology", "mbh", 500),
    ])
      .then(([materialsResult, feedResult]) => {
        if (!materialsResult.ok) {
          setError(materialsResult.error.message);
          return;
        }

        const feed = feedResult.ok ? (feedResult.data.items || []) : [];
        const currentNames = new Set(
          feed.filter((card: any) => card.plan_topic_id).map((card: any) => String(card.preparation?.name || "").trim()),
        );

        const docs = (materialsResult.data.items || []).map((material: any) => {
          const key = String(material.source_key || "");
          const number = key.match(/histology-zip-(?:scheme|gif)-(\d+)/)?.[1];
          const currentSemester =
            !(number && Number(number) > 9) &&
            (!key.startsWith("histology-em-") || currentNames.has(String(material.title || "").trim()));

          return {
            ...material,
            kind: "doc",
            category: categoryOf(material),
            currentSemester,
          };
        });

        const photos = feed.map((card: any) => ({
          id: String(card.id),
          subject_id: card.subject_id || "",
          subject_name: "Гистология",
          subject_slug: "histology",
          type: "image",
          title: card.preparation?.name || "Микропрепарат",
          source_key: card.source_key || null,
          module_title: card.plan_module_title || null,
          topic_title: card.plan_topic_title || null,
          kind: "photo",
          category: "photo",
          currentSemester: Boolean(card.plan_topic_id),
        }));

        setItems([...docs, ...photos]);
      })
      .catch(() => setError("Не удалось загрузить материалы."))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .filter((item) => {
        const category = item.category;
        const tabOk = tab === "all" || tab === item.kind || tab === category;
        const semesterOk = showAll || item.currentSemester !== false;
        const searchable = [item.title, item.module_title, item.topic_title, item.source_key].filter(Boolean).join(" ").toLowerCase();
        return tabOk && semesterOk && (!needle || searchable.includes(needle));
      })
      .sort((a, b) => {
        const aTopic = a.topic_title || a.module_title || "Материалы без привязки к плану";
        const bTopic = b.topic_title || b.module_title || "Материалы без привязки к плану";
        return aTopic.localeCompare(bTopic, "ru") || a.title.localeCompare(b.title, "ru");
      });
  }, [items, tab, query, showAll]);

  const groups = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of visible) {
      const key = item.topic_title || item.module_title || "Материалы без привязки к текущему учебному плану";
      const group = map.get(key) || [];
      group.push(item);
      map.set(key, group);
    }
    return Array.from(map.entries());
  }, [visible]);

  async function open(item: Item) {
    setActive(item);
    setBlob(null);
    setPhoto(null);
    if (item.kind === "doc") setBlob(await fetchMaterialFile(item.id));
    else setPhoto(await getTrainerImageUrl(item.id));
  }

  const tabs = [
    ["all", "Все"],
    ["scheme", "Схемы и ЭМ"],
    ["method", "Методички"],
    ["tests", "Тесты"],
    ["exam", "Экзамен"],
    ["photo", "Фото препаратов"],
  ];

  if (loading) return <div className="card p-8 text-sm text-slate-500">Загрузка материалов…</div>;

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Материалы по гистологии</h2>
            <p className="mt-1 text-sm text-slate-500">3 семестр · документы, схемы, методички и препараты разложены по темам.</p>
          </div>
          <label className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти материал…" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pl-9 text-sm text-slate-900 placeholder:text-slate-400" />
          </label>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {tabs.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={"shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold " + (tab === key ? "border-indigo-600 bg-indigo-600 text-white" : "bg-white text-slate-700")}>{label}</button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-800">
          <span>{showAll ? "Показан весь архив курса, включая следующий семестр." : "Показан только текущий 3 семестр."}</span>
          <button type="button" onClick={() => setShowAll((value) => !value)} className="shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 font-semibold text-indigo-700">{showAll ? "Только 3 семестр" : "Весь курс"}</button>
        </div>
        {error && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      </section>

      {groups.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">По выбранному фильтру материалов нет.</div>
      ) : (
        groups.map(([topic, group]) => (
          <section key={topic} className="card p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div><h3 className="font-bold text-slate-900">{topic}</h3><p className="text-xs text-slate-500">{group.length} материалов</p></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((item) => (
                <button key={item.id} type="button" onClick={() => void open(item)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">{item.kind === "photo" ? <ImageIcon className="h-5 w-5" /> : categoryIcon(item.category)}</div>
                    <div className="min-w-0"><h4 className="line-clamp-2 font-semibold text-slate-900">{item.title}</h4><p className="mt-1 text-xs text-slate-500">{categoryLabel[item.category] || "Прочее"}</p></div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      {active && (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5" onMouseDown={() => setActive(null)}>
          <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-slate-100 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <header className="flex items-start justify-between gap-3 border-b bg-white px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{active.kind === "photo" ? "Фото препарата" : categoryLabel[active.category] || "Документ"}</div>
                <h2 className="mt-1 break-words font-bold text-slate-900">{active.title}</h2>
                {active.topic_title && <div className="mt-1 text-xs text-slate-500">{active.topic_title}</div>}
              </div>
              <button type="button" onClick={() => setActive(null)} className="rounded-xl p-2 hover:bg-slate-100" aria-label="Закрыть"><X className="h-5 w-5" /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3 sm:p-6">
              {active.kind === "photo"
                ? photo
                  ? <div className="flex min-h-full items-center justify-center"><img src={photo} alt={active.title} className="max-h-[82vh] max-w-full rounded-2xl object-contain shadow-lg" /></div>
                  : <div className="flex justify-center pt-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
                : blob
                  ? <DocumentView blob={blob} title={active.title} />
                  : <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center text-sm text-slate-500"><p className="font-semibold text-slate-800">Документ пока не доступен для просмотра.</p><p className="mt-1">После размещения папки <code>content/histology</code> на SpaceWeb он станет доступен.</p></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
