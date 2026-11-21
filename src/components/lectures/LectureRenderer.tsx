"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChemicalFigure, ChemRichText } from "@/modules/subjects/submodules/chemistry";
import { parseChemSpec } from "@/lib/chemistry/parseChemSpec";
import { chemicalFormulaInHtml } from "@/lib/chemistry/formula";
import { escapeHtml } from "@/lib/html-escape";
// Шим §7.1: TutorMarkdown импортирует mdToHtml из этого модуля (путь стабильный).
export { mdToHtml } from "@/lib/lectures/markdown";
import { mdToHtml } from "@/lib/lectures/markdown";
import { getTrainerFeedCard, getTrainerImageUrl } from "@/lib/api";
import { ImageLightbox } from "@/components/media/ImageLightbox";
import { LeukocyteDifferentialTrainer } from "@/components/lectures/LeukocyteDifferentialTrainer";
import { MiniQuizBlock } from "@/components/lectures/MiniQuizBlock";
import { ExamModePanel } from "@/components/lectures/ExamModePanel";
import { OpenAnswerPractice } from "@/components/lectures/OpenAnswerPractice";
import { AnswerOption } from "@/components/questions/AnswerOption";
import { describeApiError } from "@/lib/errors";
import { markLectureQuizSolved, readLectureProgress, readBlockProgress, setBaseDone, toggleSectionRead, toggleAlgoStep, LECTURE_PROGRESS_EVENT } from "@/lib/lectureProgress";
import { splitLectureBlocks } from "@/lib/lectureProgress";

type KatexApi = { render: (tex: string, el: HTMLElement, opts: object) => void };
type MermaidApi = { initialize: (opts: object) => void; run: (opts: object) => Promise<void> };

function winLibs(): { katex?: KatexApi; mermaid?: MermaidApi } {
  return window as unknown as { katex?: KatexApi; mermaid?: MermaidApi };
}

type ChartSpec = {
  type?: string;
  title?: string;
  labels?: string[];
  values?: number[];
  unit?: string;
};


type FoldSection = { title: string; md: string };

/** Режет markdown на порции по H2-заголовкам (каждая — сворачиваемый блок). */
function splitH2Sections(md: string): FoldSection[] {
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  const out: FoldSection[] = [];
  let cur: FoldSection | null = null;
  for (const line of lines) {
    const h2 = line.match(/^#{2,3}\s+(.+)$/);
    if (h2) {
      if (cur) out.push(cur);
      cur = { title: h2[1].trim(), md: "" };
    } else if (cur) {
      cur.md += line + "\n";
    } else {
      // текст до первого H2 — вводная порция без заголовка
      cur = { title: "", md: line + "\n" };
    }
  }
  if (cur) out.push(cur);
  return out.filter((p) => p.title || p.md.trim());
}

/** id лекции из JSON-спеки фенса (```selfwork / ```exam) или undefined. */
function fenceLectureId(raw: string): string | undefined {
  try {
    const spec = JSON.parse(raw) as { lectureId?: unknown };
    const id = typeof spec?.lectureId === "string" ? spec.lectureId.trim() : "";
    return id || undefined;
  } catch {
    return undefined;
  }
}

function parseBlocks(md: string) {
  const parts: Array<{ kind: "md" | "chart" | "video" | "image" | "mermaid" | "chem" | "quiz" | "leukocyte" | "selfwork" | "exam" | "base" | "algo" | "deep"; content: string }> = [];
  const re = /```(chart|video|image|mermaid|chem|quiz|leukocyte|selfwork|exam|base|algo|deep)\s*\r?\n([\s\S]*?)\r?\n?```/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    if (m.index > last) parts.push({ kind: "md", content: md.slice(last, m.index) });
    parts.push({
      kind: m[1] as "chart" | "video" | "image" | "mermaid" | "chem" | "quiz" | "leukocyte" | "selfwork" | "exam" | "base" | "algo" | "deep",
      content: m[2].trim(),
    });
    last = m.index + m[0].length;
  }
  if (last < md.length) parts.push({ kind: "md", content: md.slice(last) });
  return parts;
}

