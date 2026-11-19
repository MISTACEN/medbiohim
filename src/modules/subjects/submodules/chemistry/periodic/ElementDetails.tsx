"use client";

/**
 * Карточка элемента (диалог): краткие метаданные, электронная конфигурация,
 * первооткрыватели и ссылки на Wikipedia/Wikidata.
 */
import { type RefObject } from "react";
import { ExternalLink, X } from "lucide-react";
import {
  blockLabelRu,
  categoryLabelRu,
  formatAtomicMass,
  phaseLabelRu,
  primarySourceLabel,
  type ChemicalElement,
} from "@/lib/elements";
import { categoryCellStyle } from "./model";

interface ElementDetailsProps {
  element: ChemicalElement;
  dialogRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

export function ElementDetails({ element, dialogRef, onClose }: ElementDetailsProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="element-dialog-title"
        className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border p-5 shadow-xl sm:rounded-2xl sm:p-6"
        // Непрозрачный фон: в темах с полупрозрачным --card сквозь карточку
        // элемента просвечивала таблица и оверлей.
        style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--text)" }}
      >
        <div className="flex items-start gap-4">
          <div
            className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-xl border"
            style={categoryCellStyle(element.category)}
          >
            <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
              {element.number}
            </span>
            <span className="text-2xl font-bold leading-none">{element.symbol}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="element-dialog-title" className="text-xl font-bold">
              {element.name_ru}
            </h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {element.name_en} · {categoryLabelRu(element.category)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть карточку элемента"
            className="rounded-lg border p-2 transition hover:border-[var(--primary)]"
            style={{ borderColor: "var(--border)" }}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt style={{ color: "var(--muted)" }}>Атомная масса</dt>
            <dd className="font-medium tabular-nums">
              {formatAtomicMass(element.atomic_mass)} а.е.м.
            </dd>
          </div>
          <div>
            <dt style={{ color: "var(--muted)" }}>Группа / период</dt>
            <dd className="font-medium tabular-nums">
              {element.group} / {element.period}
            </dd>
          </div>
          <div>
            <dt style={{ color: "var(--muted)" }}>Блок</dt>
            <dd className="font-medium">{blockLabelRu(element.block)}</dd>
          </div>
          <div>
            <dt style={{ color: "var(--muted)" }}>Состояние (по источнику)</dt>
            <dd className="font-medium">{phaseLabelRu(element.phase)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt style={{ color: "var(--muted)" }}>Электронная конфигурация</dt>
            <dd className="font-medium">
              <span className="break-words">{element.electron_configuration_semantic}</span>
              <span className="mt-1 block break-words text-xs" style={{ color: "var(--muted)" }}>
                {element.electron_configuration}
              </span>
            </dd>
          </div>
          {element.discovered_by && (
            <div>
              <dt style={{ color: "var(--muted)" }}>Открытие / первооткрыватель</dt>
              <dd className="font-medium">{element.discovered_by}</dd>
            </div>
          )}
          {element.named_by && (
            <div>
              <dt style={{ color: "var(--muted)" }}>Названо в честь</dt>
              <dd className="font-medium">{element.named_by}</dd>
            </div>
          )}
        </dl>

        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <a
            href={element.wikipedia}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:text-[var(--primary)]"
          >
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /> Wikipedia
          </a>
          <a
            href={`https://www.wikidata.org/wiki/${element.wikidata}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:text-[var(--primary)]"
          >
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /> Wikidata {element.wikidata}
          </a>
        </div>
        <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>
          {primarySourceLabel()}. Русское название — метка Wikidata (CC0 1.0). Значения сохранены как в источнике,
          без пересчёта.
        </p>
      </div>
    </div>
  );
}
