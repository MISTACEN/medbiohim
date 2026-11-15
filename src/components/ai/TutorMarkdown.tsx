"use client";

/**
 * Рендер ответа AI-тьютора: Markdown (таблицы, списки, заголовки) через общий
 * mdToHtml, формулы — KaTeX, схемы — Mermaid (оба подгружаются лениво, как в
 * лекциях). Ответы моделей приходят в markdown: без рендера таблицы и схемы
 * выглядели стеной текста и были нечитаемы.
 */
import { useEffect, useMemo, useRef } from "react";
import { mdToHtml } from "@/components/lectures/LectureRenderer";

type KatexApi = { render: (tex: string, el: HTMLElement, opts: object) => void };
type MermaidApi = { run: (opts: { nodes: NodeListOf<HTMLElement> }) => Promise<unknown> };

function winLibs(): { katex?: KatexApi; mermaid?: MermaidApi } {
  return window as unknown as { katex?: KatexApi; mermaid?: MermaidApi };
}

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("load failed")));
      if ((existing as HTMLScriptElement).dataset.loaded === "1") resolve();
      return;
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = src;
    s.async = true;
    s.onload = () => { s.dataset.loaded = "1"; resolve(); };
    s.onerror = () => reject(new Error("load failed"));
    document.body.appendChild(s);
  });
}

/** Есть ли в ответе конструкции, требующие библиотек (схемы/формулы). */
function needsLibs(md: string): { mermaid: boolean; katex: boolean } {
  return {
    mermaid: /```mermaid\b/i.test(md),
    katex: /\$[^$\n]+\$|\$\$[\s\S]+?\$\$/m.test(md),
  };
}

export function TutorMarkdown({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const libs = useMemo(() => needsLibs(content), [content]);

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    void (async () => {
      try {
        if (libs.katex && !winLibs().katex) {
          if (!document.getElementById("mbh-katex-css")) {
            const link = document.createElement("link");
            link.id = "mbh-katex-css";
            link.rel = "stylesheet";
            link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";
            document.head.appendChild(link);
          }
          await loadScript("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js", "mbh-katex-js");
        }
        if (libs.mermaid && !winLibs().mermaid) {
          await loadScript("https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js", "mbh-mermaid-js");
          const nodes = (ref.current?.querySelectorAll(".mermaid") || []) as NodeListOf<HTMLElement>;
          winLibs().mermaid?.run({ nodes }).catch(() => {});
        }
        if (winLibs().katex && ref.current && !cancelled) {
          ref.current.querySelectorAll<HTMLElement>(".lec-math").forEach((el) => {
            const tex = el.textContent || "";
            try { winLibs().katex?.render(tex, el, { throwOnError: false, displayMode: el.classList.contains("lec-math-block") }); } catch { /* оставляем как есть */ }
          });
        }
        if (libs.mermaid && winLibs().mermaid && ref.current && !cancelled) {
          const nodes = (ref.current.querySelectorAll(".mermaid") || []) as NodeListOf<HTMLElement>;
          winLibs().mermaid?.run({ nodes }).catch(() => {});
        }
      } catch { /* CDN недоступен — текст и таблицы читаемы и без библиотек */ }
    })();
    return () => { cancelled = true; };
  }, [content, libs.katex, libs.mermaid]);

  const html = useMemo(() => {
    // ```mermaid → div.mermaid (до mdToHtml, который не знает о code-блоках).
    const withMermaid = content.replace(/```mermaid\s*\r?\n([\s\S]*?)```/gi, (_a, body) => `<div class="mermaid">${body}</div>`);
    return mdToHtml(withMermaid);
  }, [content]);

  return <div ref={ref} className="prose prose-sm max-w-none dark:prose-invert [&_table]:my-2 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_.mermaid]:my-2" dangerouslySetInnerHTML={{ __html: html }} />;
}
