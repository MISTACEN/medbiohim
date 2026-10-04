"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bold, Italic, Underline, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, AlignLeft, AlignCenter, AlignRight, Link2,
  ImagePlus, Video, FileText, UploadCloud, Search, Save, Eye, EyeOff,
  X, ExternalLink, Sparkles, Undo2, Redo2,
} from "lucide-react";
import {
  adminDeleteLecture, adminGenerateLecture, adminListLectures, adminPublishLecture,
  adminRejectLecture, adminUpdateLecture, listSubjectsCatalog, uploadFile, getFileDownload, fileDownloadUrl,
  type Lecture,
} from "@/lib/api";

type Subject = { slug: string; name: string };
type LessonType = "lecture" | "practice" | "laboratory" | "seminar";
const LESSON_TYPES: Record<LessonType, string> = { lecture: "Лекция", practice: "Практика", laboratory: "Лабораторная", seminar: "Семинар" };
type Attachment = {
  id?: string;
  file_id?: string;
  type: "image"|"video"|"pdf"|"file";
  name: string;
  url?: string;
  mime_type?: string;
  page?: number;
  caption?: string;
};
type SearchResult = { title: string; url: string; thumb?: string; mime?: string; isVideo?: boolean };

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}
function sanitizeEditorHtml(raw: string): string {
  if (typeof window === "undefined") return raw;
  const doc = new DOMParser().parseFromString(raw, "text/html");
  const allowed = new Set(["P","DIV","BR","STRONG","B","EM","I","U","S","STRIKE","H1","H2","H3","H4","UL","OL","LI","BLOCKQUOTE","A","IMG","VIDEO","IFRAME","HR","SPAN","FONT"]);
  const walk = (root: Node) => {
    [...root.childNodes].forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (!allowed.has(el.tagName)) {
          const parent = el.parentNode;
          if (parent) { while (el.firstChild) parent.insertBefore(el.firstChild, el); parent.removeChild(el); }
          return;
        }
        [...el.attributes].forEach((a) => {
          const keep = a.name === "href" || a.name === "src" || a.name === "alt" || a.name === "title" ||
            a.name === "target" || a.name === "rel" || a.name === "width" || a.name === "height" ||
            a.name === "data-mbh-video" || a.name === "data-mbh-pdf" || a.name === "data-page";
          if (!keep) el.removeAttribute(a.name);
        });
        if (el.hasAttribute("href") || el.hasAttribute("src")) {
          const attr = el.hasAttribute("href") ? "href" : "src";
          try {
            const u = new URL(el.getAttribute(attr) || "", window.location.origin);
            if (!["http:","https:","blob:"].includes(u.protocol)) el.removeAttribute(attr);
          } catch { el.removeAttribute(attr); }
        }
        if (el.tagName === "IFRAME") {
          const src = el.getAttribute("src") || "";
          if (!/^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|rutube\.ru|vk\.com)\//i.test(src)) el.remove();
          else { el.setAttribute("allowfullscreen","true"); el.setAttribute("loading","lazy"); }
        }
        if (el.tagName === "A") { el.setAttribute("target","_blank"); el.setAttribute("rel","noreferrer"); }
      }
      if (node.parentNode) walk(node);
    });
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
function markdownToEditorHtml(md: string): string {
  let s = String(md || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  s = s.replace(/\`\`\`image\n([\s\S]*?)\n\`\`\`/g, (_m:string, raw:string) => {
    try { const d=JSON.parse(raw); return `<p><img src="${String(d.url||"")}" alt="${String(d.caption||"")}" /></p>`; } catch { return ""; }
  });
  s = s.replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/^## (.+)$/gm,"<h2>$1</h2>").replace(/^# (.+)$/gm,"<h1>$1</h1>");
  s = s.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>");
  s = s.replace(/^> (.+)$/gm,"<blockquote>$1</blockquote>");
  s = s.replace(/^- (.+)$/gm,"<li>$1</li>");
  s = s.replace(/(<li>.*<\/li>\n?)+/g,(b:string)=>`<ul>${b}</ul>`);
  s = s.replace(/\n{2,}/g,"</p><p>").replace(/\n/g,"<br>");
  return "<p>"+s+"</p>";
}

function htmlToPlainMarkdown(html: string): string {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const render = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent || "").replace(/\u00a0/g, " ");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const inner = [...el.childNodes].map(render).join("");
    switch (el.tagName) {
      case "H1": return "# "+inner.trim()+"\n\n";
      case "H2": return "## "+inner.trim()+"\n\n";
      case "H3": return "### "+inner.trim()+"\n\n";
      case "STRONG": case "B": return "**"+inner+"**";
      case "EM": case "I": return "*"+inner+"*";
      case "BLOCKQUOTE": return "> "+inner.trim()+"\n\n";
      case "LI": return "- "+inner.trim()+"\n";
      case "P": case "DIV": return inner.trim()+"\n\n";
      case "BR": return "\n";
      case "A": return "["+inner+"]("+(el.getAttribute("href")||"")+")";
      case "IMG": return `\n\`\`\`image\n${JSON.stringify({url:el.getAttribute("src"),caption:el.getAttribute("alt")||""})}\n\`\`\`\n`;
      default: return inner;
    }
  };
  return [...doc.body.childNodes].map(render).join("").replace(/\n{3,}/g,"\n\n").trim();
}

