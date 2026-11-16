"use client";

/**
 * ИИ-действия по лекции (фаза 2.9 карты): мнемоника, ответ «как на экзамене»,
 * «как пятилетнему», «как сплетню» и схема mermaid.
 *
 * Ответ рендерится тем же LectureRenderer, что и сама лекция, поэтому блок
 * ```mermaid рисуется существующим кодом — отдельной схемной библиотеки нет.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Baby, Brain, ChevronLeft, ChevronRight, Drama, FileText, Headphones, Loader2, Network, Presentation, Printer, Sparkles, X, type LucideIcon } from "lucide-react";
import { aiChat, lectureCheatsheet, lecturePodcast, lectureSlides, type LectureSlides } from "@/lib/features-api";
import { describeApiError } from "@/lib/errors";
import { LectureRenderer } from "@/components/lectures/LectureRenderer";
import { AI_PRESETS, buildPresetMessage, presetById, type AiPresetId } from "@/lib/ai/presets";

const ICONS: Record<AiPresetId, LucideIcon> = {
  mnemonic: Brain,
  exam: Sparkles,
  child: Baby,
  gossip: Drama,
  scheme: Network,
};

export default function LectureAiActions({
  lectureId,
  title,
  subjectSlug,
  excerpt,
}: {
  lectureId?: string;
  title: string;
  subjectSlug?: string | null;
  excerpt?: string | null;
}) {
  const [active, setActive] = useState<AiPresetId | null>(null);
  const [answer, setAnswer] = useState("");
  const [meta, setMeta] = useState<{ provider?: string; model?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Аудио-конспект: WAV приходит в base64, играем через blob-URL и убираем его
  // при размонтировании — иначе такие URL живут до перезагрузки страницы.
  const [podcastUrl, setPodcastUrl] = useState<string | null>(null);
  const [podcastScript, setPodcastScript] = useState("");
  const [podcastBusy, setPodcastBusy] = useState(false);

  useEffect(() => {
    return () => {
      if (podcastUrl) URL.revokeObjectURL(podcastUrl);
    };
  }, [podcastUrl]);

  // Шпаргалка: markdown от ИИ + печать на один лист в отдельном окне.
  const [cheat, setCheat] = useState<{ title: string; content: string } | null>(null);
  const [cheatBusy, setCheatBusy] = useState(false);

  // Презентация по лекции (фаза 2.5.3): слайды в полноэкранном просмотрщике.
  const [slides, setSlides] = useState<LectureSlides | null>(null);
  const [slidesBusy, setSlidesBusy] = useState(false);
  const [slidesOpen, setSlidesOpen] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);
  const [slidesMounted, setSlidesMounted] = useState(false);
  const [pptxBusy, setPptxBusy] = useState(false);

  useEffect(() => {
    setSlidesMounted(true);
    return () => setSlidesMounted(false);
  }, []);

  useEffect(() => {
    if (!slidesOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setSlideIdx((i) => Math.min(i + 1, (slides?.slides.length || 1) - 1));
      else if (event.key === "ArrowLeft") setSlideIdx((i) => Math.max(i - 1, 0));
      else if (event.key === "Escape") setSlidesOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slidesOpen, slides]);

  async function makeSlides() {
    if (!lectureId || slidesBusy) return;
    setSlidesBusy(true);
    setError(null);
    const result = await lectureSlides(lectureId);
    setSlidesBusy(false);
    if (!result.ok) {
      setError(describeApiError(result.error));
      return;
    }
    if (!(result.data.slides || []).length) {
      setError("ИИ не собрал слайды — попробуйте ещё раз.");
      return;
    }
    setSlides(result.data);
    setSlideIdx(0);
    setSlidesOpen(true);
  }

  /**
   * Редактируемый PPTX по слайдам (фаза 2.5.3). pptxgenjs грузится динамически —
   * библиотека не попадает в бандл, пока студент не нажал экспорт.
   */
  async function exportPptx() {
    if (!slides || pptxBusy) return;
    setPptxBusy(true);
    setError(null);
    try {
      const { default: PptxGenJS } = await import("pptxgenjs");
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_16x9";
      pptx.author = "Медбиохим";
      const titleSlide = pptx.addSlide();
      titleSlide.background = { color: "1E3A8A" };
      titleSlide.addText(slides.title || title, { x: 0.6, y: 2.6, w: 8.8, fontSize: 32, bold: true, color: "FFFFFF" });
      titleSlide.addText("Презентация по лекции · Медбиохим", { x: 0.6, y: 4.0, w: 8.8, fontSize: 14, color: "BFDBFE" });
      for (const slide of slides.slides) {
        const s = pptx.addSlide();
        s.addText(slide.title, { x: 0.6, y: 0.5, w: 8.8, fontSize: 26, bold: true, color: "1E3A8A" });
        if (slide.bullets.length) {
          s.addText(slide.bullets.map((text) => ({ text, options: { bullet: { characterCode: "2022" }, breakLine: true } })), {
            x: 0.8, y: 1.5, w: 8.4, fontSize: 18, color: "1F2937", lineSpacingMultiple: 1.4,
          });
        }
        s.addText(String(slides.slides.indexOf(slide) + 1), { x: 9.2, y: 5.1, w: 0.6, fontSize: 12, color: "94A3B8", align: "right" });
      }
      const fileName = `презентация-${(slides.title || title || "лекция").replace(/[\\/:*?"<>|]+/g, "").slice(0, 60)}.pptx`;
      await pptx.writeFile({ fileName });
    } catch {
      setError("Не удалось собрать PPTX — используйте «Печать/PDF» или попробуйте ещё раз.");
    } finally {
      setPptxBusy(false);
    }
  }

  function printSlides() {
    if (!slides) return;
    const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const pages = slides.slides
      .map((slide) => `<section class="slide"><h2>${escape(slide.title)}</h2><ul>${slide.bullets.map((b) => `<li>${escape(b)}</li>`).join("")}</ul></section>`)
      .join("\n");
    const win = window.open("", "_blank", "width=900,height=1100");
    if (!win) return;
    win.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escape(slides.title || title)} — презентация</title><style>
      body{font-family:Georgia,serif;margin:0;color:#111}
      .slide{page-break-after:always;min-height:92vh;box-sizing:border-box;padding:48px 56px;display:flex;flex-direction:column;justify-content:center;border-bottom:1px solid #ddd}
      .slide h2{font-size:26px;margin:0 0 20px;color:#1e3a8a}
      .slide li{font-size:18px;margin:8px 0;line-height:1.5}
      @media print{.slide{border:0;min-height:100vh}}
    </style></head><body><h1 style="font-size:22px;padding:24px 56px">${escape(slides.title || title)}</h1>${pages}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  async function makeCheatsheet() {
    if (!lectureId || cheatBusy) return;
    setCheatBusy(true);
    setError(null);
    const result = await lectureCheatsheet(lectureId);
    setCheatBusy(false);
    if (!result.ok) {
      setError(describeApiError(result.error));
      return;
    }
    setCheat({ title: result.data.title || title, content: result.data.content || "" });
  }

  function printCheatsheet() {
    if (!cheat) return;
    const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = cheat.content
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return "";
        if (trimmed.startsWith("### ")) return `<h3>${escape(trimmed.slice(4))}</h3>`;
        if (trimmed.startsWith("## ")) return `<h2>${escape(trimmed.slice(3))}</h2>`;
        if (trimmed.startsWith("# ")) return `<h2>${escape(trimmed.slice(2))}</h2>`;
        if (/^[-*] /.test(trimmed)) return `<li>${escape(trimmed.slice(2)).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</li>`;
        return `<p>${escape(trimmed).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</p>`;
      })
      .join("\n")
      .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, "<ul>$1</ul>");
    const win = window.open("", "_blank", "width=800,height=1000");
    if (!win) return;
    win.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escape(cheat.title)} — шпаргалка</title><style>body{font-family:Georgia,serif;max-width:760px;margin:24px auto;padding:0 16px;line-height:1.45;color:#111}h1,h2{font-size:16px;margin:12px 0 4px}h3{font-size:14px;margin:10px 0 4px}p,li{font-size:13px;margin:2px 0}ul{margin:4px 0 8px 18px;padding:0}h1{font-size:20px}@media print{body{margin:0}}</style></head><body><h1>${escape(cheat.title)}</h1>${html}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  async function makePodcast() {
    if (!lectureId || podcastBusy) return;
    setPodcastBusy(true);
    setError(null);
    const result = await lecturePodcast(lectureId);
    setPodcastBusy(false);
    if (!result.ok) {
      setError(describeApiError(result.error));
      return;
    }
    const bytes = Uint8Array.from(atob(result.data.audio_base64), (ch) => ch.charCodeAt(0));
    const blob = new Blob([bytes], { type: result.data.mime || "audio/wav" });
    setPodcastUrl(URL.createObjectURL(blob));
    setPodcastScript(result.data.script || "");
  }

  async function run(id: AiPresetId) {
    if (busy) return;
    setActive(id);
    setBusy(true);
    setError(null);
    setAnswer("");
    setMeta({});
    const preset = presetById(id);
    const message = buildPresetMessage(preset, { title, subjectSlug, excerpt });
    const result = await aiChat([{ role: "user", content: message }], "auto", {
      mode: "precise",
      subjectSlug: subjectSlug || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(describeApiError(result.error));
      return;
    }
    setAnswer(String(result.data?.message?.content || "").trim());
    setMeta({ provider: result.data?.provider, model: result.data?.model });
  }

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-[var(--primary)]" /> Спросить по этой лекции
        </h2>
        <span className="text-xs text-[var(--muted)]">стиль меняется, факты — нет</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {AI_PRESETS.map((preset) => {
          const Icon = ICONS[preset.id];
          const current = active === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                current
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "border-[var(--border)] text-[var(--text)] hover:bg-[var(--primary-soft)]"
              }`}
              disabled={busy}
              aria-pressed={current}
              onClick={() => void run(preset.id)}
            >
              {busy && current ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
              {preset.label}
            </button>
          );
        })}
      </div>

      {lectureId ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--primary-soft)]"
            disabled={podcastBusy}
            onClick={() => void makePodcast()}
          >
            {podcastBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Headphones className="h-3.5 w-3.5" />}
            {podcastBusy ? "Пишем и озвучиваем диалог…" : "Подкаст-диалог"}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--primary-soft)]"
            disabled={cheatBusy}
            onClick={() => void makeCheatsheet()}
          >
            {cheatBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            {cheatBusy ? "Сжимаем…" : "Шпаргалка на лист"}
          </button>
          {cheat ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--primary-soft)]"
              onClick={printCheatsheet}
            >
              <Printer className="h-3.5 w-3.5" /> Печать
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--primary-soft)]"
            disabled={slidesBusy}
            onClick={() => void makeSlides()}
          >
            {slidesBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Presentation className="h-3.5 w-3.5" />}
            {slidesBusy ? "Собираем слайды…" : "Презентация"}
          </button>
          {slides ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--primary-soft)]"
              onClick={printSlides}
            >
              <Printer className="h-3.5 w-3.5" /> Печать слайдов
            </button>
          ) : null}
          {podcastUrl ? <audio controls src={podcastUrl} className="h-9 w-full max-w-md" /> : null}
        </div>
      ) : null}
      {cheat ? (
        <div className="mt-3 rounded-xl border border-[var(--border)] p-3">
          <p className="mb-2 text-[11px] text-[var(--muted)]">Шпаргалка · {cheat.title}</p>
          <LectureRenderer markdown={cheat.content} />
        </div>
      ) : null}

      {podcastScript ? (
        <div className="mt-2 rounded-xl bg-[var(--primary-soft)]/40 p-3">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Сценарий диалога (Ведущий + Студент)</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{podcastScript}</p>
        </div>
      ) : null}

      {error && (
        <p className="mt-3 rounded-xl border border-[var(--status-warn-bg)] bg-[var(--status-warn-bg)] p-3 text-sm" style={{ color: "var(--status-warn-fg)" }}>
          {error}
        </p>
      )}

      {answer && (
        <div className="mt-3 rounded-xl border border-[var(--border)] p-3">
          {meta.provider && (
            <p className="mb-2 text-[11px] text-[var(--muted)]">
              {active ? presetById(active).label : "Ответ"} · {meta.provider}
              {meta.model ? ` · ${meta.model}` : ""}
            </p>
          )}
          <LectureRenderer markdown={answer} />
        </div>
      )}

      {/* Полноэкранный просмотрщик слайдов: стрелки, клавиатура, Esc, печать.
          Портал — как в TrainerImageViewer, чтобы перекрыть шапку и навбар. */}
      {slidesMounted && slidesOpen && slides ? createPortal(
        <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950 text-white" role="dialog" aria-modal="true" aria-label="Презентация по лекции">
          <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <span className="min-w-0 truncate text-sm text-white/70">{slides.title || title}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={printSlides} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15">
                <Printer className="h-3.5 w-3.5" /> Печать/PDF
              </button>
              <button type="button" onClick={() => void exportPptx()} disabled={pptxBusy} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-50">
                <FileText className="h-3.5 w-3.5" /> {pptxBusy ? "Собираем PPTX…" : "Скачать PPTX"}
              </button>
              <button type="button" onClick={() => setSlidesOpen(false)} className="rounded-lg bg-white/10 p-2 hover:bg-white/15" aria-label="Закрыть">
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>
          <main className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
            <button
              type="button"
              aria-label="Предыдущий слайд"
              disabled={slideIdx === 0}
              onClick={() => setSlideIdx((i) => Math.max(i - 1, 0))}
              className="shrink-0 rounded-xl bg-white/5 p-3 text-white/70 transition hover:bg-white/10 disabled:opacity-25"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <div className="mx-3 flex min-w-0 flex-1 items-center justify-center">
              <div className="flex aspect-[16/9] max-h-full w-full max-w-4xl flex-col justify-center overflow-y-auto rounded-3xl bg-white px-8 py-10 text-slate-900 shadow-2xl sm:px-14">
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">Слайд {slideIdx + 1} из {slides.slides.length}</p>
                <h2 className="mt-2 text-2xl font-extrabold leading-snug sm:text-3xl">{slides.slides[slideIdx]?.title}</h2>
                <ul className="mt-6 space-y-3">
                  {(slides.slides[slideIdx]?.bullets || []).map((bullet, i) => (
                    <li key={i} className="flex gap-3 text-base leading-relaxed sm:text-lg">
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <button
              type="button"
              aria-label="Следующий слайд"
              disabled={slideIdx >= slides.slides.length - 1}
              onClick={() => setSlideIdx((i) => Math.min(i + 1, slides.slides.length - 1))}
              className="shrink-0 rounded-xl bg-white/5 p-3 text-white/70 transition hover:bg-white/10 disabled:opacity-25"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </main>
          <footer className="flex items-center justify-center gap-1.5 pb-4">
            {slides.slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Слайд ${i + 1}`}
                onClick={() => setSlideIdx(i)}
                className={"h-1.5 rounded-full transition-all " + (i === slideIdx ? "w-6 bg-white" : "w-1.5 bg-white/30 hover:bg-white/50")}
              />
            ))}
          </footer>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}
