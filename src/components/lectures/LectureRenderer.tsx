"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ChartSpec = { type?: string; title?: string; labels?: string[]; values?: number[]; unit?: string };

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseBlocks(md: string) {
  const parts: Array<{ kind: "md" | "chart" | "video" | "image" | "mermaid"; content: string }> = [];
  const re = /```(chart|video|image|mermaid)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    if (m.index > last) parts.push({ kind: "md", content: md.slice(last, m.index) });
    parts.push({ kind: m[1] as "chart" | "video" | "image" | "mermaid", content: m[2].trim() });
    last = m.index + m[0].length;
  }
  if (last < md.length) parts.push({ kind: "md", content: md.slice(last) });
  return parts;
}

function mdToHtml(md: string): string {
  let s = escapeHtml(md);
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_a, body) => `<div class="lec-math">\\[${body.trim()}\\]</div>`);
  s = s.replace(/(?<!\$)\$(?!\$)([^$\n]+)\$(?!\$)/g, (_a, body) => `<span class="lec-math">\\(${body}\\)</span>`);
  s = s.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  s = s.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");
  s = s.replace(/^- (.+)$/gm, "<li>$1</li>");
  s = s.replace(/(<li>.*<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`);
  s = s.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  s = s.replace(/(?:^\|.+\|\n?)+/gm, (table) => {
    const rows = table.trim().split("\n").filter(Boolean);
    if (rows.length < 2) return table;
    const parseRow = (r: string) => r.split("|").slice(1, -1).map((c) => c.trim());
    const head = parseRow(rows[0]);
    const bodyRows = rows.slice(2).map(parseRow);
    const thead = `<thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead>`;
    const tbody = `<tbody>${bodyRows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>`;
    return `<div class="lec-table-wrap"><table class="lec-table">${thead}${tbody}</table></div>`;
  });
  s = s.replace(/\n\n/g, "</p><p>");
  return `<p>${s}</p>`;
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
  try { data = JSON.parse(raw); } catch { data = { url: raw }; }
  const url = data.url || "";
  const caption = data.caption || data.platform || "Видео";
  if (!url) {
    return <div className="my-3 rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)]">{caption || "Вставьте URL видео"}</div>;
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
  } catch { /* keep url */ }
  const isEmbed = embed.includes("embed") || embed.includes("rutube.ru/play");
  return (
    <div className="my-4 space-y-2">
      {isEmbed ? (
        <div className="aspect-video overflow-hidden rounded-xl border border-[var(--border)]">
          <iframe src={embed} className="h-full w-full" allowFullScreen title={caption} />
        </div>
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-[var(--primary)] underline">{caption}: открыть видео</a>
      )}
    </div>
  );
}

function ImageBlock({ raw }: { raw: string }) {
  let data: { url?: string; caption?: string } = {};
  try { data = JSON.parse(raw); } catch { data = { url: raw }; }
  if (!data.url) return null;
  return (
    <figure className="my-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.url} alt={data.caption || ""} className="max-h-[480px] w-full rounded-xl border border-[var(--border)] object-contain" />
      {data.caption && <figcaption className="mt-2 text-center text-xs text-[var(--muted)]">{data.caption}</figcaption>}
    </figure>
  );
}

export function LectureRenderer({ markdown }: { markdown: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const parts = useMemo(() => parseBlocks(markdown || ""), [markdown]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const w = window as unknown as { katex?: { render: (t: string, el: HTMLElement, o: object) => void }; mermaid?: { run: (o: object) => Promise<void>; initialize: (o: object) => void } };
      if (!document.getElementById("katex-css")) {
        const link = document.createElement("link");
        link.id = "katex-css";
        link.rel = "stylesheet";
        link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";
        document.head.appendChild(link);
      }
      if (!w.katex) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js";
          s.onload = () => resolve();
          s.onerror = () => reject();
          document.body.appendChild(s);
        });
      }
      if (!w.mermaid) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
          s.onload = () => resolve();
          s.onerror = () => reject();
          document.body.appendChild(s);
        });
        w.mermaid?.initialize({ startOnLoad: false, theme: "neutral" });
      }
      if (!cancelled) setReady(true);
    }
    void load().catch(() => setReady(true));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !ref.current) return;
    const w = window as unknown as { katex?: { render: (t: string, el: HTMLElement, o: object) => void }; mermaid?: { run: (o: object) => Promise<void> } };
    ref.current.querySelectorAll(".lec-math").forEach((el) => {
      const tex = el.textContent || "";
      const display = tex.includes("\\[");
      const body = tex.replace(/^\\\(|\\\[/, "").replace(/\\\)$|\\\]$/, "");
      try { w.katex?.render(body, el as HTMLElement, { throwOnError: false, displayMode: display }); } catch { /* ignore */ }
    });
    void w.mermaid?.run({ nodes: ref.current.querySelectorAll(".mermaid") });
  }, [ready, parts]);

  return (
    <div ref={ref} className="lecture-body space-y-1 text-sm leading-relaxed">
      {parts.map((p, i) => {
        if (p.kind === "md") return <div key={i} className="prose prose-slate max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: mdToHtml(p.content) }} />;
        if (p.kind === "chart") {
          try { return <ChartBlock key={i} spec={JSON.parse(p.content)} />; }
          catch { return <pre key={i} className="overflow-auto rounded-xl bg-slate-100 p-3 text-xs">{p.content}</pre>; }
        }
        if (p.kind === "video") return <VideoBlock key={i} raw={p.content} />;
        if (p.kind === "image") return <ImageBlock key={i} raw={p.content} />;
        if (p.kind === "mermaid") return <div key={i} className="my-4 overflow-x-auto rounded-xl border border-[var(--border)] bg-white p-4"><pre className="mermaid">{p.content}</pre></div>;
        return null;
      })}
      <style>{`
        .lec-table-wrap { overflow-x: auto; margin: 1rem 0; }
        .lec-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .lec-table th, .lec-table td { border: 1px solid #e2e8f0; padding: 0.5rem 0.75rem; text-align: left; }
        .lec-table th { background: #f8fafc; font-weight: 600; }
        .lec-math { margin: 0.75rem 0; overflow-x: auto; }
      `}</style>
    </div>
  );
}
