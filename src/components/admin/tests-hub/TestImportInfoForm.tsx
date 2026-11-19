"use client";

import { SUBJECT_ADAPTERS } from "@/lib/learning/subjects";
import { inputClass, labelClass } from "./model";
import type { TestImportController } from "./useTestImport";

/** Карточка «Общая информация»: название, предмет, slug, проходной балл, публикация. */
export function TestImportInfoForm({ page }: { page: TestImportController }) {
  const { attestation, updateAttestationField, selectSubject } = page;

  return (
    <div className="card">
      <h3 className="mb-3 font-semibold">Общая информация</h3>

      <div className="space-y-3">
        <div>
          <label className={labelClass}>Название теста</label>
          <input
            type="text"
            className={inputClass}
            value={attestation.title || ""}
            onChange={(e) => updateAttestationField("title", e.target.value)}
            placeholder="Введите название теста"
          />
        </div>

        <div>
          <label className={labelClass}>Предмет</label>
          <select
            className={inputClass}
            value={attestation.subject_slug || ""}
            onChange={(e) => selectSubject(e.target.value)}
          >
            <option value="">Выберите предмет</option>
            {SUBJECT_ADAPTERS.map((subject) => (
              <option key={subject.slug} value={subject.slug}>{subject.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Slug (URL)</label>
          <input
            type="text"
            className={inputClass}
            value={attestation.slug || ""}
            onChange={(e) => updateAttestationField("slug", e.target.value)}
            placeholder="teoriya-veroyatnostej"
          />
        </div>

        <div>
          <label className={labelClass}>Проходной балл (%)</label>
          <input
            type="number"
            min="0"
            max="100"
            className={inputClass}
            value={attestation.pass_score ?? 70}
            onChange={(e) => updateAttestationField("pass_score", parseInt(e.target.value) || 70)}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="published"
            checked={attestation.is_published || false}
            onChange={(e) => updateAttestationField("is_published", e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <label htmlFor="published" className="text-sm">Опубликовать сразу после создания</label>
        </div>
      </div>
    </div>
  );
}