function ChartBlock({ spec }: { spec: ChartSpec }) {
  const labels = spec.labels || [];
  const values = spec.values || [];
  const max = Math.max(...values, 1);
  return (
    <div className="my-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      {spec.title && <div className="mb-3 text-sm font-semibold">{spec.title}</div>}
      <div className="flex h-40 items-end gap-2">
        {values.map((v, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full rounded-t-md bg-[var(--primary)]/80" style={{ height: `${(v / max) * 100}%`, minHeight: 4 }} title={String(v)} />
            <div className="truncate text-[10px] text-[var(--muted)]">{labels[i] || i}</div>
          </div>
        ))}
      </div>
      {spec.unit && <div className="mt-2 text-xs text-[var(--muted)]">Ед.: {spec.unit}</div>}
    </div>
  );
}

function VideoBlock({ raw }: { raw: string }) {
  let data: { platform?: string; url?: string; caption?: string } = {};
  try {
    data = JSON.parse(raw);
  } catch {
    data = { url: raw };
  }
  const url = data.url || "";
  const caption = data.caption || data.platform || "Видео";
  if (!url) {
    return (
      <div className="my-3 rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)]">
        {caption || "Вставьте URL видео"}
      </div>
    );
  }
  let embed = url;
  try {
    if (url.includes("youtube.com/watch")) {
      const id = new URL(url).searchParams.get("v");
      if (id) embed = `https://www.youtube.com/embed/${id}`;
    } else if (url.includes("youtu.be/")) {
      embed = `https://www.youtube.com/embed/${url.split("youtu.be/")[1]?.split("?")[0]}`;
    } else if (url.includes("rutube.ru/video/")) {
      const id = url.split("/video/")[1]?.split(/[/?]/)[0];
      if (id) embed = `https://rutube.ru/play/embed/${id}`;
    }
  } catch {
    /* keep url */
  }
  const isEmbed = embed.includes("embed") || embed.includes("rutube.ru/play");
  return (
    <div className="my-4 space-y-2">
      {isEmbed ? (
        <div className="aspect-video overflow-hidden rounded-xl border border-[var(--border)]">
          <iframe src={embed} className="h-full w-full" allowFullScreen title={caption} />
        </div>
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-[var(--primary)] underline">
          {caption}: открыть видео
        </a>
      )}
      {caption && <div className="text-xs text-[var(--muted)]">{caption}</div>}
    </div>
  );
}

function ImageBlock({ raw }: { raw: string }) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [card, setCard] = useState<any | null>(null);
  let data: { url?: string; trainerId?: string; caption?: string; align?: string; width?: number } = {};
  try { data = JSON.parse(raw); } catch { data = { url: raw }; }
  const floatSide = data.align === "left" || data.align === "right" ? data.align : null;

  useEffect(() => {
    let cancelled = false;
    setCard(null);
    setFailed(false);
    if (data.trainerId) {
      void Promise.all([getTrainerImageUrl(data.trainerId), getTrainerFeedCard(data.trainerId)]).then(([urlResult, cardResult]) => {
        if (cancelled) return;
        setResolvedUrl(urlResult);
        if (!urlResult) setFailed(true);
        if (cardResult.ok) setCard(cardResult.data?.item || null);
      });
    } else {
      setResolvedUrl(data.url || null);
      if (!data.url) setFailed(true);
    }
    return () => { cancelled = true; };
  }, [data.trainerId, data.url]);

  const preparation = card?.preparation || {};
  const canonicalTitle = String(preparation?.name || "").trim();
  const stain = String(preparation?.stain || "").trim();
  const prompt = String(card?.question?.prompt || "").trim();
  const caption = canonicalTitle || data.caption || "Учебное изображение";
  const detail = [stain, prompt].filter(Boolean).join(" · ");

  return (
    <figure
      className="my-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      style={floatSide ? { float: floatSide, width: `min(${Math.min(Math.max(data.width || 46, 30), 60)}%, 460px)`, margin: "0.4rem 0 0.8rem", ...(floatSide === "right" ? { marginLeft: "1.2rem" } : { marginRight: "1.2rem" }) } : undefined}
    >
      {resolvedUrl ? (
        <ImageLightbox src={resolvedUrl} alt={caption} caption={caption} className="bg-slate-50" imageClassName="mx-auto max-h-[440px] w-full object-contain p-2 sm:max-h-[520px]" />
      ) : (
        <div className="flex min-h-56 w-full items-center justify-center bg-slate-50 px-4 text-center text-sm text-slate-500">
          {failed ? "Изображение временно недоступно" : "Загрузка изображения…"}
        </div>
      )}
      <figcaption className="border-t border-slate-100 px-4 py-3">
        <div className="font-semibold text-slate-900">{caption}</div>
        {detail ? <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div> : null}
        {data.trainerId ? <Link href="/subjects/histology?tab=trainer" className="mt-2 inline-flex text-xs font-semibold text-indigo-600 underline">Открыть этот раздел в атласе/тренажёре</Link> : null}
      </figcaption>
    </figure>
  );
}


