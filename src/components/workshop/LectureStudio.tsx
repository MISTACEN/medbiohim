"use client";

/**
 * Занятия в Мастерской: тот же редактор лекций, что в /admin/lectures.
 *
 * Раздел доступен сотрудникам (админ/модератор): в Мастерской можно завести
 * черновик занятия по теме учебного плана, отредактировать его общим
 * редактором и опубликовать — без перехода в админку.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, ExternalLink, Loader2, Plus, Save, Search } from "lucide-react";
import Link from "next/link";
import { RichLectureEditor } from "@/components/editor/RichLectureEditor";
import {
  adminGenerateLecture,
  adminListLectures,
  adminPublishLecture,
  adminUpdateLecture,
  listSubjectsCatalog,
  type Lecture,
} from "@/lib/api";
import { describeApiError } from "@/lib/errors";

type Subject = { slug: string; name: string };
type Attachment = {
  id?: string;
  file_id?: string;
  type: "image" | "video" | "pdf" | "file";
  name: string;
  url?: string;
  mime_type?: string;
  page?: number;
  caption?: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending_review: "На проверке",
  published: "Опубликовано",
  rejected: "Отклонено",
  draft: "Черновик",
};

export default function LectureStudio() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [slug, setSlug] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [newTopic, setNewTopic] = useState("");
  const [editorId, setEditorId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    let alive = true;
    void listSubjectsCatalog().then((result: any) => {
      if (!alive || !result?.ok) return;
      const list = ((result.data?.items || []) as any[])
        .map((row) => ({ slug: String(row.slug || "").trim(), name: String(row.name || "").trim() }))
        .filter((row: Subject) => row.slug && row.name)
        .filter((row: Subject, index: number, all: Subject[]) => all.findIndex((s) => s.slug === row.slug) === index);
      setSubjects(list);
      setSlug((current) => current || list[0]?.slug || "");
    });
    return () => {
      alive = false;
    };
  }, []);

  const reload = useCallback(async (subjectSlug: string) => {
    if (!subjectSlug) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result: any = await adminListLectures(undefined, subjectSlug);
    if (result?.ok) setItems((result.data.items || []) as Lecture[]);
    else setError(describeApiError(result?.error));
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload(slug);
  }, [slug, reload]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => `${item.title} ${(item as any).topic || ""}`.toLowerCase().includes(needle));
  }, [items, query]);

  const subject = useMemo(() => subjects.find((row) => row.slug === slug) || null, [subjects, slug]);

  function openEditor(lecture: any) {
    setEditorId(String(lecture.id));
    setTitle(String(lecture.title || ""));
    setTopic(String(lecture.topic || ""));
    setSummary(String(lecture.summary || ""));
    setBody(String(lecture.body_md || lecture.body_markdown || ""));
    setBodyHtml(String(lecture.body_html || ""));
    setAttachments(Array.isArray(lecture.attachments) ? (lecture.attachments as Attachment[]) : []);
    setError("");
    setMessage("");
  }

  async function createDraft() {
    if (!slug || !newTopic.trim()) {
      setError("Выберите предмет и укажите тему занятия");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const result: any = await adminGenerateLecture({
      subject_slug: slug,
      topic: newTopic.trim(),
      lesson_type: "lecture",
    });
    setBusy(false);
    if (!result?.ok) {
      setError(describeApiError(result?.error));
      return;
    }
    setMessage("Черновик создан — откройте его в списке и доработайте.");
    setNewTopic("");
    await reload(slug);
    const created = result.data?.lecture || result.data?.item;
    if (created?.id) openEditor(created);
  }

  async function save() {
    if (!editorId) return;
    setBusy(true);
    setError("");
    setMessage("");
    const result: any = await adminUpdateLecture(editorId, {
      title,
      topic,
      summary,
      body_md: body,
      body_html: bodyHtml,
      attachments,
    });
    setBusy(false);
    if (!result?.ok) {
      setError(describeApiError(result?.error));
      return;
    }
    setMessage("Занятие сохранено.");
    await reload(slug);
  }

  async function publish(id: string) {
    setBusy(true);
    const result: any = await adminPublishLecture(id);
    setBusy(false);
    if (!result?.ok) {
      setError(describeApiError(result?.error));
      return;
    }
    setMessage("Занятие опубликовано.");
    await reload(slug);
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-[var(--primary)]" />
          <h2 className="text-base font-bold">Занятия: создать и отредактировать</h2>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Тот же редактор, что в админке: форматирование, фото в любом месте текста, видео, PDF, схемы, тесты.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--muted)]">Предмет</span>
            <select
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2"
            >
              {subjects.map((row) => (
                <option key={row.slug} value={row.slug}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--muted)]">Новая тема</span>
            <input
              value={newTopic}
              onChange={(event) => setNewTopic(event.target.value)}
              placeholder="Например: Эндокринная система"
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void createDraft()}
            disabled={busy}
            className="btn-primary inline-flex items-center gap-2 text-sm"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Создать черновик
          </button>
          <label className="inline-flex min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск занятия"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
        </div>
        {message ? <p className="text-xs text-[var(--status-ok-fg)]">{message}</p> : null}
        {error ? <p className="text-xs text-[var(--status-critical-fg)]">{error}</p> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="card p-3">
          {loading ? (
            <p className="flex items-center gap-2 p-3 text-sm text-[var(--muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Загружаем занятия…
            </p>
          ) : filtered.length === 0 ? (
            <p className="p-3 text-sm text-[var(--muted)]">Занятий нет — создайте черновик выше.</p>
          ) : (
            <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
              {filtered.map((lecture: any) => {
                const active = String(lecture.id) === editorId;
                return (
                  <li key={lecture.id}>
                    <button
                      type="button"
                      onClick={() => openEditor(lecture)}
                      aria-current={active ? "true" : undefined}
                      className={
                        "w-full rounded-xl border-l-[3px] px-3 py-2 text-left text-sm transition " +
                        (active
                          ? "border-[var(--primary)] bg-[var(--primary-soft)] font-semibold"
                          : "border-transparent hover:bg-slate-50")
                      }
                    >
                      <span className="block leading-snug">{lecture.title || "Без названия"}</span>
                      <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                        {STATUS_LABEL[String((lecture as any).status)] || String((lecture as any).status || "")}
                        {(lecture as any).topic ? ` · ${(lecture as any).topic}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card min-w-0 space-y-3 p-3 sm:p-4">
          {!editorId ? (
            <p className="p-4 text-sm text-[var(--muted)]">Выберите занятие слева, чтобы открыть редактор.</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Название занятия"
                  className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm sm:col-span-2"
                />
                <input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="Тема"
                  className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                />
                <input
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  placeholder="Краткое описание"
                  className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                />
              </div>
              <RichLectureEditor
                value={body}
                onChange={(next) => {
                  setBody(next.markdown);
                  setBodyHtml(next.html);
                }}
                attachments={attachments}
                setAttachments={setAttachments}
                subject={subject}
                topic={topic}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={busy}
                  className="btn-primary inline-flex items-center gap-2 text-sm"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Сохранить занятие
                </button>
                <button
                  type="button"
                  onClick={() => void publish(editorId)}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold"
                >
                  Опубликовать
                </button>
                <Link
                  href={`/lectures/${encodeURIComponent(editorId)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
                >
                  Как видит студент <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
