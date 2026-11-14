"use client";

/**
 * ИИ-действия по лекции (фаза 2.9 карты): мнемоника, ответ «как на экзамене»,
 * «как пятилетнему», «как сплетню» и схема mermaid.
 *
 * Ответ рендерится тем же LectureRenderer, что и сама лекция, поэтому блок
 * ```mermaid рисуется существующим кодом — отдельной схемной библиотеки нет.
 */
import { useState } from "react";
import { Baby, Brain, Drama, Loader2, Network, Sparkles, type LucideIcon } from "lucide-react";
import { aiChat } from "@/lib/features-api";
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
  title,
  subjectSlug,
  excerpt,
}: {
  title: string;
  subjectSlug?: string | null;
  excerpt?: string | null;
}) {
  const [active, setActive] = useState<AiPresetId | null>(null);
  const [answer, setAnswer] = useState("");
  const [meta, setMeta] = useState<{ provider?: string; model?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
