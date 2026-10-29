"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileJson,
  Loader2,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { adminContentImport, adminDbList, hasToken } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { describeApiError } from "@/lib/errors";

type SubjectRow = {
  id: string;
  name: string;
  slug?: string | null;
};

type RawOption =
  | string
  | {
      label?: unknown;
      text?: unknown;
      value?: unknown;
      correct?: unknown;
      is_correct?: unknown;
    };

type RawQuestion = {
  question_key?: unknown;
  text?: unknown;
  question?: unknown;
  prompt?: unknown;
  type?: unknown;
  question_type?: unknown;
  options?: unknown;
  answer?: unknown;
  correct?: unknown;
  source?: unknown;
};

type RawBundle = {
  schema?: unknown;
  test_title?: unknown;
  testTitle?: unknown;
  source?: unknown;
  questions?: unknown;
};

type SourceMeta = {
  system: string;
  url: string;
  test_title: string;
  collected_at: string;
};

type NormalizedQuestion = {
  key: string;
  text: string;
  type: "mcq" | "open";
  options: Array<{ label: string; correct: boolean }>;
  answer: string;
  correctCount: number;
  source: SourceMeta;
  warning: string | null;
};

type NormalizedBundle = {
  testKey: string;
  testTitle: string;
  source: SourceMeta | null;
  questions: NormalizedQuestion[];
  skipped: string[];
};

type ImportError = { sheet: string; row: number; error: string };

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function stableKey(prefix: string, value: string): string {
  return `${prefix}-${hash(value)}`.slice(0, 180);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sourceFrom(raw: unknown, fallbackTitle: string): SourceMeta {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    system: asText(source.system) || "test.fesmu.ru",
    url: asText(source.url) || "http://test.fesmu.ru:8080/",
    test_title: asText(source.test_title) || asText(source.testTitle) || fallbackTitle,
    collected_at: asText(source.collected_at) || new Date().toISOString(),
  };
}

function parseCorrectIndexes(value: unknown, count: number): number[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\s;]+/).filter(Boolean)
      : typeof value === "number"
        ? [value]
        : [];
  const indexes: number[] = [];
  for (const item of values) {
    const numeric = Number(item);
    if (!Number.isInteger(numeric)) continue;
    const zeroBased = numeric >= 1 && numeric <= count ? numeric - 1 : numeric;
    if (zeroBased >= 0 && zeroBased < count && !indexes.includes(zeroBased)) indexes.push(zeroBased);
  }
  return indexes;
}

function normalizeQuestion(raw: RawQuestion, bundleSource: SourceMeta, bundleTitle: string): NormalizedQuestion | { error: string } {
  const text = asText(raw.text) || asText(raw.question) || asText(raw.prompt);
  if (!text) return { error: "Пустой текст вопроса" };

  const source = sourceFrom(raw.source, bundleTitle || bundleSource.test_title);
  const rawOptions = Array.isArray(raw.options) ? (raw.options as RawOption[]) : [];
  const options = rawOptions
    .map((option) => {
      if (typeof option === "string") return { label: option.trim(), correct: false };
      if (!option || typeof option !== "object") return { label: "", correct: false };
      return {
        label: asText(option.label) || asText(option.text) || asText(option.value),
        correct: option.correct === true || option.is_correct === true,
      };
    })
    .filter((option) => option.label.length > 0);

  const rawType = (asText(raw.type) || asText(raw.question_type)).toLowerCase();
  const openByType = ["open", "text", "number", "sequence", "matching", "conformity"].includes(rawType);
  const correctFromField = parseCorrectIndexes(raw.correct, options.length);
  for (const index of correctFromField) {
    if (options[index]) options[index].correct = true;
  }

  const answerText = asText(raw.answer);
  if (answerText && options.length > 0 && !options.some((option) => option.correct)) {
    const direct = options.findIndex((option) => option.label.toLowerCase() === answerText.toLowerCase());
    if (direct >= 0) {
      options[direct].correct = true;
    } else {
      const indexes = parseCorrectIndexes(answerText, options.length);
      for (const index of indexes) {
        if (options[index]) options[index].correct = true;
      }
    }
  }

  const correctCount = options.filter((option) => option.correct).length;
  let type: "mcq" | "open" = openByType ? "open" : "mcq";
  if (!openByType && options.length === 0 && answerText) type = "open";

  if (type === "mcq" && options.length < 2) return { error: "Для закрытого вопроса нужно минимум два варианта" };
  if (type === "mcq" && correctCount === 0) return { error: "Не отмечен правильный вариант" };

  const keySeed = `${text}|${options.map((option) => `${option.label}:${option.correct ? 1 : 0}`).join("|")}|${source.url}`;
  const providedKey = asText(raw.question_key);
  const key = /^[a-zA-Z0-9_.-]{1,180}$/.test(providedKey) ? providedKey : stableKey("fesmu-test-q", keySeed);
  const answer = type === "open" ? answerText : options.filter((option) => option.correct).map((option) => option.label).join(" | ");
  const warning = type === "open" && !answer ? "Открытый ответ пуст — проверьте перед публикацией" : null;

  return {
    key,
    text,
    type,
    options,
    answer,
    correctCount,
    source,
    warning,
  };
}

