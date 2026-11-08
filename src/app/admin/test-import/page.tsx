"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Save, 
  AlertTriangle,
  Loader2,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { adminSaveAttestation } from "@/lib/api";
import type { Attestation, AttestationItem } from "@/types/attestations";
import { describeApiError } from "@/lib/errors";
import { importTestFromDocx, type ParsedTest } from "@/lib/documents/importTest";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import { SUBJECT_ADAPTERS } from "@/lib/learning/subjects";

const inputClass =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100";
const labelClass = "mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400";

export default function AdminTestImportPage() {
  const [parsedTest, setParsedTest] = useState<ParsedTest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(true);
  
  // Состояние формы — аттестация на основе импортированного теста
  const [attestation, setAttestation] = useState<Partial<Attestation>>({
    slug: "",
    subject_slug: "",
    type: "test",
    title: "",
    pass_score: 70,
    is_published: false,
    stages: []
  });

  useUnsavedChanges(Boolean(parsedTest) && !saveSuccess);

  const handleFileUpload = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setSaveSuccess(false);
    
    try {
      const result = await importTestFromDocx(file);
      setParsedTest(result);
      
      // Формируем аттестацию на основе импортированного теста; предмет выбирает админ
      setAttestation({
        slug: slugify(result.title),
        subject_slug: "",
        type: "test",
        title: result.title,
        pass_score: 70,
        is_published: false,
        stages: [
          {
            id: `stage-${Date.now()}`,
            title: "Основной этап",
            items: result.questions.map((q, idx) => ({
              id: `item-${Date.now()}-${idx}`,
              kind: "test",
              title: q.question,
              options: q.options,
              correct: [q.correctIndex]
            }))
          }
        ]
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось разобрать файл");
    } finally {
      setLoading(false);
    }
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const docxFiles = files.filter(f => f.name.endsWith('.docx') || f.type.includes('word'));
    
    if (docxFiles.length > 0) {
      await handleFileUpload(docxFiles[0]);
    } else {
      setError("Пожалуйста, перетащите .docx файл");
    }
  }, [handleFileUpload]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  const updateAttestationField = <K extends keyof Attestation>(
    field: K,
    value: Attestation[K]
  ) => {
    setAttestation(prev => ({ ...prev, [field]: value }));
  };

  const updateQuestionField = (
    stageIdx: number,
    itemIdx: number,
    values: Partial<AttestationItem>
  ) => {
    setAttestation(prev => {
      const stages = prev.stages?.map((stage, i) =>
        i === stageIdx
          ? { ...stage, items: stage.items.map((item, j) => (j === itemIdx ? { ...item, ...values } : item)) }
          : stage
      );
      return stages ? { ...prev, stages } : prev;
    });
  };

  const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

  const handleSubmit = async () => {
    const subject = (attestation.subject_slug || "").trim();
    const slug = (attestation.slug || "").trim();
    if (!attestation.title?.trim() || !attestation.stages?.length) {
      setError("Заполните название и проверьте вопросы");
      return;
    }
    if (!SLUG_RE.test(subject) || !SLUG_RE.test(slug)) {
      setError("Выберите предмет и укажите slug: латиница, цифры, дефис");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await adminSaveAttestation(subject, slug, { ...attestation, subject_slug: subject, slug });
      if (!result.ok) {
        setError(describeApiError(result.error));
      } else {
        setSaveSuccess(true);
        setParsedTest(null);
        window.location.href = "/admin/attestations";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setParsedTest(null);
    setAttestation({});
    setError(null);
    setSaveSuccess(false);
  };

  if (!parsedTest) {
    return (
      <main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
        <header>
          <Link href="/admin" className="text-sm text-indigo-600">← Админ</Link>
          <h1 className="mt-1 page-title flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Импорт теста из документа
          </h1>
          <p className="page-subtitle">
            Перетащите DOCX файл или загрузите его. Поддерживается формат с вопросами и вариантами ответов.
          </p>
        </header>

        {!error && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={onDrop}
            className="card border-2 border-dashed border-indigo-200 bg-indigo-50/50 p-12 text-center hover:border-indigo-300 transition-colors"
          >
            <Upload className="mx-auto mb-4 h-16 w-16 text-indigo-400" />
            <h3 className="text-lg font-semibold text-slate-700">Загрузить тест из DOCX</h3>
            <p className="mt-2 text-sm text-slate-500">
              Перетащите файл сюда или нажмите кнопку ниже
            </p>
            <label className={`btn-primary mt-6 inline-flex cursor-pointer ${loading ? "pointer-events-none opacity-50" : ""}`}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Разбираю...</> : <span>Выбрать файл</span>}
              <input
                type="file"
                accept=".docx"
                className="hidden"
                onChange={onInputChange}
              />
            </label>
            <div className="mt-8 rounded-lg bg-white p-4 text-left">
              <h4 className="font-semibold text-slate-700">Формат файла:</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
                <li><b>Вопросы</b> начинаются с цифры и точки: <code>1. Текст вопроса</code></li>
                <li><b>Правильный ответ</b> помечается <code>@1.</code>, <code>@2.</code> и т.д.</li>
                <li><b>Неправильные ответы</b> помечаются <code>#1.</code>, <code>#2.</code></li>
              </ul>
              <div className="mt-3 rounded bg-slate-100 p-3 text-xs">
                <pre className="whitespace-pre-wrap">{`1. Какой символ используется для правильного ответа?
@1. Правильный вариант
#2. Неправильный вариант
#3. Ещё неправильный`}</pre>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="card border-l-4 border-l-red-500 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <XCircle className="h-6 w-6 text-red-500" />
              <div>
                <h3 className="font-semibold text-red-700">Ошибка загрузки</h3>
                <p className="mt-1 text-sm text-red-600">{error}</p>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header>
        <Link href="/admin" className="text-sm text-indigo-600">← Админ</Link>
        <h1 className="mt-1 page-title flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6" />
          Проверка и сохранение теста
        </h1>
        <p className="page-subtitle">
          Найдено вопросов: <b>{parsedTest.questions.length}</b>. Проверьте корректность данных и сохраните.
        </p>
      </header>

      {/* Предупреждения */}
      {(error || saveSuccess) && (
        <div className={`rounded-xl px-4 py-3 ${
          saveSuccess 
            ? "bg-green-50 text-green-700" 
            : "bg-red-50 text-red-700"
        }`}>
          <div className="flex items-center gap-2">
            {saveSuccess ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
            <span className="font-medium">{saveSuccess ? "Сохранено успешно!" : error}</span>
          </div>
        </div>
      )}

      {/* Форма аттестации */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Общая информация */}
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
                  onChange={(e) => {
                    const subject = SUBJECT_ADAPTERS.find((s) => s.slug === e.target.value);
                    setAttestation((prev) => ({ ...prev, subject_slug: e.target.value, subject_name: subject?.name ?? "" }));
                  }}
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

          {/* Вопросы */}
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
        </div>

        {/* Боковая панель */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="mb-3 font-semibold">Детали</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Источник:</span>
                <b className="text-right">{parsedTest.sourceName}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Всего вопросов:</span>
                <b className="text-right">{parsedTest.questions.length}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Разбрано:</span>
                <b className="text-right">{new Date(parsedTest.parsedAt).toLocaleTimeString()}</b>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              disabled={saving}
              onClick={handleSubmit}
              className={`btn-primary flex items-center justify-center gap-2 ${saving ? "pointer-events-none opacity-50" : ""}`}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Сохраняю...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Сохранить тест
                </>
              )}
            </button>

            <button
              onClick={resetForm}
              className="btn-secondary"
            >
              Загрузить другой файл
            </button>
          </div>

          <div className="rounded-lg bg-blue-50 p-4 text-xs text-blue-700">
            <strong>Подсказка:</strong> Вы можете редактировать вопросы и варианты ответов перед сохранением.
          </div>
        </div>
      </div>
    </main>
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\- ]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-|-$/g, "");
}
