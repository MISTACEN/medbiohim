"use client";

import { useEffect, useState } from "react";
import { FileText, Image as ImageIcon, X, Download, Loader2, Search } from "lucide-react";
import JSZip from "jszip";
import { fetchMaterialFile, getTrainerImageUrl, hasToken } from "@/lib/api";
import { listSubjectMaterials, listTrainerFeed, type SubjectMaterial } from "@/lib/content-api";

type Item = SubjectMaterial & { kind: "doc" | "photo"; imageUrl?: string | null };

function DocxView({ blob, title }: { blob: Blob; title: string }) {
  const [text, setText] = useState<string[]>([]);
  const [imgs, setImgs] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const z = await JSZip.loadAsync(blob);
        const xml = await z.file("word/document.xml")?.async("string");
        if (!xml) throw new Error("DOCX повреждён или пуст.");
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const ps = Array.from(doc.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "p"));
        const rows = ps.map((p) => Array.from(p.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "t")).map((n) => n.textContent || "").join("")).filter(Boolean);
        const media = Object.keys(z.files).filter((n) => n.startsWith("word/media/"));
        const data: string[] = [];
        for (const n of media) {
          const f = z.file(n);
          if (!f) continue;
          const b64 = await f.async("base64");
          const ext = n.split(".").pop()?.toLowerCase() || "png";
          const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : "image/png";
          data.push("data:" + mime + ";base64," + b64);
        }
        if (alive) { setText(rows); setImgs(data); }
      } catch (e) { if (alive) setText([e instanceof Error ? e.message : "Не удалось прочитать DOCX."]); }
      finally { if (alive) setBusy(false); }
    })();
    return () => { alive = false; };
  }, [blob]);

  if (busy) return <div className="flex min-h-[50vh] items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Открываем документ…</div>;
  return <article className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-sm sm:p-10">
    <h3 className="mb-7 text-center text-xl font-bold text-slate-900">{title}</h3>
    <div className="space-y-3 text-[15px] leading-7 text-slate-800">{text.map((x, i) => <p key={i}>{x}</p>)}</div>
    {imgs.length > 0 && <div className="mt-8 space-y-6 border-t pt-7">{imgs.map((src, i) => <img key={i} src={src} alt="" className="mx-auto max-h-[70vh] rounded-xl border object-contain" />)}</div>}
  </article>;
}

export default function HistologyMaterials() {
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState<"all" | "doc" | "photo">("all");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Item | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasToken()) { setLoading(false); return; }
    Promise.all([listSubjectMaterials({ subjectSlug: "histology" }), listTrainerFeed("histology", "mbh", 500)])
      .then(async ([m, f]) => {
        const docs: Item[] = m.ok ? (m.data.items || []).filter((x) => String(x.source_key || "").startsWith("histology-em-")).map((x) => ({ ...x, kind: "doc" as const })) : [];
        const photos: Item[] = f.ok ? (f.data.items || []).map((x: any) => ({ id: String(x.id), subject_id: x.subject_id || "", subject_name: "Гистология", subject_slug: "histology", type: "image", title: x.preparation?.name || "Микропрепарат", source_key: x.source_key || null, kind: "photo" as const })) : [];
        setItems([...docs, ...photos]);
      }).finally(() => setLoading(false));
  }, []);

  const visible = items.filter((x) => (tab === "all" || x.kind === tab) && (!q.trim() || x.title.toLowerCase().includes(q.trim().toLowerCase())));

  async function open(x: Item) {
    setActive(x); setBlob(null); setPhoto(null);
    if (x.kind === "doc") setBlob(await fetchMaterialFile(x.id));
    else setPhoto(await getTrainerImageUrl(x.id));
  }

  if (loading) return <div className="card p-8 text-sm text-slate-500">Загрузка материалов…</div>;

  return <div className="space-y-5">
    <section className="card p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="text-lg font-bold">Материалы по гистологии</h2><p className="mt-1 text-sm text-slate-500">Все нужное внутри предмета: документы, микропрепараты и электронограммы.</p></div>
        <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти…" className="w-64 rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm" /></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {([["all","Все"],["doc","Документы"],["photo","Фото препаратов"]] as const).map(([k,l]) => <button key={k} type="button" onClick={() => setTab(k)} className={"rounded-xl border px-4 py-2 text-sm font-semibold " + (tab === k ? "border-indigo-600 bg-indigo-600 text-white" : "bg-white text-slate-700")}>{l}</button>)}
      </div>
    </section>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((x) => <button key={x.id} type="button" onClick={() => void open(x)} className="card p-5 text-left transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">{x.kind === "photo" ? <ImageIcon className="h-6 w-6" /> : <FileText className="h-6 w-6" />}</div>
        <h3 className="mt-4 line-clamp-2 font-semibold text-slate-900">{x.title}</h3>
        <p className="mt-2 text-xs text-slate-500">{x.kind === "photo" ? "Фото препарата · открыть" : "DOCX · открыть на сайте"}</p>
      </button>)}
    </div>
    {active && <div className="fixed inset-0 z-[70] bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6" onMouseDown={() => setActive(null)}>
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-slate-100 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b bg-white px-5 py-4">
          <div><div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{active.kind === "photo" ? "Фото препарата" : "Документ"}</div><h2 className="mt-1 font-bold text-slate-900">{active.title}</h2></div>
          <div className="flex gap-2">
            {active.kind === "doc" && <button type="button" onClick={() => blob && window.open(URL.createObjectURL(blob), "_blank")} className="rounded-xl border bg-white p-2 text-slate-600" title="Открыть оригинал"><Download className="h-4 w-4" /></button>}
            <button type="button" onClick={() => setActive(null)} className="rounded-xl p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-6">
          {active.kind === "photo" ? (photo ? <div className="flex min-h-full items-center justify-center"><img src={photo} alt={active.title} className="max-h-[82vh] max-w-full rounded-2xl object-contain shadow-lg" /></div> : <div className="flex justify-center pt-20"><Loader2 className="h-6 w-6 animate-spin" /></div>) :
            blob ? <DocxView blob={blob} title={active.title} /> : <div className="flex justify-center pt-20 text-sm text-slate-500">Не удалось загрузить документ.</div>}
        </div>
      </div>
    </div>}
  </div>;
}
