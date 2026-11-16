"use client";

/**
 * ИИ-действия по лекции (фаза 2.9 карты): мнемоника, ответ «как на экзамене»,
 * «как пятилетнему», «как сплетню» и схема mermaid.
 *
 * Ответ рендерится тем же LectureRenderer, что и сама лекция, поэтому блок
 * ```mermaid рисуется существующим кодом — отдельной схемной библиотеки нет.
 */
import { useEffect, useState } from "react";
import { Baby, Brain, Drama, FileText, Headphones, Loader2, Network, Printer, Sparkles, type LucideIcon } from "lucide-react";
import { aiChat, lectureCheatsheet, lecturePodcast } from "@/lib/features-api";
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
            {podcastBusy ? "Пишем и озвучиваем…" : "Подкаст по лекции"}
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
        <p className="mt-2 rounded-xl bg-[var(--primary-soft)]/40 p-3 text-sm leading-relaxed">{podcastScript}</p>
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
    </section>
  );
}
