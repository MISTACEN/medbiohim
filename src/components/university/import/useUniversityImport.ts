"use client";

/** Импорт JSON из Bridge: разбор, выбор вопросов, dry-run и публикация. */
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { adminContentImport, adminDbList, hasToken } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { describeApiError } from "@/lib/errors";
import { normalizeBundle, type ImportError, type NormalizedBundle, type SubjectRow } from "@/components/university/import/model";

export type UniversityImportState = ReturnType<typeof useUniversityImport>;

export function useUniversityImport() {
  const { user, loading: authLoading } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [rawText, setRawText] = useState("");
  const [bundle, setBundle] = useState<NormalizedBundle | null>(null);
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [subjectKey, setSubjectKey] = useState("");
  const [testTitle, setTestTitle] = useState("");
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [parseError, setParseError] = useState("");
  const [subjectsError, setSubjectsError] = useState("");

  const isAdmin = user?.role === "admin" || user?.roles?.includes("admin");

  useEffect(() => {
    if (!hasToken() || !isAdmin) return;
    void adminDbList("subjects", 500).then((response) => {
      if (!response.ok) {
        setSubjectsError(describeApiError(response.error) || "Не удалось загрузить предметы");
        return;
      }
      const items = Array.isArray(response.data?.items) ? response.data.items : [];
      setSubjects(
        items
          .map((item: Record<string, unknown>) => ({
            id: String(item.id || ""),
            name: String(item.name || "Предмет"),
            slug: item.slug == null ? null : String(item.slug),
          }))
          .filter((item: SubjectRow) => item.id)
      );
    });
  }, [isAdmin]);

  const includedQuestions = useMemo(
    () => (bundle?.questions || []).filter((question) => included.has(question.key)),
    [bundle, included]
  );

  function analyze(text: string) {
    setParseError("");
    setMessage("");
    setErrors([]);
    try {
      const parsed = JSON.parse(text) as unknown;
      const normalized = normalizeBundle(parsed);
      if (!normalized.questions.length) {
        setBundle(null);
        setIncluded(new Set());
        setParseError("В JSON не найдено ни одного корректного вопроса.");
        return;
      }
      setBundle(normalized);
      setIncluded(new Set(normalized.questions.map((question) => question.key)));
      setTestTitle(normalized.testTitle);
      setMessage(
        `Распознано вопросов: ${normalized.questions.length}. Проверьте текст, правильные ответы и предмет перед импортом.`
      );
    } catch (cause) {
      setBundle(null);
      setIncluded(new Set());
      setParseError(cause instanceof Error ? cause.message : "Некорректный JSON");
    }
  }

  function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setRawText(text);
      analyze(text);
    };
    reader.readAsText(file, "utf-8");
    event.target.value = "";
  }

  function toggleQuestion(key: string) {
    setIncluded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function clearAll() {
    setRawText("");
    setBundle(null);
    setMessage("");
    setErrors([]);
    setParseError("");
  }

  function buildPayload(dryRun: boolean) {
    if (!bundle) throw new Error("Сначала загрузите JSON");
    if (!subjectKey) throw new Error("Выберите предмет");
    if (!testTitle.trim()) throw new Error("Укажите название теста");
    if (!includedQuestions.length) throw new Error("Оставьте хотя бы один вопрос");
    const testKey = bundle.testKey;
    return {
      tests: [
        {
          test_key: testKey,
          title: testTitle.trim(),
          subject_key: subjectKey,
          max_attempts: 3,
          is_published: publish,
        },
      ],
      questions: includedQuestions.map((question) => ({
        question_key: question.key,
        text: question.text,
        subject_key: subjectKey,
        type: question.type,
        answer: question.answer,
        options: question.options,
        is_published: publish,
      })),
      test_questions: includedQuestions.map((question, index) => ({
        test_key: testKey,
        question_key: question.key,
        order_index: index + 1,
      })),
      dry_run: dryRun,
    };
  }

  async function run(dryRun: boolean) {
    setBusy(true);
    setErrors([]);
    setMessage(dryRun ? "Проверяю пакет через API…" : "Импортирую пакет…");
    try {
      const payload = buildPayload(dryRun);
      const response = await adminContentImport(payload);
      if (!response.ok) {
        setMessage(describeApiError(response.error) || "Импорт отклонён");
        return;
      }
      const responseErrors = Array.isArray(response.data?.errors) ? response.data.errors : [];
      setErrors(responseErrors);
      const counts = response.data?.counts || response.data?.created || response.data?.imported;
      if (dryRun) {
        setMessage(
          responseErrors.length
            ? "Проверка нашла ошибки. Исправьте JSON и повторите."
            : `Проверка пройдена: тест 1, вопросов ${counts?.questions ?? includedQuestions.length}, связей ${counts?.test_questions ?? includedQuestions.length}.`
        );
      } else {
        setMessage(
          `Импорт завершён: тест 1, вопросов ${counts?.questions ?? includedQuestions.length}, связей ${counts?.test_questions ?? includedQuestions.length}.`
        );
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Не удалось выполнить импорт");
    } finally {
      setBusy(false);
    }
  }

  return {
    user,
    authLoading,
    isAdmin,
    fileInput,
    rawText,
    setRawText,
    bundle,
    included,
    setIncluded,
    subjects,
    subjectKey,
    setSubjectKey,
    testTitle,
    setTestTitle,
    publish,
    setPublish,
    busy,
    message,
    errors,
    parseError,
    subjectsError,
    includedQuestions,
    analyze,
    readFile,
    toggleQuestion,
    clearAll,
    run,
    hasToken: hasToken(),
  };
}
