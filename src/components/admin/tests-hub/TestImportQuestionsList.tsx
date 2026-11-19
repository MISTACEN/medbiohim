"use client";

import { ChevronDown, ChevronRight } from "lucide-react";

import { inputClass } from "./model";
import type { TestImportController } from "./useTestImport";

/** Раскрывающийся список вопросов импортированного теста с правкой вариантов. */
export function TestImportQuestionsList({ page }: { page: TestImportController }) {
  const { attestation, previewExpanded, setPreviewExpanded, updateQuestionField } = page;

  return (
    <div className="card">
      <button
        onClick={() => setPreviewExpanded(!previewExpanded)}
        className="flex w-full items-center justify-between py-2 text-left font-semibold"
      >
        <span>Вопросы теста</span>
        {previewExpanded ? (
          <ChevronDown className="h-5 w-5" />
        ) : (
          <ChevronRight className="h-5 w-5" />
        )}
      </button>

      {previewExpanded && (
        <div className="space-y-4">
          {attestation.stages?.[0]?.items.map((item, itemIdx) => (
            <div key={item.id} className="space-y-2 rounded-lg bg-slate-50 p-3">
              <textarea
                className={inputClass}
                rows={2}
                value={item.title}
                onChange={(e) => updateQuestionField(0, itemIdx, { title: e.target.value })}
                placeholder="Текст вопроса"
              />
              {(item.options || []).map((option, optionIdx) => (
                <div key={optionIdx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${item.id}`}
                    checked={item.correct?.[0] === optionIdx}
                    onChange={() => updateQuestionField(0, itemIdx, { correct: [optionIdx] })}
                    className="h-4 w-4"
                  />
                  <input
                    type="text"
                    className={inputClass}
                    value={option}
                    onChange={(e) => {
                      const options = [...(item.options || [])];
                      options[optionIdx] = e.target.value;
                      updateQuestionField(0, itemIdx, { options });
                    }}
                    placeholder="Вариант ответа"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
