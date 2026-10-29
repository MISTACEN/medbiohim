"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, FileText, Images, Loader2 } from "lucide-react";
import { getMaterialFileUrl } from "@/lib/api";
import { TrainerImageViewer } from "@/components/trainers/TrainerImageViewer";

type LearningItem = {
  material_id?: string;
  trainer_id?: string;
  source_key?: string;
  title?: string;
  original_name?: string;
  original_format?: string;
  page_start?: number;
  page_end?: number;
  page_label?: string;
  exact_section?: string;
  page_note?: string;
  name?: string;
  label?: string;
  kind?: string;
};

type Props = {
  relatedLearning?: {
    methodics?: LearningItem[];
    files?: LearningItem[];
    preparations?: LearningItem[];
    electronograms?: LearningItem[];
  };
};

function labelFor(item: LearningItem, fallback: string) {
  return item.page_label || (
    item.page_start != null && item.page_end != null
      ? `стр. ${item.page_start}–${item.page_end}`
      : item.exact_section || fallback
  );
}

export function LectureLearningLinks({ relatedLearning }: Props) {
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [activeTrainer, setActiveTrainer] = useState<{ id: string; title: string; lesson?: string } | null>(null);

  const methodics = Array.isArray(relatedLearning?.methodics) ? relatedLearning!.methodics! : [];
  const files = Array.isArray(relatedLearning?.files) ? relatedLearning!.files! : [];
  const preparations = Array.isArray(relatedLearning?.preparations) ? relatedLearning!.preparations! : [];
  const electronograms = Array.isArray(relatedLearning?.electronograms) ? relatedLearning!.electronograms! : [];

  if (!methodics.length && !files.length && !preparations.length && !electronograms.length) return null;

  const openMaterial = async (materialId?: string) => {
    if (!materialId) return;
    const popup = typeof window !== "undefined" ? window.open("about:blank", "_blank", "noopener,noreferrer") : null;
    setOpeningId(materialId);
    const url = await getMaterialFileUrl(materialId);
    setOpeningId(null);
    if (url) {
      if (popup) popup.location.href = url;
      else window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    popup?.close();
  };

  return (
    <>
      <section className="card space-y-5 p-5 sm:p-6">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-[var(--primary)]" />
            <h2 className="text-base font-bold">Материалы к этой лекции</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Связано непосредственно с текущим пунктом учебного плана: методичка → файлы/схемы → препарат.
          </p>
        </div>

        {methodics.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold">Методички</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {methodics.map((item, i) => (
                <div key={`${item.material_id || item.source_key || "methodic"}-${i}`} className="rounded-2xl border border-[var(--border)] bg-white/[0.55] p-3">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{item.original_name || item.title || "Методичка"}</div>
                      <div className="mt-1 text-xs font-semibold text-[var(--primary)]">
                        {labelFor(item, "Связанный раздел")}
                      </div>
                      {item.exact_section && (
                        <div className="mt-1 text-[11px] leading-4 text-[var(--muted)]">{item.exact_section}</div>
                      )}
                      {item.page_note && (
                        <div className="mt-1 text-[10px] leading-4 text-[var(--muted)]">{item.page_note}</div>
                      )}
                      <button
                        type="button"
                        disabled={!item.material_id || openingId === item.material_id}
                        onClick={() => void openMaterial(item.material_id)}
                        className="mt-2 inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--primary)] shadow-sm hover:bg-slate-50 disabled:opacity-50"
                      >
                        {openingId === item.material_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                        Открыть файл
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {files.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold">Файлы и схемы</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {files.map((item, i) => (
                <button
                  key={`${item.material_id || item.source_key || "file"}-${i}`}
                  type="button"
                  disabled={!item.material_id || openingId === item.material_id}
                  onClick={() => void openMaterial(item.material_id)}
                  className="rounded-2xl border border-[var(--border)] bg-white/[0.55] p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
                >
                  <div className="flex items-start gap-3">
                    <Images className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-ok-fg)]" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{item.title || "Файл"}</div>
                      <div className="mt-1 text-[11px] text-[var(--muted)]">
                        {item.kind === "animation" ? "Анимация" : "Схема / таблица"}
                      </div>
                      <div className="mt-2 text-xs font-semibold text-[var(--primary)]">
                        {openingId === item.material_id ? "Открываю…" : "Открыть"}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {preparations.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Препараты ({preparations.length})</h3>
              <Link
                href="/subjects/histology?tab=trainer"
                className="text-xs font-semibold text-[var(--primary)] hover:underline"
              >
                Открыть весь тренажёр
              </Link>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {preparations.map((item, i) => (
                <button
                  key={`${item.trainer_id || item.source_key || "prep"}-${i}`}
                  type="button"
                  disabled={!item.trainer_id}
                  onClick={() => item.trainer_id && setActiveTrainer({ id: item.trainer_id, title: item.name || item.label || "Гистологический препарат" })}
                  className="rounded-2xl border border-[var(--border)] bg-white/[0.55] p-3 text-left hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
                >
                  <div className="text-sm font-semibold">{item.name || item.label || "Гистологический препарат"}</div>
                  <div className="mt-1 text-[11px] text-[var(--muted)]">Открыть фото и увеличить изображение</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {electronograms.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold">Электронограммы ({electronograms.length})</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {electronograms.map((item, i) => (
                <button
                  key={`${item.trainer_id || item.source_key || "em"}-${i}`}
                  type="button"
                  disabled={!item.trainer_id}
                  onClick={() => item.trainer_id && setActiveTrainer({ id: item.trainer_id, title: item.name || item.label || "Электронограмма" })}
                  className="rounded-2xl border border-[var(--border)] bg-white/[0.55] p-3 text-left hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
                >
                  <div className="text-sm font-semibold">{item.name || item.label || "Электронограмма"}</div>
                  <div className="mt-1 text-[11px] text-[var(--muted)]">Открыть изображение целиком</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {activeTrainer && (
        <TrainerImageViewer
          id={activeTrainer.id}
          title={activeTrainer.title}
          lesson="Связанные материалы лекции"
          onClose={() => setActiveTrainer(null)}
        />
      )}
    </>
  );
}
