"use client";

/**
 * Импорт готового теста из документа.
 *
 * Преподаватель приносит .docx/.txt/.md, где вопросы размечены как
 * «1. вопрос», «@1. верный вариант», «#2. неверный вариант». Файл разбирается
 * в браузере, показывается предпросмотр с замечаниями (сбитая нумерация, нет
 * правильного ответа, дубликаты), и только после проверки вопросы уходят в
 * личный банк, а из них создаётся настоящий тест с попытками и статистикой.
 *
 * Ничего не публикуется молча: пока преподаватель не нажал кнопку, на сервер
 * не уходит ни один вопрос.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Loader2,
  Rocket,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { ChemRichText } from "@/modules/subjects/submodules/chemistry";
import { readDocxText } from "@/lib/documents/docx";
import { parseTestDocument, type ParsedQuestion, type ParsedTest } from "@/lib/tests/parseTestDocument";
import { createMyQuestion } from "@/lib/api/myQuestions";
import { createTeacherTest, teacherSubjects } from "@/lib/api/teacher";
import { describeApiError } from "@/lib/errors";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_QUESTIONS = 200;

type Subject = { id: string; name: string };

function slugifySubject(name: string): string {
  return (
    name
      .toLocaleLowerCase("ru")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "general"
  );
}

async function readFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (file.size > MAX_BYTES) throw new Error("Файл больше 8 МБ — разбейте тест на части");
  if (name.endsWith(".docx")) return readDocxText(file);
  if (name.endsWith(".doc") || name.endsWith(".docm")) {
    throw new Error("Старый .doc не поддерживается — откройте в Word и сохраните как .docx");
  }
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".markdown") || file.type.startsWith("text/")) {
    return file.text();
  }
  throw new Error("Поддерживаются .docx, .txt и .md");
}

function QuestionPreview({ question, included }: { question: ParsedQuestion; included: boolean }) {
  const letters = "АБВГДЕЖЗИК";
  return (
    <li
      className="rounded-xl border p-3"
      style={{
        borderColor: question.issues.length ? "var(--status-warn-border)" : "var(--border)",
        opacity: included ? 1 : 0.55,
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
          style={{ background: "var(--status-neutral-bg)", color: "var(--status-neutral-fg)" }}
        >
          {question.number ?? "—"}
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="text-sm">
            <ChemRichText text={question.text} />
          </div>
          <ul className="space-y-1 text-xs">
            {question.options.map((option, index) => (
              <li
                key={`${index}-${option.text}`}
                className="flex items-start gap-1.5"
                style={{ color: option.correct ? "var(--status-ok-fg)" : "var(--muted)" }}
              >
                <span className="font-semibold">{letters[index] || index + 1})</span>
                <span className="min-w-0">
                  <ChemRichText text={option.text} />
                </span>
                {option.correct ? <span className="shrink-0 font-bold">✓</span> : null}
              </li>
            ))}
          </ul>
          {question.issues.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {question.issues.map((issue) => (
                <span
                  key={issue}
                  className="rounded-full border px-2 py-0.5 text-[11px]"
                  style={{
                    background: "var(--status-warn-bg)",
                    color: "var(--status-warn-fg)",
                    borderColor: "var(--status-warn-border)",
                  }}
                >
                  {issue}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function ImportTest({ onCreated }: { onCreated?: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedTest | null>(null);
  const [pasted, setPasted] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [timeLimitMin, setTimeLimitMin] = useState("");
  const [publish, setPublish] = useState(true);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [created, setCreated] = useState<{ id: string; title: string; count: number } | null>(null);

  const loadSubjects = useCallback(async () => {
    const result = await teacherSubjects();
    if (!result.ok) {
      setError(describeApiError(result.error));
      return;
    }
    const list = (result.data.items?.length ? result.data.items : result.data.catalog || []).map((item) => ({
      id: String(item.id),
      name: String(item.name || ""),
    }));
    setSubjects(list);
    setSubjectId((current) => current || list[0]?.id || "");
  }, []);

  useEffect(() => {
    void loadSubjects();
  }, [loadSubjects]);

  function applyParse(nextText: string, name: string) {
    const result = parseTestDocument(nextText, name);
    setParsed(result);
    setTitle(result.title);
    setFileName(name);
    setCreated(null);
    setNote("");
    const broken = result.questions.filter((question) => question.issues.length > 0);
    setExcluded(new Set(broken.map((question) => question.number ?? -1)));
    if (result.questions.length === 0) {
      setNote("В файле не нашлось вопросов — проверьте разметку: «1. вопрос», «@1. верный», «#2. неверный».");
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setPasted("");
    try {
      const content = await readFileText(file);
      applyParse(content, file.name);
    } catch (failure: any) {
      setParsed(null);
      setError(failure?.message || "Не удалось прочитать файл");
    }
  }

  function handlePasted() {
    if (!pasted.trim()) return;
    setError("");
    applyParse(pasted, "Вставленный текст");
  }

  function reset() {
    setParsed(null);
    setFileName("");
    setPasted("");
    setExcluded(new Set());
    setCreated(null);
    setError("");
    setNote("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function toggle(number: number | null) {
    const key = number ?? -1;
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const included = useMemo(
    () => (parsed ? parsed.questions.filter((question) => !excluded.has(question.number ?? -1)) : []),
    [parsed, excluded],
  );

  const visible = useMemo(
    () => (parsed ? (onlyIssues ? parsed.questions.filter((q) => q.issues.length > 0) : parsed.questions) : []),
    [parsed, onlyIssues],
  );

  async function importTest() {
    if (!parsed) return;
    if (!included.length) {
      setNote("Отметьте хотя бы один вопрос");
      return;
    }
    if (included.length > MAX_QUESTIONS) {
      setNote(`За один раз можно импортировать до ${MAX_QUESTIONS} вопросов`);
      return;
    }
    if (!title.trim()) {
      setNote("Укажите название теста");
      return;
    }
    if (!subjectId) {
      setNote("Выберите предмет — без него тест не создать");
      return;
    }
    const subject = subjects.find((item) => item.id === subjectId);
    const slug = slugifySubject(subject?.name || "general");

    setBusy(true);
    setError("");
    setNote("");
    setProgress({ done: 0, total: included.length });
    const ids: string[] = [];
    const failures: string[] = [];

    // Банк вопросов хранится одной записью site_content: параллельные POST
    // перезаписывают друг друга, поэтому сохраняем строго по одному.
    for (const [index, question] of included.entries()) {
      const result: any = await createMyQuestion({
        subject_slug: slug,
        topic: question.topic,
        kind: "single",
        text: question.text,
        options: question.options.map((option) => option.text),
        answer: question.answer,
      });
      const id = result?.data?.question?.id;
      if (result?.ok && id) ids.push(String(id));
      else failures.push(`№${question.number ?? index + 1}: ${describeApiError(result?.error)}`);
      setProgress({ done: index + 1, total: included.length });
    }

    if (!ids.length) {
      setBusy(false);
      setError(`Не удалось сохранить вопросы. ${failures.slice(0, 3).join(" ")}`);
      return;
    }

    const result = await createTeacherTest({
      title: title.trim(),
      subject_id: subjectId,
      question_ids: ids,
      time_limit_sec: timeLimitMin ? Number(timeLimitMin) * 60 : null,
      is_published: publish,
    });
    setBusy(false);
    if (!result.ok) {
      setError(describeApiError(result.error));
      return;
    }
    setCreated({ id: result.data.test.id, title: result.data.test.title, count: result.data.question_count });
    if (failures.length) {
      setNote(`Создан тест из ${ids.length} вопросов. Не сохранились: ${failures.slice(0, 5).join("; ")}`);
    }
    onCreated?.();
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <FileUp className="h-5 w-5" style={{ color: "var(--primary)" }} /> Импорт теста из файла
        </h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Word, txt или md с разметкой «1. вопрос», «@1. верный вариант», «#2. неверный». Файл разбирается
          в браузере: сначала предпросмотр и проверка, потом сохранение.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border p-3 text-sm"
          style={{
            borderColor: "var(--status-critical-border)",
            background: "var(--status-critical-bg)",
            color: "var(--status-critical-fg)",
          }}
        >
          {error}
        </div>
      ) : null}
      {note ? (
        <div
          className="rounded-xl border p-3 text-sm"
          style={{
            borderColor: "var(--status-info-border)",
            background: "var(--status-info-bg)",
            color: "var(--status-info-fg)",
          }}
        >
          {note}
        </div>
      ) : null}

      {created ? (
        <div
          className="card space-y-3 p-4"
          style={{ borderColor: "var(--status-ok-border)", background: "var(--status-ok-bg)" }}
        >
          <div className="flex items-center gap-2 font-semibold" style={{ color: "var(--status-ok-fg)" }}>
            <CheckCircle2 className="h-5 w-5" /> Тест «{created.title}» создан · вопросов: {created.count}
          </div>
          <p className="text-sm" style={{ color: "var(--text)" }}>
            {publish
              ? "Он опубликован — осталось назначить его группе или студентам."
              : "Он сохранён черновиком: опубликуйте и назначьте, когда будете готовы."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/teacher/preview/${created.id}`} className="btn-primary inline-flex items-center gap-1.5 text-sm">
              Открыть как студент
            </Link>
            <button type="button" className="btn-secondary inline-flex items-center gap-1.5 text-sm" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Загрузить ещё файл
            </button>
          </div>
        </div>
      ) : null}

      {!parsed && !created ? (
        <div className="card space-y-4 p-4">
          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center"
            style={{ borderColor: "var(--border)" }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void handleFile(event.dataTransfer.files?.[0]);
            }}
          >
            <FileUp className="h-8 w-8" style={{ color: "var(--primary)" }} />
            <span className="text-sm font-semibold">Перетащите файл или выберите на диске</span>
            <span className="text-xs text-[var(--muted)]">.docx, .txt, .md · до 8 МБ</span>
            <input
              ref={inputRef}
              type="file"
              accept=".docx,.txt,.md,.markdown"
              className="sr-only"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </label>

          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-semibold" style={{ color: "var(--primary)" }}>
              Как должен выглядеть файл
            </summary>
            <pre
              className="mt-2 overflow-x-auto rounded-xl p-3 text-[11px] leading-relaxed"
              style={{ background: "var(--status-neutral-bg)", color: "var(--text)" }}
            >{`Раздел 1. Элементы теории вероятностей.

1. При бросании монеты вероятность «решки» равна:
@1. 0.5
#2. 1
#3. 0
#4. 100%

2. Вероятность достоверного события равна:
@1. 1
#2. 0.5
#3. 0`}</pre>
          </details>

          <div className="space-y-2 border-t border-[var(--border)] pt-3">
            <label htmlFor="import-paste" className="text-xs font-semibold text-[var(--muted)]">
              Или вставьте текст теста
            </label>
            <textarea
              id="import-paste"
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              placeholder="1. Текст вопроса…&#10;@1. верный вариант&#10;#2. неверный вариант"
              className="min-h-28 w-full rounded-xl border border-[var(--border)] bg-transparent p-3 text-sm"
            />
            <button type="button" className="btn-secondary text-sm" onClick={handlePasted} disabled={!pasted.trim()}>
              Разобрать текст
            </button>
          </div>
        </div>
      ) : null}

      {parsed && !created ? (
        <>
          <div className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{fileName || "Текст"}</div>
                <div className="text-xs text-[var(--muted)]">
                  Вопросов: {parsed.stats.questions} · без замечаний: {parsed.stats.valid} · проверить:{" "}
                  {parsed.stats.invalid} · вариантов: {parsed.stats.options}
                  {parsed.stats.ignoredLines ? ` · строк вне разметки: ${parsed.stats.ignoredLines}` : ""}
                </div>
              </div>
              <button type="button" className="btn-secondary inline-flex items-center gap-1.5 text-xs" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5" /> Другой файл
              </button>
            </div>

            {parsed.stats.topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {parsed.stats.topics.map((topic) => (
                  <span
                    key={topic}
                    className="rounded-full border px-2 py-0.5 text-[11px]"
                    style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                  >
                    {topic}
                  </span>
                ))}
              </div>
            )}

            {parsed.issues.length > 0 && (
              <div
                className="rounded-xl border p-3 text-xs"
                style={{
                  borderColor: "var(--status-warn-border)",
                  background: "var(--status-warn-bg)",
                  color: "var(--status-warn-fg)",
                }}
              >
                <div className="mb-1 flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" /> Проверьте разметку документа
                </div>
                <ul className="list-inside list-disc space-y-0.5">
                  {parsed.issues.slice(0, 8).map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-[var(--muted)]">Название теста</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-[var(--muted)]">Предмет</span>
                <select
                  value={subjectId}
                  onChange={(event) => setSubjectId(event.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                >
                  {subjects.length === 0 ? <option value="">Предметы не назначены</option> : null}
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-[var(--muted)]">Ограничение времени, мин (необязательно)</span>
                <input
                  value={timeLimitMin}
                  onChange={(event) => setTimeLimitMin(event.target.value.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  placeholder="например, 40"
                  className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} />
                Опубликовать сразу
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={onlyIssues} onChange={(event) => setOnlyIssues(event.target.checked)} />
                  только с замечаниями
                </label>
                <button
                  type="button"
                  className="rounded-lg border border-[var(--border)] px-2 py-1 font-semibold"
                  onClick={() => setExcluded(new Set())}
                >
                  включить все
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[var(--border)] px-2 py-1 font-semibold"
                  onClick={() => setExcluded(new Set(parsed.questions.map((q) => q.number ?? -1)))}
                >
                  снять все
                </button>
              </div>
              <button
                type="button"
                className="btn-primary inline-flex items-center gap-1.5 text-sm"
                disabled={busy || included.length === 0 || !subjectId}
                onClick={() => void importTest()}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                {busy
                  ? `Сохраняем ${progress.done} из ${progress.total}…`
                  : `Импортировать ${included.length} и создать тест`}
              </button>
            </div>

            <p className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Вопросы попадают в ваш личный банк, тест создаётся от вашего имени. Ничего не публикуется, пока
              вы не нажмёте кнопку.
            </p>
          </div>

          <div className="card space-y-2 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Предпросмотр {visible.length} вопросов</h3>
              <span className="text-[11px] text-[var(--muted)]">
                ✓ — правильный ответ, который попадёт в тест
              </span>
            </div>
            <ul className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {visible.map((question) => {
                const key = question.number ?? -1;
                const isIncluded = !excluded.has(key);
                return (
                  <div key={`${key}-${question.text.slice(0, 24)}`} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-3 shrink-0"
                      checked={isIncluded}
                      onChange={() => toggle(question.number)}
                      aria-label={`Включить вопрос ${question.number ?? ""}`}
                    />
                    <div className="min-w-0 flex-1">
                      <QuestionPreview question={question} included={isIncluded} />
                    </div>
                  </div>
                );
              })}
              {visible.length === 0 ? (
                <li className="p-4 text-center text-sm text-[var(--muted)]">Вопросов с замечаниями нет.</li>
              ) : null}
            </ul>
          </div>
        </>
      ) : null}
    </section>
  );
}