function insertVideoEmbedUrl(url: string): string {
  const raw = url.trim();
  const yt = raw.match(/(?:youtube\\.com\\/(?:watch\\?v=|embed\\/)|youtu\\.be\\/)([A-Za-z0-9_-]{6,})/i);
  if (yt) return "https://www.youtube-nocookie.com/embed/" + yt[1];
  const rt = raw.match(/rutube\\.ru\\/(?:video\\/|play\\/)([A-Za-z0-9_-]+)/i);
  if (rt) return "https://rutube.ru/play/embed/" + rt[1];
  return "";
}

function RichEditor({
  value, onChange, attachments, setAttachments, subject, topic,
}: {
  value: string; onChange: (v:string)=>void; attachments: Attachment[];
  setAttachments: (v:Attachment[])=>void; subject: Subject|null; topic: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState("");
  const [mediaTab, setMediaTab] = useState<"image"|"video">("image");
  const [page, setPage] = useState("1");
  const [link, setLink] = useState("");
  const [busyUpload, setBusyUpload] = useState(false);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value;
  }, [value]);

  function sync() {
    if (!ref.current) return;
    const clean = sanitizeEditorHtml(ref.current.innerHTML);
    if (ref.current.innerHTML !== clean) ref.current.innerHTML = clean;
    onChange(clean);
  }
  function command(cmd: string, val?: string) {
    ref.current?.focus(); exec(cmd,val); sync();
  }
  function insertHtml(html: string) {
    ref.current?.focus();
    document.execCommand("insertHTML", false, html);
    sync();
  }
  function insertVideoLink() {
    const embed = insertVideoEmbedUrl(link);
    if (!embed) {
      alert("Поддерживаются ссылки YouTube и Rutube.");
      return;
    }
    insertHtml(`<p><iframe src="${embed}" title="Видео" loading="lazy" allowfullscreen></iframe></p>`);
    setLink("");
  }
  function insertLink() {
    if (!link.trim()) return;
    command("createLink", link.trim());
    setLink("");
  }
  async function uploadAndInsert(file: File) {
    setBusyUpload(true);
    try {
      const r:any = await uploadFile(file, undefined, "mbh");
      if (!r.ok) throw new Error(r.error?.message || "Не удалось загрузить файл");
      const id = String(r.data?.file?.id || "");
      if (!id) throw new Error("Сервер не вернул ID файла");
      const d:any = await getFileDownload(id);
      const url = fileDownloadUrl(id);
      const mime = String(r.data?.file?.mime_type || file.type || "");
      const type:Attachment["type"] = mime === "application/pdf" ? "pdf" : mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : "file";
      const att:Attachment = {file_id:id,type,name:file.name,url,mime_type:mime,page:type==="pdf"?Number(page)||1:undefined};
      setAttachments([...attachments,att]);
      if (type==="image" && url) insertHtml(`<p><img src="${url}" alt="${file.name}" title="${file.name}" /></p>`);
      else if (type==="video" && url) insertHtml(`<p><video controls src="${url}" title="${file.name}" style="max-width:100%"></video></p>`);
      else if (type==="pdf" && url) insertHtml(`<p><a href="${url}#page=${Number(page)||1}" target="_blank" rel="noreferrer">📄 ${file.name} — открыть PDF, стр. ${Number(page)||1}</a></p>`);
      else if (url) insertHtml(`<p><a href="${url}" target="_blank" rel="noreferrer">${file.name}</a></p>`);
    } catch(e) {
      alert(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally { setBusyUpload(false); }
  }
  async function searchWeb() {
    const q = (query.trim() || [subject?.name, topic, mediaTab==="video"?"lecture video":"histology medical diagram"].filter(Boolean).join(" ")).trim();
    if (!q) return;
    setSearching(true); setResults([]);
    try {
      const url = "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch="+encodeURIComponent(q)+"&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=640&format=json&origin=*";
      const data = await fetch(url).then(r=>r.json());
      const rows = Object.values(data?.query?.pages || {}) as any[];
      setResults(rows.map((x:any)=>({
        title:String(x.title||"").replace(/^File:/,""),
        url:String(x.imageinfo?.[0]?.url||""),
        thumb:String(x.imageinfo?.[0]?.thumburl||""),
        mime:String(x.imageinfo?.[0]?.mime||""),
        isVideo:String(x.imageinfo?.[0]?.mime||"").startsWith("video/"),
      })).filter((x:SearchResult)=>x.url && (mediaTab==="image" ? !x.isVideo : x.isVideo)));
    } catch { setResults([]); }
    finally { setSearching(false); }
  }
  function useResult(r: SearchResult) {
    if (mediaTab==="image") {
      insertHtml(`<p><img src="${r.url}" alt="${r.title}" title="${r.title}" /></p>`);
      setAttachments([...attachments,{type:"image",name:r.title,url:r.url,caption:r.title}]);
    } else {
      insertHtml(`<p><a href="${r.url}" target="_blank" rel="noreferrer">🎥 ${r.title}</a></p>`);
      setAttachments([...attachments,{type:"video",name:r.title,url:r.url,caption:r.title}]);
    }
  }

  const toolbar = [
    ["bold","Ж","Жирный",Bold],["italic","К","Курсив",Italic],["underline","П","Подчёркивание",Underline],["strikeThrough","З","Зачёркивание",Strikethrough],
  ] as const;

  return (
    <div className="lecture-editor-shell">
      <div className="lecture-editor-toolbar">
        {toolbar.map(([cmd,label,title,Icon])=><button key={cmd} type="button" title={title} onClick={()=>command(cmd)}><Icon className="h-4 w-4"/></button>)}
        <span className="lecture-editor-divider"/>
        <select title="Размер / заголовок" onChange={e=>command("formatBlock",e.target.value)} defaultValue="p">
          <option value="p">Обычный</option><option value="h1">Заголовок 1</option><option value="h2">Заголовок 2</option><option value="h3">Заголовок 3</option>
        </select>
        <select title="Размер текста" onChange={e=>command("fontSize",e.target.value)} defaultValue="3">
          <option value="2">Маленький</option><option value="3">Обычный</option><option value="4">Крупный</option><option value="5">Очень крупный</option>
        </select>
        <button type="button" title="Маркированный список" onClick={()=>command("insertUnorderedList")}><List className="h-4 w-4"/></button>
        <button type="button" title="Нумерованный список" onClick={()=>command("insertOrderedList")}><ListOrdered className="h-4 w-4"/></button>
        <button type="button" title="Цитата" onClick={()=>command("formatBlock","blockquote")}><Quote className="h-4 w-4"/></button>
        <button type="button" title="По левому краю" onClick={()=>command("justifyLeft")}><AlignLeft className="h-4 w-4"/></button>
        <button type="button" title="По центру" onClick={()=>command("justifyCenter")}><AlignCenter className="h-4 w-4"/></button>
        <button type="button" title="По правому краю" onClick={()=>command("justifyRight")}><AlignRight className="h-4 w-4"/></button>
        <span className="lecture-editor-divider"/>
        <input value={link} onChange={e=>setLink(e.target.value)} placeholder="https://..." className="lecture-editor-link-input" />
        <button type="button" title="Вставить ссылку" onClick={insertLink}><Link2 className="h-4 w-4"/></button><button type="button" title="Вставить видео по ссылке" onClick={insertVideoLink}><Video className="h-4 w-4"/></button>
        <label title="Загрузить изображение" className="lecture-editor-tool cursor-pointer"><ImagePlus className="h-4 w-4"/><input type="file" accept="image/*" className="hidden" onChange={e=>{const x=e.target.files?.[0];if(x)void uploadAndInsert(x);e.currentTarget.value=""}}/></label>
        <label title="Загрузить видео" className="lecture-editor-tool cursor-pointer"><Video className="h-4 w-4"/><input type="file" accept="video/*" className="hidden" onChange={e=>{const x=e.target.files?.[0];if(x)void uploadAndInsert(x);e.currentTarget.value=""}}/></label>
        <label title="Загрузить PDF" className="lecture-editor-tool cursor-pointer"><FileText className="h-4 w-4"/><input type="file" accept="application/pdf" className="hidden" onChange={e=>{const x=e.target.files?.[0];if(x)void uploadAndInsert(x);e.currentTarget.value=""}}/></label>
        <button type="button" title="Отменить" onClick={()=>command("undo")}><Undo2 className="h-4 w-4"/></button>
        <button type="button" title="Повторить" onClick={()=>command("redo")}><Redo2 className="h-4 w-4"/></button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="lecture-editor-content"
        onInput={sync}
        onPaste={(e)=>{e.preventDefault();const html=e.clipboardData.getData("text/html");const text=e.clipboardData.getData("text/plain");insertHtml(sanitizeEditorHtml(html||`<p>${text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/\n/g,"<br/>")}</p>`));}}
      />
      <div className="lecture-editor-media">
        <div className="lecture-media-head"><div><b>Медиа и поиск</b><span>поиск учитывает предмет и тему лекции</span></div><Sparkles className="h-4 w-4"/></div>
        <div className="lecture-media-tabs"><button type="button" className={mediaTab==="image"?"active":""} onClick={()=>setMediaTab("image")}>Картинки</button><button type="button" className={mediaTab==="video"?"active":""} onClick={()=>setMediaTab("video")}>Видео</button></div>
        <div className="lecture-media-search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={subject?.name ? `${subject.name} · ${topic || "тема"}` : "Тема, препарат, процесс…"} onKeyDown={e=>{if(e.key==="Enter")void searchWeb()}}/><button type="button" onClick={()=>void searchWeb()} disabled={searching}><Search className="h-4 w-4"/>{searching?"Ищу…":"Найти в интернете"}</button></div>
        {results.length>0&&<div className="lecture-search-results">{results.map((r,i)=><button key={i} type="button" className="lecture-search-result" onClick={()=>useResult(r)}>{r.thumb&&<img src={r.thumb} alt="" />}{r.isVideo&&<Video className="h-5 w-5"/>}<span>{r.title}</span><ExternalLink className="h-3.5 w-3.5"/></button>)}</div>}
        <div className="lecture-editor-urlrow"><input value={page} onChange={e=>setPage(e.target.value.replace(/\D/g,""))} inputMode="numeric" placeholder="Стр. PDF"/><span>страница PDF</span><button type="button" onClick={()=>{if(link.trim())insertHtml(`<p><a href="${link.trim()}#page=${Number(page)||1}" target="_blank" rel="noreferrer">📄 Открыть PDF · стр. ${Number(page)||1}</a></p>`);setLink("")}}>Вставить PDF-ссылку</button></div>
        <div className="lecture-attachments"><b>Прикреплено к лекции</b>{attachments.length===0?<span>пока нет</span>:attachments.map((a,i)=><span key={i} className="lecture-attachment">{a.type==="pdf"?"PDF":a.type==="image"?"IMG":a.type==="video"?"VIDEO":"FILE"} · {a.name}{a.type==="pdf"&&a.page? ` · стр. ${a.page}`:""}<button type="button" onClick={()=>setAttachments(attachments.filter((_,j)=>j!==i))}><X className="h-3 w-3"/></button></span>)}</div>
      </div>
      {busyUpload&&<div className="lecture-uploading"><UploadCloud className="h-4 w-4"/> Загружаю файл…</div>}
    </div>
  );
}

export default function AdminLecturesPage() {
  const [items,setItems]=useState<Lecture[]>([]);
  const [status,setStatus]=useState("pending_review");
  const [subjects,setSubjects]=useState<Subject[]>([]);
  const [slug,setSlug]=useState("");
  const [topic,setTopic]=useState("");
  const [notes,setNotes]=useState("");
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState<string|null>(null);
  const [editId,setEditId]=useState<string|null>(null);
  const [editTitle,setEditTitle]=useState("");
  const [editTopic,setEditTopic]=useState("");\n  const [editLessonType,setEditLessonType]=useState<LessonType>("lecture");
  const [editSummary,setEditSummary]=useState("");
  const [editBody,setEditBody]=useState("");
  const [editAttachments,setEditAttachments]=useState<Attachment[]>([]);
  const currentSubject=useMemo(()=>subjects.find(s=>s.slug===slug)||null,[subjects,slug]);

  async function reload(st=status){const r:any=await adminListLectures(st==="all"?undefined:st, subjectFilter || undefined);if(r.ok)setItems((r.data.items||[]) as Lecture[]);else setMsg(String(r.error?.message||"Ошибка"));}
  useEffect(()=>{void reload();void listSubjectsCatalog().then((r:any)=>{if(r.ok){const list=((r.data?.items||[]) as any[]).map(x=>({slug:String(x.slug||"").trim(),name:String(x.name||"")})).filter((x:Subject)=>x.slug);setSubjects(list);if(!slug&&list[0])setSlug(list[0].slug);}})},[status]);
  async function onGenerate(e:FormEvent){e.preventDefault();if(!topic.trim())return setMsg("Укажите тему");setBusy(true);setMsg(null);const r:any=await adminGenerateLecture({subject_slug:slug,topic:topic.trim(),lesson_type:lessonType,notes:notes.trim()||undefined});setBusy(false);if(!r.ok)return setMsg(String(r.error?.message||"Ошибка"));setMsg("Черновик создан и отправлен на проверку");setTopic("");await reload();}
  function openEdit(lec:any){setEditId(String(lec.id));setEditTitle(String(lec.title||""));setEditTopic(String(lec.topic||""));setEditLessonType((String(lec.lesson_type||"lecture") as LessonType));setEditSummary(String(lec.summary||""));setEditBody(String(lec.body_html || markdownToEditorHtml(lec.body_md || "")));setEditAttachments(Array.isArray(lec.attachments)?lec.attachments:[]);}
  async function saveEdit(){if(!editId)return;setBusy(true);const r:any=await adminUpdateLecture(editId,{title:editTitle,topic:editTopic,lesson_type:editLessonType,summary:editSummary,body_html:sanitizeEditorHtml(editBody),body_md:htmlToPlainMarkdown(editBody),attachments:editAttachments});setBusy(false);setMsg(r.ok?"Лекция сохранена":"Ошибка сохранения: "+String(r.error?.message||""));if(r.ok){await reload();}}
  const subjectForEdit=subjects.find(s=>s.slug===String((items.find((x:any)=>x.id===editId) as any)?.subject_slug||""))||null;

  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="page-title">Лекции и контент</h1><p className="page-subtitle">Редактор лекций · форматирование · изображения · видео · PDF · поиск по интернету · публикация</p></div><Link href="/admin" className="text-sm text-[var(--primary)]">← Админ</Link></div>
    <form onSubmit={onGenerate} className="card space-y-3 p-5"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[var(--primary)]"/><h2 className="font-bold">Создать лекцию по учебному плану</h2></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm"><span className="mb-1 block text-xs text-[var(--muted)]">Предмет</span><select value={slug} onChange={e=>setSlug(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2">{subjects.map(s=><option key={s.slug} value={s.slug}>{s.name}</option>)}</select></label><label className="text-sm"><span className="mb-1 block text-xs text-[var(--muted)]">Тип занятия</span><select value={lessonType} onChange={e=>setLessonType(e.target.value as LessonType)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2">{Object.entries(LESSON_TYPES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="text-sm"><span className="mb-1 block text-xs text-[var(--muted)]">Тема</span><input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Тема из учебного плана" className="w-full rounded-xl border border-[var(--border)] px-3 py-2"/></label></div><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} className="w-full rounded-xl border border-[var(--border)] px-3 py-2" placeholder="Дополнительные акценты…"/><button disabled={busy} className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white">{busy?"Создание…":"Сгенерировать черновик"}</button></form>
    {msg&&<div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm">{msg}</div>}
    <div className="flex flex-wrap items-center gap-2"><select value={subjectFilter} onChange={e=>setSubjectFilter(e.target.value)} className="rounded-full border px-3 py-1.5 text-xs font-semibold"><option value="">Все предметы</option>{subjects.map(s=><option key={s.slug} value={s.slug}>{s.name}</option>)}</select>{["pending_review","published","rejected","all"].map(s=><button key={s} type="button" onClick={()=>setStatus(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status===s?"bg-[var(--primary)] text-white":"border border-[var(--border)]"}`}>{s==="pending_review"?"На проверке":s==="published"?"Опубликовано":s==="rejected"?"Отклонено":"Все"}</button>)}</div>
    <div className="space-y-3">{items.map((lec:any)=><div key={lec.id} className="card space-y-3 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-semibold">{lec.title}</div><div className="mt-1 flex flex-wrap gap-1.5 text-xs"><span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">{lec.subject || "Предмет не указан"}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{LESSON_TYPES[String(lec.lesson_type||"lecture") as LessonType] || "Лекция"}</span><span className="text-[var(--muted)]">{lec.topic || "Тема не указана"} · {lec.status}</span></div></div><div className="flex flex-wrap gap-2">{lec.status!=="published"&&<button type="button" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white" onClick={async()=>{const r:any=await adminPublishLecture(lec.id);setMsg(r.ok?"Опубликовано":String(r.error?.message||"Ошибка"));await reload();}}>Опубликовать</button>}{lec.status==="pending_review"&&<button type="button" className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700" onClick={async()=>{const r:any=await adminRejectLecture(lec.id);setMsg(r.ok?"Отклонено":String(r.error?.message||"Ошибка"));await reload();}}>Отклонить</button>}<button type="button" className="rounded-lg border px-3 py-1.5 text-xs font-semibold" onClick={()=>openEdit(lec)}>{editId===lec.id?"Редактор открыт":"Открыть редактор"}</button><button type="button" className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-600" onClick={async()=>{if(!confirm("Удалить лекцию?"))return;await adminDeleteLecture(lec.id);await reload();}}>Удалить</button></div></div>{lec.summary&&<p className="text-xs text-[var(--muted)]">{lec.summary}</p>}{editId===lec.id&&<div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3"><div className="grid gap-3 sm:grid-cols-2"><input value={editTitle} onChange={e=>setEditTitle(e.target.value)} className="rounded-xl border p-2 text-sm" placeholder="Название лекции"/><input value={editTopic} onChange={e=>setEditTopic(e.target.value)} className="rounded-xl border p-2 text-sm" placeholder="Тема"/><select value={editLessonType} onChange={e=>setEditLessonType(e.target.value as LessonType)} className="rounded-xl border p-2 text-sm">{Object.entries(LESSON_TYPES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><input value={editSummary} onChange={e=>setEditSummary(e.target.value)} className="rounded-xl border p-2 text-sm sm:col-span-2" placeholder="Краткое описание"/></div><div className="mt-3"><RichEditor value={editBody} onChange={setEditBody} attachments={editAttachments} setAttachments={setEditAttachments} subject={subjectForEdit||currentSubject} topic={editTopic}/></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>void saveEdit()} className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white"><Save className="h-4 w-4"/>{busy?"Сохраняю…":"Сохранить лекцию"}</button><button type="button" className="rounded-xl border px-4 py-2.5 text-sm" onClick={()=>setEditId(null)}>Закрыть</button></div></div>}{Array.isArray(lec.attachments)&&lec.attachments.length>0&&editId!==lec.id&&<div className="flex flex-wrap gap-2">{lec.attachments.map((a:any,i:number)=><span key={i} className="rounded-full border px-2 py-1 text-xs">{String(a.type||"file").toUpperCase()} · {String(a.name||"файл")}</span>)}</div>}</div>)}{items.length===0&&<div className="card p-6 text-sm text-[var(--muted)]">Пусто в этом фильтре.</div>}</div>
  </div>;
}