function normalizeBundle(raw: unknown): NormalizedBundle {
  const object = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as RawBundle) : {};
  const rawQuestions = Array.isArray(raw)
    ? raw
    : Array.isArray(object.questions)
      ? object.questions
      : object && typeof object === "object" && ("text" in object || "question" in object)
        ? [object]
        : [];
  const title =
    asText(object.test_title) ||
    asText(object.testTitle) ||
    asText((object.source as Record<string, unknown> | undefined)?.test_title) ||
    "Импорт из тестовой системы ДВГМУ";
  const source = sourceFrom(object.source, title);
  const questions: NormalizedQuestion[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const item of rawQuestions) {
    if (!item || typeof item !== "object") {
      skipped.push("Пропущена запись без объекта вопроса");
      continue;
    }
    const normalized = normalizeQuestion(item as RawQuestion, source, title);
    if ("error" in normalized) {
      skipped.push(normalized.error);
      continue;
    }
    if (seen.has(normalized.key)) {
      skipped.push(`Дубликат: ${normalized.text.slice(0, 60)}…`);
      continue;
    }
    seen.add(normalized.key);
    questions.push(normalized);
  }

  const testKey = stableKey("fesmu-test", `${title}|${source.url}`);
  return { testKey, testTitle: title, source, questions, skipped };
}

function downloadJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function UniversityImportPage() {
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

  if (authLoading) {
    return (
      <div className="mx-auto flex max-w-md items-center gap-2 p-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Проверяем доступ…
      </div>
    );
  }

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">Импорт тестов</h1>
        <p className="page-subtitle">Сначала войдите в MEDBIOHIM.</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="card mx-auto max-w-lg p-8">
        <h1 className="page-title flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-[var(--status-warn-fg)]" /> Нужен доступ администратора</h1>
        <p className="mt-2 text-sm text-slate-600">
          Сбор и импорт вопросов доступен только администратору. Это защищает учебную базу от случайной публикации
          непроверенных материалов. Вы можете вернуться в университетский хаб и открыть официальную систему тестирования.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/university" className="btn-primary">В университетский хаб</Link>
          <a href="http://test.fesmu.ru:8080/" target="_blank" rel="noreferrer" className="btn-secondary">Оригинальные тесты</a>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="rounded-2xl border border-[var(--status-warn-border)] bg-gradient-to-br from-amber-50 via-white to-indigo-50 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--status-warn-border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--status-warn-fg)]">
              <ClipboardCheck className="h-3.5 w-3.5" /> Bridge → preview → импорт
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">Сбор тестов из оригинальной системы</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Загрузите JSON, собранный расширением MEDBIOHIM Bridge на странице{" "}
              <a href="http://test.fesmu.ru:8080/" target="_blank" rel="noreferrer" className="font-semibold text-indigo-700 underline">
                test.fesmu.ru
              </a>
              . Импорт выполняется только после preview и доступен администратору. По умолчанию материалы не публикуются.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-slate-600">
              <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">Пароль ЕИОС не сохраняется</span>
              <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">Правильные ответы отмечает пользователь</span>
              <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">Повторный импорт обновляет по source_key</span>
            </div>
          </div>
          <Link href="/university" className="btn-secondary inline-flex items-center gap-2">
            Назад в хаб
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="flex items-center gap-2 font-bold text-slate-900"><Upload className="h-4 w-4 text-indigo-600" /> Загрузить JSON</h2>
          <p className="mt-1 text-xs text-slate-500">
            Поддерживается пакет <code>medbiohim.test-bundle.v1</code>, массив вопросов или один вопрос.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => fileInput.current?.click()}>
              <FileJson className="h-4 w-4" /> Выбрать файл
            </button>
            <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={readFile} />
            {rawText && (
              <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => { setRawText(""); setBundle(null); setMessage(""); setErrors([]); setParseError(""); }}>
                <Trash2 className="h-4 w-4" /> Очистить
              </button>
            )}
          </div>
          <textarea
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            rows={10}
            spellCheck={false}
            placeholder='{"schema":"medbiohim.test-bundle.v1","source":{"test_title":"..."},"questions":[...]}'
            className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs outline-none focus:border-indigo-300"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={!rawText.trim()} onClick={() => analyze(rawText)}>
              Разобрать и показать preview
            </button>
            {bundle && (
              <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => downloadJson(bundle, "medbiohim-preview.json")}>
                <Download className="h-4 w-4" /> Скачать preview
              </button>
            )}
          </div>
          {parseError && <p className="mt-3 rounded-lg bg-[var(--status-critical-bg)] px-3 py-2 text-xs text-[var(--status-critical-fg)]">{parseError}</p>}
        </section>

        <section className="card">
          <h2 className="flex items-center gap-2 font-bold text-slate-900"><ShieldCheck className="h-4 w-4 text-[var(--status-ok-fg)]" /> Куда импортировать</h2>
          <label className="field-label mt-3" htmlFor="import-subject">Предмет</label>
          <select id="import-subject" value={subjectKey} onChange={(event) => setSubjectKey(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="">Выберите предмет…</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.slug || subject.name}>{subject.name}</option>
            ))}
          </select>
          {subjectsError && <p className="mt-1 text-xs text-[var(--status-critical-fg)]">{subjectsError}</p>}
          <label className="field-label mt-3" htmlFor="import-test-title">Название теста</label>
          <input id="import-test-title" value={testTitle} onChange={(event) => setTestTitle(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Например: Физиология — итоговый тест" />
          <label className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} className="mt-0.5" />
            <span><b className="text-slate-800">Опубликовать сразу.</b> По умолчанию тест и вопросы сохраняются неопубликованными. Включайте, только если проверили содержание и ответы.</span>
          </label>
          {bundle && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
              <div><b className="text-slate-700">Источник:</b> {bundle.source?.system || "test.fesmu.ru"}</div>
              <div className="break-all"><b className="text-slate-700">URL:</b> {bundle.source?.url || "—"}</div>
              <div><b className="text-slate-700">Собрано:</b> {bundle.source?.collected_at ? new Date(bundle.source.collected_at).toLocaleString("ru-RU") : "—"}</div>
              <div><b className="text-slate-700">Тестовый ключ:</b> {bundle.testKey}</div>
            </div>
          )}
        </section>
      </div>

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm ${errors.length ? "border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]" : "border border-indigo-100 bg-indigo-50 text-indigo-700"}`}>
          {message}
        </div>
      )}

      {errors.length > 0 && (
        <section className="card border-[var(--status-critical-border)]">
          <h2 className="font-bold text-[var(--status-critical-fg)]">Ошибки API ({errors.length})</h2>
          <div className="mt-3 max-h-64 space-y-2 overflow-auto">
            {errors.map((error, index) => (
              <div key={`${error.sheet}-${error.row}-${index}`} className="rounded-lg bg-[var(--status-critical-bg)] p-2 text-xs text-[var(--status-critical-fg)]">
                {error.sheet}, строка {error.row}: {error.error}
              </div>
            ))}
          </div>
        </section>
      )}

      {bundle && (
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900">Preview вопросов</h2>
              <p className="text-xs text-slate-500">
                Выбрано {includedQuestions.length} из {bundle.questions.length}. Снимите галочку, чтобы не импортировать вопрос.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => setIncluded(new Set(bundle.questions.map((question) => question.key)))}>Выбрать все</button>
              <button type="button" className="btn-secondary" onClick={() => setIncluded(new Set())}>Снять все</button>
            </div>
          </div>

          {bundle.skipped.length > 0 && (
            <div className="mt-3 rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-xs text-[var(--status-warn-fg)]">
              <div className="font-semibold">Пропущено при разборе: {bundle.skipped.length}</div>
              <ul className="mt-1 list-disc pl-5">
                {bundle.skipped.slice(0, 6).map((warning, index) => <li key={index}>{warning}</li>)}
              </ul>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {bundle.questions.map((question, index) => {
              const isIncluded = included.has(question.key);
              return (
                <article key={question.key} className={`rounded-xl border p-3 transition ${isIncluded ? "border-indigo-100 bg-white" : "border-slate-100 bg-slate-50 opacity-60"}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={isIncluded} onChange={() => toggleQuestion(question.key)} className="mt-1" aria-label={`Импортировать вопрос ${index + 1}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">{index + 1}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{question.type === "open" ? "Открытый" : question.correctCount > 1 ? "Несколько ответов" : "Один ответ"}</span>
                        {question.warning && <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--status-warn-fg)]">{question.warning}</span>}
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm font-medium text-slate-900">{question.text}</div>
                      {question.options.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {question.options.map((option, optionIndex) => (
                            <li key={`${option.label}-${optionIndex}`} className={`rounded-lg px-2 py-1 text-xs ${option.correct ? "bg-[var(--status-ok-bg)] font-semibold text-[var(--status-ok-fg)]" : "text-slate-600"}`}>
                              {option.correct ? "✓" : "○"} {option.label}
                            </li>
                          ))}
                        </ul>
                      )}
                      {question.type === "open" && (
                        <div className="mt-2 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-700">
                          <b>Эталон:</b> {question.answer || "не указан"}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                        <span className="break-all">source: {question.source.url}</span>
                        <span>key: {question.key}</span>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button type="button" disabled={busy || !includedQuestions.length || !subjectKey || !testTitle.trim()} onClick={() => void run(true)} className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Проверить через API
            </button>
            <button type="button" disabled={busy || !includedQuestions.length || !subjectKey || !testTitle.trim()} onClick={() => void run(false)} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Импортировать
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            Preview и dry-run — локальная/API-проверка, а не подтверждение преподавателя. Для повторного импорта того же
            теста используйте тот же JSON: ключи стабильны, записи обновятся по source_key.
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><AlertCircle className="h-4 w-4 text-slate-500" /> Как собрать JSON</h2>
        <ol className="mt-3 grid gap-2 text-xs leading-relaxed text-slate-600 md:grid-cols-4">
          <li className="rounded-xl bg-slate-50 p-3"><b className="text-slate-800">1.</b> Откройте тест в оригинальной системе в своей сессии.</li>
          <li className="rounded-xl bg-slate-50 p-3"><b className="text-slate-800">2.</b> Откройте расширение Bridge и нажмите «Считать вопрос».</li>
          <li className="rounded-xl bg-slate-50 p-3"><b className="text-slate-800">3.</b> Отметьте правильные номера, добавьте вопрос в набор и скачайте JSON.</li>
          <li className="rounded-xl bg-slate-50 p-3"><b className="text-slate-800">4.</b> Загрузите JSON сюда, проверьте preview и импортируйте.</li>
        </ol>
      </section>
    </main>
  );
}
