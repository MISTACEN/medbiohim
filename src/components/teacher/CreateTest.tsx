"use client";

/**
 * Свой тест преподавателя (кабинет 8.7–8.11): собирается из личного банка
 * вопросов в два клика. Вопросы копируются в общий каталог с привязкой к
 * предмету, тест публикуется или сохраняется черновиком.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { FilePlus2, Loader2 } from "lucide-react";
import { describeApiError } from "@/lib/errors";
import { createTeacherTest, teacherSubjects, teacherTests } from "@/lib/api/teacher";
import { listMyQuestions } from "@/lib/api/myQuestions";

type BankQuestion = { id: string; text: string; kind?: string; topic?: string };

export function CreateTestButton({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [bank, catalog] = await Promise.all([listMyQuestions(), teacherSubjects()]);
    if (bank?.ok) setQuestions(Array.isArray(bank.data?.items) ? bank.data.items : []);
    else setError(describeApiError(bank?.error));
    if (catalog?.ok) {
      const items = Array.isArray(catalog.data?.items) ? catalog.data.items : [];
      setSubjects(items.map((s: any) => ({ id: String(s.id), name: String(s.name || s.slug || ""), slug: String(s.slug || "") })));
      if (items.length && !subjectId) setSubjectId(String(items[0].id));
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return questions;
    return questions.filter((q) => q.text.toLowerCase().includes(query));
  }, [questions, search]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!title.trim() || !subjectId || selected.size === 0) {
      setNote("Название, предмет и хотя бы один вопрос обязательны");
      return;
    }
    setBusy(true);
    setNote("");
    const result = await createTeacherTest({
      title: title.trim(),
      subject_id: subjectId,
      question_ids: [...selected],
      is_published: true,
    });
    setBusy(false);
    if (result.ok) {
      setNote(`Тест «${result.data.test.title}» создан (${result.data.question_count} вопросов)`);
      setOpen(false);
      setSelected(new Set());
      setTitle("");
      onCreated?.();
    } else {
      setNote(describeApiError(result.error));
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary inline-flex items-center gap-1.5">
        <FilePlus2 className="h-4 w-4" /> Создать из банка
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[var(--card)] p-5 shadow-xl">
            <h3 className="text-lg font-bold">Свой тест из личного банка</h3>
            <p className="page-subtitle">
              Вопросы копируются в тест — личный банк остаётся нетронутым. Студенты увидят тест после
              назначения или в каталоге предмета.
            </p>
            {note && <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50 p-2.5 text-sm text-indigo-800">{note}</div>}
            {error && <div className="mt-2 rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-2.5 text-sm text-[var(--status-critical-fg)]">{error}</div>}
            {loading && (
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Загрузка банка…
              </div>
            )}
            {!loading && (
              <div className="mt-3 space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="rounded-xl border p-2 text-sm"
                    placeholder="Название теста"
                  />
                  <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="rounded-xl border p-2 text-sm">
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>{subject.name}</option>
                    ))}
                  </select>
                </div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border p-2 text-sm"
                  placeholder="Поиск по вопросам банка…"
                />
                <div className="max-h-64 space-y-1.5 overflow-y-auto">
                  {filtered.length === 0 && (
                    <div className="rounded-xl bg-slate-50 p-3 text-sm text-[var(--muted)]">
                      Личный банк пуст — добавьте вопросы в разделе «Личный банк вопросов».
                    </div>
                  )}
                  {filtered.map((question) => (
                    <label key={question.id} className="flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={selected.has(question.id)}
                        onChange={() => toggle(question.id)}
                        className="mt-1"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2">{question.text}</span>
                        <span className="text-xs text-[var(--muted)]"> · {question.kind || "single"}{question.topic ? ` · ${question.topic}` : ""}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--muted)]">Выбрано: {selected.size}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setOpen(false)} className="rounded-xl border px-4 py-2 text-sm font-semibold">
                      Отмена
                    </button>
                    <button
                      type="button"
                      disabled={busy || selected.size === 0}
                      onClick={() => void submit()}
                      className="btn-primary"
                    >
                      {busy ? "Создаю…" : "Создать тест"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