/** Строки «**термин** — определение» → флеш-карты. */
function parseBaseCards(raw: string): Array<{ front: string; back: string }> {
  const cards: Array<{ front: string; back: string }> = [];
  let cur: { front: string; back: string } | null = null;
  for (const rawLine of String(raw || "").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const li = line.replace(/^-\s+/, "");
    const m = li.match(/^\*\*(.+?)\*\*[\s—–-]+(.*)$/);
    if (m) {
      if (cur) cards.push(cur);
      cur = { front: m[1].trim(), back: m[2].trim() };
    } else if (cur) {
      cur.back += " " + li;
    } else {
      cards.push({ front: li, back: "" });
    }
  }
  if (cur) cards.push(cur);
  return cards.length ? cards : [{ front: raw, back: "" }];
}

function BaseCard({ raw, lectureId }: { raw: string; lectureId?: string }) {
  const cards = parseBaseCards(raw);
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDone(Boolean(readBlockProgress(lectureId || "").baseDone));
  }, [lectureId]);
  if (!cards.length) return null;
  return (
    <section className="my-6 overflow-hidden rounded-2xl border-2 border-[var(--status-critical-border)] bg-[var(--status-critical-bg)]/70 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--status-critical-border)] bg-white/60 px-4 py-3 dark:bg-transparent">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--status-critical-fg)]">Блок 1 · База (must know)</div>
          <h3 className="mt-0.5 text-base font-extrabold text-slate-900 dark:text-slate-100">Зубрёжка: выучи до лекции</h3>
        </div>
        <button
          type="button"
          onClick={() => { const next = !done; setDone(next); setBaseDone(lectureId || "", next); }}
          className={"rounded-xl px-4 py-2 text-sm font-bold transition " + (done ? "bg-[var(--status-ok-fg)] text-white hover:bg-[var(--status-ok-fg)]" : "bg-white text-[var(--status-critical-fg)] shadow-sm hover:bg-[var(--status-critical-bg)]")}
        >
          {done ? "✓ База выучена" : "Я выучил базу"}
        </button>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2">
        {cards.map((card, i) => {
          const open = Boolean(flipped[i]);
          return (
            <button
              key={i}
              type="button"
              onClick={() => setFlipped((v) => ({ ...v, [i]: !v[i] }))}
              className={"rounded-xl border p-3 text-left text-sm transition " + (open ? "border-[var(--status-critical-border)] bg-white dark:bg-slate-900" : "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)]/50 hover:bg-[var(--status-critical-bg)]")}
            >
              <div className="font-bold text-slate-900 dark:text-slate-100">{card.front}</div>
              {card.back && (open
                ? <div className="mt-1.5 leading-6 text-slate-700 dark:text-slate-300">{card.back}</div>
                : <div className="mt-1 text-xs text-[var(--status-critical-fg)]">Нажми — показать ответ</div>)}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AlgoCard({ raw, lectureId }: { raw: string; lectureId?: string }) {
  let spec: { title?: string; id?: string; steps?: string[] } = {};
  try { spec = JSON.parse(raw); } catch {
    spec = { steps: String(raw || "").split("\n").map((x) => x.trim()).filter(Boolean) };
  }
  const steps = spec.steps || [];
  const algoId = spec.id || "algo";
  const [checked, setChecked] = useState<number[]>([]);
  useEffect(() => {
    setChecked(readBlockProgress(lectureId || "").steps?.[algoId] ?? []);
  }, [lectureId, algoId]);
  if (!steps.length) return null;
  const doneCount = checked.filter((i) => i < steps.length).length;
  return (
    <section className="my-6 rounded-2xl border-2 border-sky-300 bg-sky-50/70 p-4 shadow-sm dark:border-sky-500/40 dark:bg-sky-500/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-300">Алгоритм решения — иди по шагам</div>
          <h3 className="mt-0.5 text-base font-extrabold text-slate-900 dark:text-slate-100">{spec.title || "Пошаговый разбор"}</h3>
        </div>
        <div className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">{doneCount}/{steps.length}</div>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((step, i) => {
          const done = checked.includes(i);
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => { toggleAlgoStep(lectureId || "", algoId, i); setChecked((v) => (v.includes(i) ? v.filter((x) => x !== i) : [...v, i])); }}
                className={"flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition " + (done ? "border-sky-300 bg-sky-100/70 text-sky-900 line-through decoration-sky-400 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200" : "border-slate-200 bg-white hover:border-sky-300 dark:border-slate-700 dark:bg-slate-900")}
              >
                <span className={"mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold " + (done ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800")}>{done ? "✓" : i + 1}</span>
                <span className="leading-6">{step}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function DeepCard({ raw }: { raw: string }) {
  const [html, setHtml] = useState("");
  useEffect(() => { setHtml(mdToHtml(raw)); }, [raw]);
  return (
    <section className="my-6 overflow-hidden rounded-2xl border-2 border-violet-300 bg-violet-50/70 shadow-sm dark:border-violet-500/40 dark:bg-violet-500/10">
      <div className="border-b border-violet-200 bg-white/60 px-4 py-3 dark:border-violet-500/30 dark:bg-transparent">
        <div className="text-[11px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-300">Блок 3 · Углубление (на «отлично»)</div>
        <h3 className="mt-0.5 text-base font-extrabold text-slate-900 dark:text-slate-100">Клиника, патофизиология, применение</h3>
      </div>
      <div className="prose prose-slate max-w-none px-4 py-3 dark:prose-invert" dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}


function sanitizeLectureHtml(raw: string): string {
  if (typeof window === "undefined") return "";
  const doc = new DOMParser().parseFromString(raw, "text/html");
  // Таблицы, индексы и код нужны химическим и медицинским конспектам:
  // без них из DOCX пропадают таблицы свойств и формулы вида H₂SO₄.
  const allowed = new Set(["P","DIV","BR","STRONG","B","EM","I","U","S","STRIKE","H1","H2","H3","H4","H5","H6","UL","OL","LI","BLOCKQUOTE","A","IMG","VIDEO","IFRAME","HR","SPAN","FONT","TABLE","THEAD","TBODY","TFOOT","TR","TH","TD","CAPTION","COLGROUP","COL","CODE","PRE","SUP","SUB","DL","DT","DD"]);
  const walk=(root: Node)=>{
    [...root.childNodes].forEach(node=>{
      if(node.nodeType!==Node.ELEMENT_NODE){ if(node.parentNode) walk(node); return; }
      const el=node as HTMLElement;
      if(!allowed.has(el.tagName)){ const p=el.parentNode; if(p){while(el.firstChild)p.insertBefore(el.firstChild,el);p.removeChild(el);} return; }
      [...el.attributes].forEach(a=>{
        const keep=["href","src","alt","title","target","rel","width","height","size","style","class"].includes(a.name);
        if(!keep) el.removeAttribute(a.name);
        if(a.name==="class"){
          // Классы нужны рендеру формул (lec-math) и диаграмм (mermaid).
          // Оставляем только известные токены, чужие — выкидываем.
          const tokens=a.value.split(/\s+/).filter(x=>/^(lec-[a-z-]+|mermaid|katex|formula|chem-[a-z-]+)$/i.test(x));
          if(tokens.length)el.setAttribute("class",tokens.join(" "));else el.removeAttribute("class");
        }
        if(a.name==="style"){
          // Разрешаем ещё и положение фото в тексте (обтекание, ширина, отступы),
          // иначе картинку можно было вставить только «во всю ширину».
          const safe=a.value.split(";").map(x=>x.trim()).filter(x=>/^(font-size|font-weight|font-style|text-decoration|text-align|color|background-color|float|display|width|max-width|margin)\s*:\s*[^;]+$/i.test(x)&&!/url\s*\(|expression\s*\(|javascript:/i.test(x)).join(";");
          if(safe)el.setAttribute("style",safe);else el.removeAttribute("style");
        }
      });
      if(el.hasAttribute("href")||el.hasAttribute("src")){
        const attr=el.hasAttribute("href")?"href":"src";
        try{const u=new URL(el.getAttribute(attr)||"",window.location.origin);if(!["http:","https:"].includes(u.protocol))el.removeAttribute(attr);}catch{el.removeAttribute(attr);}
      }
      if(el.tagName==="IFRAME"){
        const src=el.getAttribute("src")||"";
        if(!/^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|rutube\.ru|vk\.com)\//i.test(src))el.remove();
        else{el.setAttribute("allowfullscreen","true");el.setAttribute("loading","lazy");}
      }
      if(el.tagName==="A"){el.setAttribute("target","_blank");el.setAttribute("rel","noreferrer");}
      if(el.parentNode)walk(el);
    });
  };
  walk(doc.body); return doc.body.innerHTML;
}
export function LectureRenderer({ markdown, html, lectureId, activeBlock }: {
  markdown: string;
  html?: string;
  lectureId?: string;
  /** Индекс блока, который нужно показать вместо всей лекции. */
  activeBlock?: number | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  // Markdown — единый источник рендера: и редактор, и страница студента
  // показывают один и тот же разбор. HTML остаётся фолбэком для старых импортов.
  const safeHtml = useMemo(
    () => (!markdown || !markdown.trim()) && html ? sanitizeLectureHtml(html) : "",
    [markdown, html]
  );
  // Some content-import paths stored Markdown with one extra escaping layer
  // (for example, escaped Mermaid fences/quotes). Normalize only the syntax
  // characters needed for block parsing; ordinary backslashes remain intact.
  const normalizedMarkdown = useMemo(() => {
    const source = markdown || "";
    return source
      .split("\\`").join("`")
      .split('\\\"').join('"');
  }, [markdown]);
  const hasSpecialMarkdownBlocks = useMemo(() => /```(?:chart|video|image|mermaid|chem|quiz|leukocyte|base|algo|deep)\\b/i.test(normalizedMarkdown) || /```(?:selfwork|exam)\b/i.test(normalizedMarkdown) || /\\$\\$[\\s\\S]+?\\$\\$/m.test(normalizedMarkdown), [normalizedMarkdown]);
  const parts = useMemo(() => parseBlocks(normalizedMarkdown), [normalizedMarkdown]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!document.getElementById("katex-css")) {
        const link = document.createElement("link");
        link.id = "katex-css";
        link.rel = "stylesheet";
        link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";
        document.head.appendChild(link);
      }
      if (!winLibs().katex) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js";
          s.onload = () => resolve();
          s.onerror = () => reject();
          document.body.appendChild(s);
        });
      }
      if (!winLibs().mermaid) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
          s.onload = () => resolve();
          s.onerror = () => reject();
          document.body.appendChild(s);
        });
        const mm = winLibs().mermaid;
        mm?.initialize({ startOnLoad: false, theme: "neutral" });
      }
      if (!cancelled) setReady(true);
    }
    void load().catch(() => setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !ref.current) return;
    const libs = winLibs();
    ref.current.querySelectorAll(".lec-math").forEach((el) => {
      const tex = el.textContent || "";
      const display = tex.includes("\\[");
      const body = tex.replace(/^\\\(|\\\[/, "").replace(/\\\)$|\\\]$/, "");
      try {
        libs.katex?.render(body, el as HTMLElement, { throwOnError: false, displayMode: display });
      } catch {
        /* ignore */
      }
    });
    void libs.mermaid?.run({ nodes: ref.current.querySelectorAll(".mermaid") });
  }, [ready, parts, safeHtml]);

  const [allOpen, setAllOpen] = useState(false);
  // На телефоне лекция должна читаться без танцев с аккордеонами: раскрываем
  // блоки сразу. На десктопе оставляем компактный список, как было.
  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 640px)").matches) {
      setAllOpen(true);
    }
  }, []);
  // Поток групп: подряд идущие md-секции + спец-блоки (квиз/картинка/видео) прикрепляются к текущей секции,
  // поэтому пер-блочный тест рендерится ВНУТРИ своего аккордеона.
  const stream = useMemo(() => {
    const groups: Array<{ title: string; md: string; blocks: typeof parts; isTail: boolean }> = [];
    if (safeHtml) return groups;
    let cur: (typeof groups)[number] | null = null;
    // Группа без заголовка — продолжение предыдущей подтемы (текст после
    // картинки/видео), а не отдельный блок: иначе оглавление и содержимое
    // расходятся и выбор блока попадает на обрывок без лекционного текста.
    const flush = () => {
      if (!cur) return;
      const prev = groups[groups.length - 1];
      if (!cur.title && prev) {
        prev.md += cur.md;
        prev.blocks.push(...cur.blocks);
        cur = null;
        return;
      }
      groups.push(cur);
      cur = null;
    };
    for (const p of parts) {
      if (p.kind === "md") {
        const secs = splitH2Sections(p.content);
        if (!secs.length) continue;
        for (const sec of secs) {
          // Текст, продолжающийся после картинки/видео, не заводит отдельный
          // безымянный блок: иначе подтем становится больше, чем в оглавлении,
          // и выбор блока попадает на пустую группу с одним тестом.
          if (!sec.title && cur) {
            cur.md += sec.md;
            continue;
          }
          flush();
          cur = { title: sec.title, md: sec.md, blocks: [], isTail: /Дальше по теме/i.test(sec.title) };
        }
      } else {
        if (!cur) cur = { title: "", md: "", blocks: [], isTail: false };
        cur.blocks.push(p);
      }
    }
    flush();
    return groups;
  }, [parts, safeHtml]);
  const foldable = !safeHtml && stream.filter((g) => g.title && !g.isTail).length >= 3;
  const hasBase = !safeHtml && parts.some((p) => p.kind === "base");
  const [baseDoneState, setBaseDoneState] = useState(false);
  const [readSections, setReadSections] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => {
      const p = readBlockProgress(lectureId || "");
      setBaseDoneState(Boolean(p.baseDone));
      setReadSections(p.read ?? []);
    };
    sync();
    window.addEventListener(LECTURE_PROGRESS_EVENT, sync);
    return () => window.removeEventListener(LECTURE_PROGRESS_EVENT, sync);
  }, [lectureId]);
  const readCount = foldable ? stream.filter((g) => g.title && !g.isTail && readSections.includes(g.title)).length : 0;
  const theoryCount = foldable ? stream.filter((g) => g.title && !g.isTail).length : 0;
  const readiness = Math.round(((baseDoneState ? 1 : 0) * 0.4 + (theoryCount ? readCount / theoryCount : 0) * 0.6) * 100);
  const showSingle = typeof activeBlock === "number" && activeBlock >= 0 && activeBlock < stream.length;

  // Одиночный режим режется тем же разбором по H2/H3, что и оглавление:
  // заголовок блока сохраняется, теория не теряется за картинкой или тестом.
  const pageBlocks = useMemo(() => (safeHtml ? [] : splitLectureBlocks(markdown)), [markdown, safeHtml]);
  const singleGroup = showSingle ? pageBlocks[activeBlock as number] : null;
  function renderPart(p: (typeof parts)[number], key: string) {
    if (p.kind === "md") {
      return <div key={key} className="prose prose-slate max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: mdToHtml(p.content) }} />;
    }
    if (p.kind === "chart") {
      try {
        return <ChartBlock key={key} spec={JSON.parse(p.content)} />;
      } catch {
        return (
          <pre key={key} className="overflow-auto rounded-xl bg-slate-100 p-3 text-xs">
            {p.content}
          </pre>
        );
      }
    }
    if (p.kind === "video") return <VideoBlock key={key} raw={p.content} />;
    if (p.kind === "image") return <ImageBlock key={key} raw={p.content} />;
    if (p.kind === "quiz") return <MiniQuizBlock key={key} raw={p.content} lectureId={lectureId} />;
    if (p.kind === "base") return <BaseCard key={key} raw={p.content} lectureId={lectureId} />;
    if (p.kind === "algo") return <AlgoCard key={key} raw={p.content} lectureId={lectureId} />;
    if (p.kind === "deep") return <DeepCard key={key} raw={p.content} />;
    if (p.kind === "leukocyte") return <LeukocyteDifferentialTrainer key={key} raw={p.content} />;
    // Интерактив из репозитория: контент берётся по lectureId из JSON-спеки фенса,
    // фолбэк — id лекции, переданный рендереру.
    if (p.kind === "selfwork") return <OpenAnswerPractice key={key} lectureId={fenceLectureId(p.content) ?? lectureId} />;
    if (p.kind === "exam") return <ExamModePanel key={key} lectureId={fenceLectureId(p.content) ?? lectureId} />;
    if (p.kind === "chem") {
      const spec = parseChemSpec(p.content);
      if (!spec) {
        return (
          <pre key={key} className="overflow-auto rounded-xl bg-slate-100 p-3 text-xs">
            {p.content}
          </pre>
        );
      }
      return (
        <div key={key} className="my-4">
          <ChemicalFigure spec={{ ...spec, size: spec.size || "default" }} />
        </div>
      );
    }
    if (p.kind === "mermaid") {
      return (
        <div key={key} className="my-4 overflow-x-auto rounded-xl border border-[var(--border)] bg-white p-4">
          <pre className="mermaid">{p.content}</pre>
        </div>
      );
    }
    return null;
  }

  return (
    <div ref={ref} className="lecture-body space-y-2 text-[15px] leading-relaxed after:block after:clear-both after:content-['']">
      {safeHtml && !hasSpecialMarkdownBlocks ? <div className="prose prose-slate max-w-none dark:prose-invert lecture-rich-html" dangerouslySetInnerHTML={{__html:safeHtml}} /> : (
        <div className="space-y-3">
          {hasBase && (
            baseDoneState ? (
              <div className="rounded-2xl border-2 border-[var(--status-ok-border)] bg-[var(--status-ok-bg)]/80 px-4 py-3 text-sm font-bold text-[var(--status-ok-fg)]">
                ✓ База выучена — можно идти в лекцию. Всё сложится по полочкам.
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-[var(--status-critical-border)] bg-[var(--status-critical-bg)]/80 px-4 py-3 text-sm font-bold text-[var(--status-critical-fg)]">
                ⚠ Сначала выучи Базу (блок «База» ниже) — без неё лекция не разложится в голове. Индикатор станет зелёным после отметки.
              </div>
            )
          )}
          {foldable && theoryCount > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-xs font-semibold text-[var(--muted)]">
              <span>Готовность к занятию:</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <span className="block h-full rounded-full bg-indigo-500 transition-all" style={{ width: readiness + "%" }} />
              </span>
              <span>{readiness}%</span>
            </div>
          )}
          {foldable && !showSingle && (
            <button
              type="button"
              onClick={() => setAllOpen((v) => !v)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600"
            >
              {allOpen ? "Свернуть все блоки" : "Развернуть все блоки"}
            </button>
          )}
          {singleGroup ? (
            <div className="space-y-3">
              <h2 data-lec-title={singleGroup.title} className="text-lg font-extrabold leading-snug text-slate-900 sm:text-xl">
                {singleGroup.title}
              </h2>
              {parseBlocks(singleGroup.markdown).map((part, pi) => renderPart(part, "single-" + pi))}
            </div>
          ) : stream.map((g, gi) => {
            const inner = (
              <>
                {g.md.trim() ? (
                  <div className="prose prose-slate max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: mdToHtml(g.md) }} />
                ) : null}
                {g.blocks.map((p, pi) => renderPart(p, gi + "-" + pi))}
              </>
            );
            if (!foldable || !g.title || g.isTail) {
              return (
                <div key={gi} className="space-y-2" data-lec-title={g.title || undefined}>
                  {inner}
                </div>
              );
            }
            const open = allOpen || gi === 0;
            const readDone = readSections.includes(g.title);
            return (
              <details key={gi} data-lec-title={g.title} className={"lec-fold rounded-2xl border bg-[var(--card)] shadow-sm " + (readDone ? "border-[var(--status-ok-border)]" : "border-[var(--border)]")} open={open}>
                <summary className="cursor-pointer select-none list-none px-4 py-3 text-sm font-extrabold text-slate-900 dark:text-slate-100">
                  <span className="mr-2 inline-block text-indigo-500">▸</span>
                  {g.title}
                  {readDone && <span className="ml-2 rounded-full bg-[var(--status-ok-bg)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--status-ok-fg)]">прочитано</span>}
                </summary>
                <div className="space-y-2 border-t border-[var(--border)] px-4 py-3">
                  {inner}
                  <button
                    type="button"
                    onClick={() => { toggleSectionRead(lectureId || "", g.title); setReadSections((v) => (v.includes(g.title) ? v.filter((x) => x !== g.title) : [...v, g.title])); }}
                    className={"mt-2 rounded-xl px-3 py-1.5 text-xs font-bold transition " + (readDone ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)] hover:bg-[var(--status-ok-bg)]" : "border border-slate-200 bg-white text-slate-600 hover:border-[var(--status-ok-border)] hover:text-[var(--status-ok-fg)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300")}
                  >
                    {readDone ? "✓ Блок прочитан" : "Отметить блок прочитанным"}
                  </button>
                </div>
              </details>
            );
          })}
        </div>
      )}
      <style>{`
        .lec-table-wrap { overflow-x: auto; margin: 1rem 0; }
        .lec-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .lec-table th, .lec-table td { border: 1px solid #e2e8f0; padding: 0.5rem 0.75rem; text-align: left; }
        .lec-table th { background: #f8fafc; font-weight: 600; }
        .lec-math { margin: 0.75rem 0; overflow-x: auto; }
        .lec-def { border-left: 4px solid #0f766e; background: rgba(13,148,136,0.07); border-radius: 0.85rem; margin: 1rem 0; padding: 0.8rem 1.1rem; }
        .lec-def em { color: #0f766e; font-weight: 600; }
        .dark .lec-def { background: rgba(13,148,136,0.12); }
        .lec-simple { border-left: 4px solid #f59e0b; background: rgba(245,158,11,0.08); border-radius: 0.85rem; margin: 1rem 0; padding: 0.8rem 1.1rem; }
        .dark .lec-simple { background: rgba(245,158,11,0.12); }
        .lecture-body .prose > div { margin-bottom: 0.95rem; }
        .lecture-body .prose > div > div { margin-bottom: 0.9rem; }
        .lecture-body h1 { font-size: 1.45rem; font-weight: 800; margin: 1.4rem 0 0.6rem; line-height: 1.3; }
        .lecture-body h2 { font-size: 1.25rem; font-weight: 800; margin: 1.7rem 0 0.6rem; line-height: 1.3; }
        .lecture-body h3 { font-size: 1.08rem; font-weight: 700; margin: 1.35rem 0 0.5rem; }
        .lecture-body h1, .lecture-body h2, .lecture-body h3 { color: #0f172a; }
        :root.dark .lecture-body h1, .dark .lecture-body h1, .lecture-body h1 { }
        .lecture-body ul, .lecture-body ol { margin: 0.55rem 0; padding-left: 1.5rem; }
        .lecture-body li { margin: 0.32rem 0; }
        .lecture-body blockquote { border-left: 4px solid #6366f1; background: rgba(238,242,255,0.6); border-radius: 0.85rem; margin: 1rem 0; padding: 0.8rem 1.1rem; color: #1e293b; }
        .dark .lecture-body blockquote { background: rgba(99,102,241,0.12); color: #e2e8f0; }
        .lecture-body hr { margin: 2.2rem 0; border: 0; border-top: 2px dashed #cbd5e1; }
        .lecture-body img { max-width: 100%; height: auto; border-radius: 12px; }
        .lecture-body p::after { content: ""; display: block; clear: both; }
        .dark .lecture-body hr { border-top-color: #475569; }
        .lec-fold summary { min-height: 44px; display: flex; align-items: center; }
        .lec-fold summary:hover { background: rgba(99,102,241,0.06); }
        @media (max-width: 640px) {
          .lecture-body { font-size: 16px; }
          .lecture-body .prose { font-size: 1rem; line-height: 1.72; padding-inline: 0; }
          .lecture-body h1 { font-size: 1.28rem; }
          .lecture-body h2 { font-size: 1.14rem; }
          .lecture-body h3 { font-size: 1.02rem; }
          .lecture-body ul, .lecture-body ol { padding-left: 1.2rem; }
          .lec-fold > summary { padding: 0.8rem 0.85rem; font-size: 0.95rem; }
          .lec-fold > div { padding-inline: 0.85rem; }
          .lec-table-wrap { margin-inline: -0.35rem; }
          .lec-table th, .lec-table td { padding: 0.4rem 0.5rem; font-size: 0.8rem; }
          .lecture-body .lec-math { font-size: 0.95rem; }
        }
        .lec-fold[open] > summary .chev { transform: rotate(90deg); }
        .lec-fold .prose > div:last-child { margin-bottom: 0.2rem; }\n        .lecture-rich-html img,.lecture-rich-html video{max-width:100%;height:auto;border-radius:14px;margin:1rem auto}.lecture-rich-html iframe{width:100%;min-height:420px;border:1px solid var(--border);border-radius:14px;margin:1rem 0}.lecture-rich-html a{color:var(--primary);text-decoration:underline}
      `}</style>
    </div>
  );
}
