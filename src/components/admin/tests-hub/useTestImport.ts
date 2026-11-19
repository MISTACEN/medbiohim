"use client";

/**
 * Данные и действия страницы импорта теста из DOCX: разбор файла, форма
 * аттестации, правка вопросов и сохранение. Разметка — в компонентах
 * `TestImportUpload`, `TestImportInfoForm`, `TestImportQuestionsList`
 * и `TestImportReview` этой папки.
 */
import { useCallback, useState } from "react";

import { adminSaveAttestation } from "@/lib/api";
import type { Attestation, AttestationItem } from "@/types/attestations";
import { describeApiError } from "@/lib/errors";
import { importTestFromDocx, type ParsedTest } from "@/lib/documents/importTest";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import { SUBJECT_ADAPTERS } from "@/lib/learning/subjects";
import { SLUG_RE, slugify } from "./model";

export type TestImportController = ReturnType<typeof useTestImport>;

export function useTestImport() {
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

  const selectSubject = (subjectSlug: string) => {
    const subject = SUBJECT_ADAPTERS.find((s) => s.slug === subjectSlug);
    setAttestation((prev) => ({ ...prev, subject_slug: subjectSlug, subject_name: subject?.name ?? "" }));
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

  return {
    parsedTest, attestation, setAttestation,
    loading, error, saving, saveSuccess,
    previewExpanded, setPreviewExpanded,
    handleFileUpload, onDrop, onInputChange,
    updateAttestationField, selectSubject, updateQuestionField,
    handleSubmit, resetForm,
  };
}
