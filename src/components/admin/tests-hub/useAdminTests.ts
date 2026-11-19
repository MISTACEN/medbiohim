"use client";

/**
 * Данные и действия страницы «Тесты → предметы → темы»: справочники, фильтры,
 * редактирование теста и сборка одного или нескольких вариантов.
 * Разметка — в компонентах папки `components/admin/tests-hub`.
 */
import { useEffect, useMemo, useState } from "react";
import {
  adminBuildTestVariants,
  adminContentArchive,
  adminDbList,
  adminDbUpdate,
  hasToken,
  type AdminDbRow,
} from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { questionText, type BuildQuestion } from "./model";

export type AdminTestsController = ReturnType<typeof useAdminTests>;

export function useAdminTests() {
  const { confirm, dialog } = useConfirm();
  const [tests, setTests] = useState<AdminDbRow[]>([]);
  const [subjects, setSubjects] = useState<AdminDbRow[]>([]);
  const [modules, setModules] = useState<AdminDbRow[]>([]);
  const [topics, setTopics] = useState<AdminDbRow[]>([]);
  const [questions, setQuestions] = useState<BuildQuestion[]>([]);
  const [subject, setSubject] = useState("");
  const [module, setModule] = useState("");
  const [topic, setTopic] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<AdminDbRow | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderBusy, setBuilderBusy] = useState(false);
  const [builderTitle, setBuilderTitle] = useState("Новый тест");
  const [builderDescription, setBuilderDescription] = useState("");
  const [builderSubject, setBuilderSubject] = useState("");
  const [builderModule, setBuilderModule] = useState("");
  const [builderTopic, setBuilderTopic] = useState("");
  const [builderTimeLimit, setBuilderTimeLimit] = useState("1800");
  const [builderMaxAttempts, setBuilderMaxAttempts] = useState("1");
  const [builderPublished, setBuilderPublished] = useState(false);
  const [builderVariants, setBuilderVariants] = useState("1");
  const [builderQuestionsPerTest, setBuilderQuestionsPerTest] = useState("10");
  const [builderQuestionSearch, setBuilderQuestionSearch] = useState("");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    const [a, b, c, d, e] = await Promise.all([
      adminDbList("tests", 500),
      adminDbList("subjects", 500),
      adminDbList("modules", 500),
      adminDbList("topics", 1000),
      adminDbList("questions", 5000),
    ]);
    if (a.ok) setTests(a.data.items || []);
    if (b.ok) setSubjects(b.data.items || []);
    if (c.ok) setModules(c.data.items || []);
    if (d.ok) setTopics(d.data.items || []);
    if (e.ok) setQuestions((e.data.items || []) as BuildQuestion[]);
    setLoading(false);
  }

  useEffect(() => {
    if (hasToken()) void load();
  }, []);

  const filtered = useMemo(
    () =>
      tests.filter(
        (t) =>
          !t.archived_at &&
          (!subject || String(t.subject_id) === subject) &&
          (!module || String(t.module_id) === module) &&
          (!topic || String(t.topic_id) === topic) &&
          (!q || String(t.title).toLowerCase().includes(q.toLowerCase())),
      ),
    [tests, subject, module, topic, q],
  );

  const visibleTopics = topics.filter(
    (t) =>
      !subject ||
      modules.some(
        (m) =>
          String(m.id) === String(t.module_id) &&
          String(m.subject_id) === subject,
      ),
  );

  const builderModules = modules.filter(
    (m) => !builderSubject || String(m.subject_id) === builderSubject,
  );
  const builderTopics = topics.filter(
    (t) => !builderModule || String(t.module_id) === builderModule,
  );

  const builderPool = useMemo(() => {
    const needle = builderQuestionSearch.trim().toLowerCase();
    return questions
      .filter((item) => !item.archived_at && item.is_published !== false)
      .filter((item) => !builderSubject || String(item.subject_id ?? "") === builderSubject)
      .filter((item) => !builderModule || String(item.module_id ?? "") === builderModule)
      .filter((item) => !builderTopic || String(item.topic_id ?? "") === builderTopic)
      .filter((item) => !needle || questionText(item).toLowerCase().includes(needle))
      .slice(0, 500);
  }, [questions, builderSubject, builderModule, builderTopic, builderQuestionSearch]);

  function resetBuilder() {
    setBuilderTitle("Новый тест");
    setBuilderDescription("");
    setBuilderSubject("");
    setBuilderModule("");
    setBuilderTopic("");
    setBuilderTimeLimit("1800");
    setBuilderMaxAttempts("1");
    setBuilderPublished(false);
    setBuilderVariants("1");
    setBuilderQuestionsPerTest("10");
    setBuilderQuestionSearch("");
    setSelectedQuestionIds([]);
    setMessage("");
  }

  function openBuilder() {
    resetBuilder();
    setBuilderOpen(true);
  }

  function toggleQuestion(id: string) {
    setSelectedQuestionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function selectVisibleQuestions() {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      builderPool.forEach((item) => next.add(String(item.id)));
      return Array.from(next);
    });
  }

  function clearSelectedQuestions() {
    setSelectedQuestionIds([]);
  }

  async function buildTests() {
    const title = builderTitle.trim();
    const variants = Math.max(1, Math.min(20, Number(builderVariants) || 1));
    const perTest = Math.max(1, Math.min(200, Number(builderQuestionsPerTest) || 1));
    const pool = questions.filter((item) =>
      selectedQuestionIds.includes(String(item.id)),
    );

    if (!title) {
      setMessage("Укажи название теста.");
      return;
    }
    if (!builderSubject) {
      setMessage("Выбери предмет.");
      return;
    }
    if (pool.length < perTest) {
      setMessage(
        "Выбрано " + pool.length + " вопросов, а для одного теста нужно " + perTest + ".",
      );
      return;
    }

    setBuilderBusy(true);
    setMessage("");

    try {
      // MA10: вся сборка — один запрос. На бэке RPC собирает все варианты и
      // ссылки на вопросы в одной транзакции: либо всё записано, либо ничего,
      // «частичного успеха» больше не бывает.
      const result = await adminBuildTestVariants({
        title,
        description: builderDescription.trim(),
        subject_id: builderSubject,
        module_id: builderModule || null,
        topic_id: builderTopic || null,
        time_limit_sec: builderTimeLimit.trim() === "" ? null : Number(builderTimeLimit),
        max_attempts: builderMaxAttempts.trim() === "" ? null : Number(builderMaxAttempts),
        is_published: builderPublished,
        variants,
        per_test: perTest,
        question_ids: pool.map((item) => String(item.id)),
      });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }

      const created = Array.isArray(result.data?.created) ? result.data.created : [];
      const questionCount = Number(result.data?.questions_per_test || perTest);
      setMessage(
        variants === 1
          ? "Тест «" + title + "» собран: " + questionCount + " вопросов."
          : "Собрано тестов: " + created.length + ". В каждом по " + questionCount + " вопросов.",
      );
      setBuilderOpen(false);
      resetBuilder();
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось собрать тесты.",
      );
    } finally {
      setBuilderBusy(false);
    }
  }

  async function save() {
    if (!editing) return;
    const payload = { ...editing };
    delete payload.id;
    const r = await adminDbUpdate("tests", String(editing.id), payload);
    if (r.ok) {
      setMessage("Тест сохранён");
      setEditing(null);
      await load();
    } else setMessage(describeApiError(r.error));
  }

  async function remove(t: AdminDbRow) {
    const agreed = await confirm({
      title: "Архивировать тест?",
      description: "Он исчезнет из опубликованного списка, но останется в базе и в журнале версий.",
      confirmLabel: "Архивировать",
      danger: true,
    });
    if (!agreed) return;
    const r = await adminContentArchive("tests", String(t.id));
    if (r.ok) {
      setMessage("Тест архивирован");
      await load();
    } else setMessage(describeApiError(r.error));
  }

  const selectedCount = selectedQuestionIds.length;
  const variants = Math.max(1, Math.min(20, Number(builderVariants) || 1));
  const perTest = Math.max(1, Math.min(200, Number(builderQuestionsPerTest) || 1));

  return {
    loading, tests, subjects, modules, topics, questions,
    subject, setSubject, module, setModule, topic, setTopic, q, setQ,
    filtered, visibleTopics,
    editing, setEditing, message, save, remove,
    builderOpen, setBuilderOpen, openBuilder, resetBuilder, builderBusy,
    builderTitle, setBuilderTitle, builderDescription, setBuilderDescription,
    builderSubject, setBuilderSubject, builderModule, setBuilderModule, builderTopic, setBuilderTopic,
    builderTimeLimit, setBuilderTimeLimit, builderMaxAttempts, setBuilderMaxAttempts,
    builderPublished, setBuilderPublished, builderVariants, setBuilderVariants,
    builderQuestionsPerTest, setBuilderQuestionsPerTest, builderQuestionSearch, setBuilderQuestionSearch,
    selectedQuestionIds, toggleQuestion, selectVisibleQuestions, clearSelectedQuestions,
    builderPool, builderModules, builderTopics,
    selectedCount, variants, perTest,
    buildTests,
    confirm, dialog,
  };
}
