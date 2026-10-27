"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardList,
  CopyPlus,
  Info,
  Loader2,
  Pencil,
  RefreshCcw,
  Search,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";
import {
  adminContentArchive,
  adminDbInsert,
  adminDbList,
  adminDbUpdate,
  AdminDbRow,
  hasToken,
} from "@/lib/api";
import { useConfirm } from "@/components/ui/ConfirmDialog";

type BuildQuestion = AdminDbRow & {
  id: string | number;
  text?: string;
  body?: string;
  question?: string;
  type?: string;
  difficulty?: number;
  subject_id?: string | null;
  module_id?: string | null;
  topic_id?: string | null;
  is_published?: boolean;
  archived_at?: string | null;
};

function questionText(item: BuildQuestion) {
  return String(item.text ?? item.body ?? item.question ?? "Вопрос без текста");
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function AdminTestsPage() {
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
    const created: string[] = [];

    try {
      for (let variant = 1; variant <= variants; variant += 1) {
        const chosen = shuffle(pool).slice(0, perTest);
        const finalTitle =
          variants === 1 ? title : title + " — Вариант " + variant;

        const createdTest = await adminDbInsert("tests", {
          title: finalTitle,
          description:
            builderDescription.trim() ||
            "Собран через конструктор тестов. Вопросов: " +
              perTest +
              ". Вариант: " +
              variant +
              "/" +
              variants +
              ".",
          subject_id: builderSubject,
          module_id: builderModule || null,
          topic_id: builderTopic || null,
          time_limit_sec:
            builderTimeLimit.trim() === "" ? null : Number(builderTimeLimit),
          max_attempts:
            builderMaxAttempts.trim() === "" ? null : Number(builderMaxAttempts),
          is_published: builderPublished,
        });

        if (!createdTest.ok) {
          throw new Error(createdTest.error?.message || "Не удалось создать тест");
        }

        const testId = String(createdTest.data?.item?.id || "");
        if (!testId) throw new Error("Сервер не вернул id нового теста");
        created.push(testId);

        for (let order = 0; order < chosen.length; order += 1) {
          const link = await adminDbInsert("test_questions", {
            test_id: testId,
            question_id: String(chosen[order].id),
            order_index: order,
          });
          if (!link.ok) {
            await adminContentArchive("tests", testId);
            throw new Error(
              link.error?.message || "Не удалось добавить вопрос №" + (order + 1),
            );
          }
        }
      }

      setMessage(
        variants === 1
          ? "Тест «" + title + "» собран: " + perTest + " вопросов."
          : "Собрано тестов: " + variants + ". В каждом по " + perTest + " вопросов.",
      );
      setBuilderOpen(false);
      resetBuilder();
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось собрать тесты.",
      );
      if (created.length) {
        setMessage(
          (prev) => prev + " Создано до ошибки: " + created.length + ".",
        );
      }
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
    } else setMessage(r.error.message);
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
    } else setMessage(r.error.message);
  }

  if (!hasToken())
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">Тесты</h1>
        <Link href="/login" className="btn-primary mt-4 inline-flex">
          Войти
        </Link>
      </div>
    );

  const selectedCount = selectedQuestionIds.length;
  const variants = Math.max(1, Math.min(20, Number(builderVariants) || 1));
  const perTest = Math.max(1, Math.min(200, Number(builderQuestionsPerTest) || 1));

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-indigo-600">← Админ</Link>
          <Link href="/admin/test-questions" className="ml-4 text-sm text-indigo-600">
            Вопросы тестов →
          </Link>
          <h1 className="mt-1 page-title">Тесты → предметы → темы</h1>
          <p className="page-subtitle">
            Перенос, исправление, публикация и сбор одного или нескольких тестов из существующего банка вопросов.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={openBuilder}>
            <CopyPlus className="h-4 w-4" /> Собрать тест
          </button>
          <Link href="/admin/content-import" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">
            Импорт Excel
          </Link>
        </div>
      </header>

      <section className="card grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl bg-indigo-50 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-indigo-900">
            <ClipboardList className="h-4 w-4" /> Что такое тест
          </div>
          <p className="mt-2 text-xs leading-5 text-indigo-900">
            Тест — это контейнер: название + предмет/тема + настройки + список вопросов. Сам вопрос хранится отдельно в общем банке и может входить в несколько разных тестов.
          </p>
        </div>
        <div className="rounded-2xl bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-900">
            <Info className="h-4 w-4" /> Как отличить хороший тест
          </div>
          <p className="mt-2 text-xs leading-5 text-emerald-900">
            У него однозначное название, правильный предмет и тема, реальное количество вопросов, нет случайных вопросов другого раздела и опубликован только после проверки состава.
          </p>
        </div>
        <div className="rounded-2xl bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <Shuffle className="h-4 w-4" /> Сбор нескольких
          </div>
          <p className="mt-2 text-xs leading-5 text-amber-900">
            Выбираешь общий пул вопросов, указываешь число вариантов и размер каждого. Каждый вариант получает свой набор вопросов и имя «… — Вариант 1», «… — Вариант 2» и т.д.
          </p>
        </div>
      </section>

      <div className="card grid gap-3 md:grid-cols-4">
        <label className="text-sm">
          Поиск
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input mt-1 w-full" placeholder="Название" />
        </label>
        <label className="text-sm">
          Предмет
          <select
            value={subject}
            onChange={(e) => { setSubject(e.target.value); setModule(""); setTopic(""); }}
            className="input mt-1 w-full"
          >
            <option value="">Все</option>
            {subjects.map((s) => <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Модуль
          <select
            value={module}
            onChange={(e) => { setModule(e.target.value); setTopic(""); }}
            className="input mt-1 w-full"
          >
            <option value="">Все модули</option>
            {modules.filter((m) => !subject || String(m.subject_id) === subject).map((m) => (
              <option key={String(m.id)} value={String(m.id)}>{String(m.title ?? m.name)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Тема
          <select value={topic} onChange={(e) => setTopic(e.target.value)} className="input mt-1 w-full">
            <option value="">Все темы</option>
            {visibleTopics.map((t) => <option key={String(t.id)} value={String(t.id)}>{String(t.name ?? t.title)}</option>)}
          </select>
        </label>
      </div>

      {message && <div className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-700">{message}</div>}

      {loading ? (
        <div className="card flex items-center gap-2 p-5 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаю тесты и банк вопросов…
        </div>
      ) : (
        <div className="card overflow-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="border-b text-left"><th className="p-3">Тест</th><th className="p-3">Предмет</th><th className="p-3">Тема</th><th className="p-3">Публикация</th><th className="p-3">Действия</th></tr></thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={String(t.id)} className="border-b">
                  <td className="p-3 font-medium">{String(t.title)}</td>
                  <td className="p-3">{String(subjects.find((s) => String(s.id) === String(t.subject_id))?.name ?? "—")}</td>
                  <td className="p-3">{String(topics.find((x) => String(x.id) === String(t.topic_id))?.name ?? topics.find((x) => String(x.id) === String(t.topic_id))?.title ?? "—")}</td>
                  <td className="p-3">{t.is_published ? <span className="text-emerald-600">Опубликован</span> : <span className="text-slate-500">Черновик</span>}</td>
                  <td className="p-3">
                    <button className="mr-2 rounded-lg bg-indigo-50 p-2 text-indigo-700" onClick={() => setEditing({ ...t })} title="Редактировать"><Pencil className="h-4 w-4" /></button>
                    <button className="rounded-lg bg-rose-50 p-2 text-rose-700" onClick={() => void remove(t)} title="Архивировать"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <div className="p-8 text-center text-sm text-slate-500">Тестов не найдено.</div>}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto">
            <h2 className="text-lg font-bold">Редактировать тест</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm md:col-span-2">Название<input className="input mt-1 w-full" value={String(editing.title ?? "")} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></label>
              <label className="text-sm">Предмет<select className="input mt-1 w-full" value={String(editing.subject_id ?? "")} onChange={(e) => setEditing({ ...editing, subject_id: e.target.value, module_id: null, topic_id: null })}>{subjects.map((s) => <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>)}</select></label>
              <label className="text-sm">Модуль<select className="input mt-1 w-full" value={String(editing.module_id ?? "")} onChange={(e) => setEditing({ ...editing, module_id: e.target.value || null, topic_id: null })}><option value="">Без модуля</option>{modules.filter((m) => String(m.subject_id) === String(editing.subject_id)).map((m) => <option key={String(m.id)} value={String(m.id)}>{String(m.title ?? m.name)}</option>)}</select></label>
              <label className="text-sm">Тема<select className="input mt-1 w-full" value={String(editing.topic_id ?? "")} onChange={(e) => setEditing({ ...editing, topic_id: e.target.value || null })}><option value="">Без темы</option>{topics.filter((t) => String(t.module_id) === String(editing.module_id)).map((t) => <option key={String(t.id)} value={String(t.id)}>{String(t.name ?? t.title)}</option>)}</select></label>
              <label className="text-sm">Лимит, секунд<input className="input mt-1 w-full" type="number" value={String(editing.time_limit_sec ?? "")} onChange={(e) => setEditing({ ...editing, time_limit_sec: e.target.value === "" ? null : Number(e.target.value) })} /></label>
              <label className="text-sm">Попытки<input className="input mt-1 w-full" type="number" value={String(editing.max_attempts ?? "")} onChange={(e) => setEditing({ ...editing, max_attempts: e.target.value === "" ? null : Number(e.target.value) })} /></label>
              <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={Boolean(editing.is_published)} onChange={(e) => setEditing({ ...editing, is_published: e.target.checked })} /> Опубликован</label>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setEditing(null)}>Отмена</button><button className="btn-primary" onClick={() => void save()}><CheckCircle2 className="mr-2 inline h-4 w-4" />Сохранить</button></div>
          </div>
        </div>
      )}

      {builderOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-2 sm:p-4">
          <div className="card max-h-[96vh] w-full max-w-6xl overflow-y-auto">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
              <div>
                <div className="flex items-center gap-2"><CopyPlus className="h-5 w-5 text-indigo-600" /><h2 className="text-xl font-black text-slate-900">Сборщик тестов</h2></div>
                <p className="mt-1 text-sm text-slate-500">Собери один тест или сразу несколько вариантов из выбранного пула вопросов.</p>
              </div>
              <button type="button" className="rounded-xl border bg-white p-2" onClick={() => setBuilderOpen(false)} title="Закрыть"><X className="h-4 w-4" /></button>
            </div>

            <div className="grid gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
                <section className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-black text-indigo-950"><Info className="h-4 w-4" /> Как должен выглядеть правильный тест</div>
                  <div className="mt-2 grid gap-2 text-xs leading-5 text-indigo-950 sm:grid-cols-2">
                    <div><b>1.</b> Понятное название: предмет → тема → вариант.</div>
                    <div><b>2.</b> У теста один предмет и одна учебная привязка.</div>
                    <div><b>3.</b> Каждый вопрос добавляется один раз в конкретный вариант.</div>
                    <div><b>4.</b> Правильный ответ хранится в вопросе, а не в названии теста.</div>
                    <div><b>5.</b> Публиковать только после проверки состава.</div>
                    <div><b>Как отличить:</b> «Тест» — контейнер, «вопрос» — одна проверяемая единица. Один вопрос может входить в несколько тестов.</div>
                  </div>
                </section>

                <section className="rounded-2xl border bg-white p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm md:col-span-2">Название<input className="input mt-1 w-full" value={builderTitle} onChange={(e) => setBuilderTitle(e.target.value)} placeholder="Например: Гистология — Кровь" /></label>
                    <label className="text-sm">Предмет<select className="input mt-1 w-full" value={builderSubject} onChange={(e) => { setBuilderSubject(e.target.value); setBuilderModule(""); setBuilderTopic(""); }}><option value="">Выберите предмет</option>{subjects.map((s) => <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>)}</select></label>
                    <label className="text-sm">Модуль<select className="input mt-1 w-full" value={builderModule} onChange={(e) => { setBuilderModule(e.target.value); setBuilderTopic(""); }}><option value="">Без модуля</option>{builderModules.map((m) => <option key={String(m.id)} value={String(m.id)}>{String(m.title ?? m.name)}</option>)}</select></label>
                    <label className="text-sm">Тема<select className="input mt-1 w-full" value={builderTopic} onChange={(e) => setBuilderTopic(e.target.value)}><option value="">Без темы</option>{builderTopics.map((t) => <option key={String(t.id)} value={String(t.id)}>{String(t.name ?? t.title)}</option>)}</select></label>
                    <label className="text-sm">Вопросов в одном тесте<input className="input mt-1 w-full" type="number" min={1} max={200} value={builderQuestionsPerTest} onChange={(e) => setBuilderQuestionsPerTest(e.target.value)} /></label>
                    <label className="text-sm">Сколько вариантов собрать<input className="input mt-1 w-full" type="number" min={1} max={20} value={builderVariants} onChange={(e) => setBuilderVariants(e.target.value)} /></label>
                    <label className="text-sm">Время, секунд<input className="input mt-1 w-full" type="number" min={0} value={builderTimeLimit} onChange={(e) => setBuilderTimeLimit(e.target.value)} /></label>
                    <label className="text-sm">Максимум попыток<input className="input mt-1 w-full" type="number" min={0} value={builderMaxAttempts} onChange={(e) => setBuilderMaxAttempts(e.target.value)} /></label>
                    <label className="text-sm md:col-span-2">Описание<textarea className="input mt-1 min-h-20 w-full" value={builderDescription} onChange={(e) => setBuilderDescription(e.target.value)} placeholder="Что проверяет этот тест, какой материал и правила." /></label>
                    <label className="flex items-center gap-2 text-sm font-semibold md:col-span-2"><input type="checkbox" checked={builderPublished} onChange={(e) => setBuilderPublished(e.target.checked)} /> Опубликовать сразу после сборки</label>
                  </div>
                </section>

                <section className="rounded-2xl border bg-white p-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div><div className="text-sm font-black text-slate-900">Пул вопросов</div><div className="text-xs text-slate-500">Выбрано: <b>{selectedCount}</b> · на вариант: <b>{perTest}</b> · вариантов: <b>{variants}</b></div></div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="rounded-xl border bg-slate-50 px-3 py-2 text-xs font-bold" onClick={selectVisibleQuestions}>Выбрать показанные</button>
                      <button type="button" className="rounded-xl border bg-white px-3 py-2 text-xs font-bold" onClick={clearSelectedQuestions}>Очистить выбор</button>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input className="input w-full pl-9" value={builderQuestionSearch} onChange={(e) => setBuilderQuestionSearch(e.target.value)} placeholder="Искать по тексту вопроса…" /></div></div>
                  <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                    {builderPool.map((item, index) => {
                      const id = String(item.id);
                      const selected = selectedQuestionIds.includes(id);
                      return (
                        <label key={id} className={"flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition " + (selected ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50")}>
                          <input type="checkbox" checked={selected} onChange={() => toggleQuestion(id)} className="mt-1" />
                          <span className="min-w-0 flex-1"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">#{index + 1} · {String(item.type ?? "question")}</span><span className="mt-1 block leading-5 text-slate-800">{questionText(item)}</span></span>
                        </label>
                      );
                    })}
                    {!builderPool.length && <div className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">Вопросы по выбранным условиям не найдены.</div>}
                  </div>
                </section>
              </div>

              <aside className="space-y-4">
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-sm font-black text-emerald-950">Что произойдёт при сборке</div>
                  <div className="mt-2 space-y-2 text-xs leading-5 text-emerald-950">
                    <div><b>{variants}</b> тест{variants === 1 ? "" : "а"} будет создано.</div>
                    <div>В каждом будет по <b>{perTest}</b> разных вопросов из выбранного пула.</div>
                    <div>При нескольких вариантах порядок и состав перемешиваются отдельно для каждого варианта.</div>
                    <div>Публикация отключена по умолчанию — сначала можно проверить состав.</div>
                  </div>
                </section>

                <section className="rounded-2xl border bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-black text-slate-900"><RefreshCcw className="h-4 w-4" /> Новый тест</div>
                  <p className="mt-2 text-xs leading-5 text-slate-600">Кнопка «Сброс» очищает название, предмет, тему, настройки и весь выбранный пул. Это удобно перед сборкой другого теста.</p>
                </section>

                <div className="sticky bottom-0 space-y-2 rounded-2xl border bg-white p-3 shadow-lg">
                  <button type="button" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700" disabled={builderBusy} onClick={resetBuilder}><RefreshCcw className="mr-2 inline h-4 w-4" />Сброс для нового теста</button>
                  <button type="button" className="btn-primary w-full" disabled={builderBusy} onClick={() => void buildTests()}>{builderBusy ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <CopyPlus className="mr-2 inline h-4 w-4" />}Собрать {variants === 1 ? "тест" : variants + " теста"}</button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
      {dialog}
    </main>
  );
}
