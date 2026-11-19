"use client";

/**
 * Данные и действия страницы «Вопросы тестов»: каскадные фильтры, загрузка
 * банка, редактирование вопроса и архивирование. Разметка — в компонентах
 * `TestQuestionsTable` и `TestQuestionModal` этой папки.
 */
import { useEffect, useMemo, useState } from "react";
import { adminContentArchive, adminDbList, adminUpdateBankQuestion, hasToken, type AdminDbRow } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { CORRECT_TYPES, draftToPayload, toDraft, type QuestionDraft, type QuestionOption } from "./model";

export type TestQuestionsController = ReturnType<typeof useTestQuestions>;

export function useTestQuestions() {
  const [rows, setRows] = useState<AdminDbRow[]>([]);
  const [subjects, setSubjects] = useState<AdminDbRow[]>([]);
  const [modules, setModules] = useState<AdminDbRow[]>([]);
  const [topics, setTopics] = useState<AdminDbRow[]>([]);
  const [subject, setSubject] = useState("");
  const [module, setModule] = useState("");
  const [topic, setTopic] = useState("");
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const { confirm, dialog } = useConfirm();

  async function load() {
    setLoading(true);
    const [questions, subjectRows, moduleRows, topicRows] = await Promise.all([
      adminDbList("questions", 1000),
      adminDbList("subjects", 500),
      adminDbList("modules", 500),
      adminDbList("topics", 1000),
    ]);
    setLoading(false);
    if (questions.ok) {
      setRows(questions.data.items);
      setError("");
    } else {
      setError(describeApiError(questions.error));
    }
    if (subjectRows.ok) setSubjects(subjectRows.data.items);
    if (moduleRows.ok) setModules(moduleRows.data.items);
    if (topicRows.ok) setTopics(topicRows.data.items);
  }

  useEffect(() => { if (hasToken()) void load(); }, []);

  const moduleOptions = useMemo(
    () => modules.filter((row) => !subject || String(row.subject_id) === subject),
    [modules, subject],
  );
  const topicOptions = useMemo(
    () => topics.filter((row) => !module || String(row.module_id) === module),
    [topics, module],
  );

  const visible = useMemo(
    () => rows.filter((row) => !row.archived_at
      && (!subject || String(row.subject_id) === subject)
      && (!module || String(row.module_id) === module)
      && (!topic || String(row.topic_id) === topic)),
    [rows, subject, module, topic]
  );

  function openEditor(row: AdminDbRow) {
    setError("");
    setDraft(toDraft(row));
  }

  function patchDraft(patch: Partial<QuestionDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function setType(nextType: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      // Для закрытых типов без вариантов сразу даём две пустые строки.
      const needsOptions = ["mcq", "multiple", "ordering"].includes(nextType);
      const options = needsOptions && prev.options.length < 2
        ? [...prev.options, ...Array.from({ length: 2 - prev.options.length }, () => ({ label: "", correct: false }))]
        : prev.options;
      return { ...prev, type: nextType, options };
    });
  }

  function addOption() {
    setDraft((prev) => prev ? { ...prev, options: [...prev.options, { label: "", correct: false }] } : prev);
  }

  function removeOption(index: number) {
    setDraft((prev) => prev ? { ...prev, options: prev.options.filter((_, i) => i !== index) } : prev);
  }

  function updateOption(index: number, patch: Partial<QuestionOption>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const options = prev.options.map((option, i) => {
        if (i !== index) return option;
        return { ...option, ...patch };
      });
      // Одиночный выбор: правильный только один — как чекбокс-радио.
      if (prev.type === "mcq" && patch.correct === true) {
        return { ...prev, options: options.map((option, i) => (i === index ? option : { ...option, correct: false })) };
      }
      return { ...prev, options };
    });
  }

  function validate(d: QuestionDraft): string {
    if (!d.text.trim()) return "Текст вопроса обязателен.";
    if (CORRECT_TYPES.has(d.type)) {
      if (d.options.length < 2) return "Нужно минимум 2 варианта ответа.";
      if (d.options.some((option) => !option.label.trim())) return "Заполни текст каждого варианта (или удали пустые).";
      if (!d.options.some((option) => option.correct)) return "Пометьте хотя бы один вариант как правильный.";
      if (d.type === "mcq" && d.options.filter((option) => option.correct).length !== 1) return "Для одиночного выбора должен быть ровно один правильный вариант.";
    }
    if (d.difficulty !== "" && (!/^[1-5]$/.test(d.difficulty))) return "Сложность — целое число от 1 до 5.";
    return "";
  }

  async function save() {
    if (!draft) return;
    const validationError = validate(draft);
    if (validationError) return setError(validationError);
    setBusy("save");
    const result = await adminUpdateBankQuestion(draft.id, draftToPayload(draft));
    setBusy("");
    if (!result.ok) return setError(describeApiError(result.error));
    setDraft(null);
    setError("");
    setNote("Вопрос сохранён");
    await load();
  }

  async function archive(row: AdminDbRow) {
    const agreed = await confirm({
      title: "Архивировать вопрос?",
      description: "Вопрос перестанет появляться в тестах, но останется в базе и в журнале версий.",
      confirmLabel: "Архивировать",
      danger: true,
    });
    if (!agreed) return;
    setBusy("archive-" + String(row.id));
    const result = await adminContentArchive("questions", String(row.id));
    setBusy("");
    if (!result.ok) return setError(describeApiError(result.error));
    setNote("Вопрос архивирован");
    await load();
  }

  return {
    rows, subjects, modules, topics,
    subject, setSubject, module, setModule, topic, setTopic,
    moduleOptions, topicOptions, visible,
    draft, setDraft, note, error, loading, busy,
    load, openEditor, patchDraft, setType, addOption, removeOption, updateOption, save, archive,
    confirm, dialog,
  };
}
