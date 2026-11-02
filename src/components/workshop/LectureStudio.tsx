"use client";

/**
 * Занятия в Мастерской на общем редакторе лекций.
 *
 * Права: админ/модератор видят и правят все занятия (как в /admin/lectures).
 * Обычный пользователь видит только свои, создаёт черновик, правит текст и
 * публикует его в общий каталог.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Eye, Loader2, Plus, Save, Search, Upload } from "lucide-react";
import { RichLectureEditor } from "@/components/editor/RichLectureEditor";
import { LectureRenderer } from "@/components/lectures/LectureRenderer";
import { importDocument } from "@/lib/lectures/importDocument";
import {
  adminGenerateLecture,
  adminListLectures,
  adminPublishLecture,
  adminUpdateLecture,
  createMyLecture,
  listMyLectures,
  listSubjectsCatalog,
  publishMyLecture,
  updateMyLecture,
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
  archived: "В архиве",
};

export default function LectureStudio({ staff = false }: { staff?: boolean }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [slug, setSlug] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [editorId, setEditorId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // Предпросмотр открывается прямо в студии, без перехода на страницу лекции.
  const [showPreview, setShowPreview] = useState(false);
  const [importing, setImporting] = useState(false);

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

  const reload = useCallback(
    async (subjectSlug: string) => {
      setLoading(true);
      setError("");
      // Сотрудник работает со всем каталогом занятий, автор — только со своими.
      const result: any = staff
        ? await adminListLectures(undefined, subjectSlug || undefined)
        : await listMyLectures();
      if (!result?.ok) {
        setItems([]);
        setError(describeApiError(result?.error));
        setLoading(false);
        return;
      }
      const list = ((result.data.items || []) as Lecture[]).filter((item) =>
        staff ? true : !subjectSlug || String((item as any).subject_slug || "") === subjectSlug
      );
      setItems(list);
      setLoading(false);
    },
    [staff]
  );

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
    if (!slug) {
      setError("Выберите предмет");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    if (staff) {
      // У сотрудника черновик по теме плана генерирует тот же сервис, что в админке.
      if (!newTitle.trim()) {
        setBusy(false);
        setError("Укажите тему занятия");
        return;
      }
      const result: any = await adminGenerateLecture({
        subject_slug: slug,
        topic: newTitle.trim(),
        lesson_type: "lecture",
      });
      setBusy(false);
      if (!result?.ok) {
        setError(describeApiError(result?.error));
        return;
      }
      setMessage("Черновик создан — откройте его в списке и доработайте.");
      setNewTitle("");
      await reload(slug);
      const created = result.data?.lecture || result.data?.item;
      if (created?.id) openEditor(created);
      return;
    }

    // Автор создаёт своё занятие с пустым текстом и сразу пишет в редакторе.
    const result: any = await createMyLecture({
      title: newTitle.trim() || "Новое занятие",
      subject_slug: slug,
      subject: subject?.name || slug,
      topic: newTitle.trim() || null,
      lesson_type: "lecture",
      body_md: "",
      body_html: "",
    });
    setBusy(false);
    if (!result?.ok) {
      setError(describeApiError(result?.error));
      return;
    }
    setNewTitle("");
    setMessage("Занятие создано. Напишите текст и опубликуйте его в общий доступ.");
    await reload(slug);
    if (result.data?.lecture?.id) openEditor(result.data.lecture);
  }

  /** Импорт своего документа: текст размечается и открывается в редакторе. */
  async function importFile(file: File) {
    if (!slug) {
      setError("Выберите предмет");
      return;
    }
    setImporting(true);
    setError("");
    setMessage("");
    try {
      const document = await importDocument(file);
      const created: any = await createMyLecture({
        title: document.title,
        subject_slug: slug,
        subject: subject?.name || slug,
        lesson_type: "lecture",
        body_md: document.markdown,
        body_html: "",
      });
      if (!created?.ok) {
        setError(describeApiError(created?.error));
        return;
      }
      setMessage(
        "Импортировано " + String(document.source).toUpperCase() + " · " + document.chars + " символов. Проверьте текст и опубликуйте занятие."
      );
      await reload(slug);
      if (created.data?.lecture) openEditor(created.data.lecture);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не удалось импортировать документ");
    } finally {
      setImporting(false);
    }
  }

  async function save() {
    if (!editorId) return;
    setBusy(true);
    setError("");
    setMessage("");
    const payload = { title, topic, summary, body_md: body, body_html: bodyHtml, attachments };
    const result: any = staff ? await adminUpdateLecture(editorId, payload) : await updateMyLecture(editorId, payload);
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
    setError("");
    const result: any = staff ? await adminPublishLecture(id) : await publishMyLecture(id);
    setBusy(false);
    if (!result?.ok) {
      setError(describeApiError(result?.error));
      return;
    }
    setMessage("Занятие опубликовано в общем каталоге.");
    await reload(slug);
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-[var(--primary)]" />
          <h2 className="text-base font-bold">
            {staff ? "Занятия: все лекции" : "Мои занятия"}
          </h2>
        </div>
        <p className="text-xs text-[var(--muted)]">
          {staff
            ? "Тот же редактор, что в админке: можно править любое занятие и публиковать его."
            : "Пишите свои занятия в общем редакторе и публикуйте их в общий доступ. Чужие лекции не редактируются."}
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
            <span className="mb-1 block text-xs text-[var(--muted)]">
              {staff ? "Новая тема по учебному плану" : "Название занятия"}
            </span>
            <input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder={staff ? "Например: Эндокринная система" : "Например: Конспект по эндокринологии"}
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
            {staff ? "Создать черновик" : "Создать занятие"}
          </button>
          <label
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold"
            title="Импорт .md, .txt, .docx, .pdf или фото страницы"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importing ? "Импортирую…" : "Импорт документа"}
            <input
              type="file"
              accept=".md,.markdown,.txt,.docx,.pdf,image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
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
            <p className="p-3 text-sm text-[var(--muted)]">
              {staff ? "Занятий нет — создайте черновик выше." : "У вас пока нет занятий — создайте первое выше."}
            </p>
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
                        {STATUS_LABEL[String(lecture.status)] || String(lecture.status || "черновик")}
                        {lecture.topic ? ` · ${lecture.topic}` : ""}
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
            <p className="p-4 text-sm text-[var(--muted)]">
              Выберите занятие слева, чтобы открыть редактор.
            </p>
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
              {showPreview && (
                <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    <span>Предпросмотр — как на странице студента</span>
                    <button type="button" onClick={() => setShowPreview(false)} className="text-[var(--primary)]">
                      Скрыть
                    </button>
                  </div>
                  <LectureRenderer markdown={body} />
                </div>
              )}
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
                  title={staff ? "Опубликовать занятие" : "Опубликовать своё занятие в общий каталог"}
                >
                  Опубликовать
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreview((value) => !value)}
                  aria-pressed={showPreview}
                  className={
                    "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm " +
                    (showPreview
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] font-semibold text-[var(--primary)]"
                      : "border-[var(--border)] bg-white font-semibold")
                  }
                >
                  <Eye className="h-4 w-4" />
                  {showPreview ? "Скрыть предпросмотр" : "Как видит студент"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
