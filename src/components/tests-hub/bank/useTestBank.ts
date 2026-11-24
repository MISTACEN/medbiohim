"use client";

/**
 * Данные и действия страницы банка вопросов: загрузка банка и прогресса,
 * фильтр по темам, ссылки на режимы прохождения и быстрое admin-исправление
 * вопроса. Разметка — в компонентах папки `components/tests-hub/bank`.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  adminUpdateBankQuestion,
  getBankProgress,
  getTestBank,
  hasToken,
  me,
  type ApiTest,
} from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { useApiRequest } from "@/hooks/useApiRequest";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  correctOf,
  isAdminResponse,
  labelOf,
  type BankContext,
  type BankQuestion,
  type EditDraft,
} from "./model";

export type TestBankController = ReturnType<typeof useTestBank>;

export function useTestBank(params: Promise<{ id: string }>) {
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [showAnswers, setShowAnswers] = useState(true);
  const [topicFilter, setTopicFilter] = useState("all");
  const [questionEdits, setQuestionEdits] = useState<Record<string, Partial<BankQuestion>>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [context, setContext] = useState<BankContext>({
    subject: "",
    module: "",
    topic: "",
    mode: "",
    count: 10,
  });

  const queryContext = useMemo(() => {
    return {
      subject: searchParams.get("subject") || "",
      module: searchParams.get("module") || "",
      topic: searchParams.get("topic") || "",
      mode: searchParams.get("mode") || "",
      count: Math.max(1, Math.min(200, Number(searchParams.get("count")) || 10)),
    };
  }, [searchParams]);

  useEffect(() => {
    setContext(queryContext);
  }, [queryContext]);

  const { data: load, loading } = useApiRequest<{
    testId: string;
    test: ApiTest | null;
    questions: BankQuestion[];
    progress: any;
    isAdmin: boolean;
    error: string;
  }>(async () => {
    const p = await params;
    const empty = { testId: p.id, test: null, questions: [], progress: null, isAdmin: false, error: "" };
    if (!hasToken()) return empty;
    const [detail, bankProgress, meRes] = await Promise.all([
      getTestBank(p.id, user?.groupId),
      getBankProgress(p.id, user?.groupId),
      me(),
    ]);
    return {
      testId: p.id,
      test: detail.ok ? detail.data.test : null,
      questions: detail.ok
        ? (detail.data.questions || []).map((q: Record<string, unknown>, i: number) => ({
            id: String(q.id || i),
            text: String(q.text || q.body || q.q || ""),
            answer: q.answer == null ? null : String(q.answer),
            answer_display: q.answer_display == null ? null : String(q.answer_display),
            options: Array.isArray(q.options) ? (q.options as BankQuestion["options"]) : [],
            type: String(q.type || "mcq"),
            is_closed: typeof q.is_closed === "boolean" ? q.is_closed : null,
            requires_order: q.requires_order === true,
            topicTitle: q.topic_title == null ? null : String(q.topic_title),
            media: Array.isArray(q.media) ? (q.media as BankQuestion["media"]) : [],
          }))
        : [],
      progress: bankProgress.ok ? bankProgress.data : null,
      isAdmin: meRes.ok && isAdminResponse(meRes),
      error: detail.ok ? "" : describeApiError(detail.error),
    };
  }, [params, user?.groupId], { enabled: !authLoading });

  const testId = load?.testId ?? "";
  const test = load?.test ?? null;
  const progress = load?.progress ?? null;
  const isAdmin = load?.isAdmin ?? false;
  const error = load?.error ?? "";
  const questions = useMemo(
    () => (load?.questions ?? []).map((q) => questionEdits[q.id] ? { ...q, ...questionEdits[q.id] } : q),
    [load?.questions, questionEdits]
  );

  const completedCorrect = Number(progress?.correct ?? 0);
  const answered = Number(progress?.answered ?? 0);
  const total = Number(progress?.total ?? questions.length);
  const percent = total ? Math.round((answered / total) * 100) : 0;

  const topicOptions = useMemo(() => Array.from(new Set(questions.map((q) => q.topicTitle).filter(Boolean))) as string[], [questions]);
  const visibleQuestions = useMemo(() => topicFilter === "all" ? questions : questions.filter((q) => q.topicTitle === topicFilter), [questions, topicFilter]);

  const modeLinks = useMemo(() => {
    const suffix = context.subject ? `&subject=${encodeURIComponent(context.subject)}` : "";
    return {
      practice: `/tests/preparation/${encodeURIComponent(testId)}?mode=prepare&count=${context.count}${suffix}`,
      solve: `/tests/preparation/${encodeURIComponent(testId)}?mode=solve&count=${context.count}${suffix}`,
      exam: `/tests/preparation/${encodeURIComponent(testId)}?mode=exam&count=${context.count}${suffix}`,
      sequential: `/tests/preparation/${encodeURIComponent(testId)}?flow=sequential&mode=prepare${suffix}`,
    };
  }, [testId, context.subject, context.count]);

  function openEditor(q: BankQuestion) {
    setEditingId(q.id);
    setDraft({
      text: q.text,
      answer: q.answer ?? "",
      options: q.options.map((o) => ({
        label: labelOf(o),
        correct: correctOf(o),
      })),
    });
    setSaveMessage("");
  }

  function closeEditor() {
    setEditingId(null);
    setDraft(null);
    setSaveMessage("");
  }

  function updateDraftOption(index: number, patch: Partial<EditDraft["options"][number]>) {
    setDraft((current) => current ? {
      ...current,
      options: current.options.map((o, i) => i === index ? { ...o, ...patch } : o),
    } : current);
  }

  async function saveQuestion() {
    if (!editingId || !draft) return;
    const text = draft.text.trim();
    const options = draft.options.map((o) => ({ label: o.label.trim(), correct: !!o.correct }));
    if (!text) {
      setSaveMessage("Введите формулировку вопроса.");
      return;
    }
    if (options.length < 2 || options.some((o) => !o.label)) {
      setSaveMessage("Нужно минимум 2 непустых варианта ответа.");
      return;
    }
    if (!options.some((o) => o.correct)) {
      setSaveMessage("Отметьте хотя бы один правильный вариант.");
      return;
    }

    setSaving(true);
    setSaveMessage("");
    const r = await adminUpdateBankQuestion(editingId, {
      text,
      answer: draft.answer.trim(),
      type: "mcq",
      options,
    });
    setSaving(false);

    if (!r.ok) {
      setSaveMessage(describeApiError(r.error));
      return;
    }

    setQuestionEdits((items) => ({
      ...items,
      [editingId]: { text, answer: draft.answer.trim(), options, type: "mcq" },
    }));
    setSaveMessage(`Сохранено. Версия ${r.data?.version_no ?? "—"}.`);
  }

  function addDraftOption() {
    setDraft((current) => current ? {
      ...current,
      options: [...current.options, { label: "", correct: false }],
    } : current);
  }

  function removeDraftOption(index: number) {
    setDraft((current) => current ? {
      ...current,
      options: current.options.filter((_, i) => i !== index),
    } : current);
  }

  return {
    loading,
    error,
    test,
    questions,
    progress,
    isAdmin,
    context,
    showAnswers,
    setShowAnswers,
    topicFilter,
    setTopicFilter,
    topicOptions,
    visibleQuestions,
    modeLinks,
    completedCorrect,
    answered,
    total,
    percent,
    editingId,
    draft,
    setDraft,
    saveMessage,
    saving,
    openEditor,
    closeEditor,
    updateDraftOption,
    addDraftOption,
    removeDraftOption,
    saveQuestion,
  };
}
