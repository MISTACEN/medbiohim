"use client";

/**
 * Личные занятия преподавателя (модуль teacher).
 *
 * Единый редактор RichLectureEditor — тот же, что в админ-консоли и у
 * студентов-авторов: формулы, chem-схемы, таблицы, индексы, вложения.
 * Хранение — маршруты /my-lectures: автор видит и правит только свои
 * занятия; публикация помечает их для общей проверки.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Loader2, Plus, Save } from "lucide-react";
import { RichLectureEditor } from "@/components/editor/RichLectureEditor";
import {
  createMyLecture,
  listMyLectures,
  publishMyLecture,
  updateMyLecture,
} from "@/lib/api/myLectures";
import { describeApiError } from "@/lib/errors";

type LectureItem = {
  id: string;
  title?: string;
  subject_slug?: string;
  topic?: string;
  body_md?: string;
  body_html?: string;
  status?: string;
  updated_at?: string;
};

type EditorAttachment = {
  type: "image" | "video" | "pdf" | "file";
  name: string;
  url: string;
  caption?: string;
  mime_type?: string;
};

const EMPTY = { title: "", subject_slug: "", topic: "", body_md: "", body_html: "" };

export function MyLectures() {
  const [items, setItems] = useState<LectureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ ...EMPTY });
  const [attachments, setAttachments] = useState<EditorAttachment[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result: any = await listMyLectures();
    if (result?.ok) setItems(Array.isArray(result.data?.items) ? result.data.items : []);
    else setError(describeApiError(result?.error));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setDraft({ ...EMPTY });
    setAttachments([]);
    setEditId(null);
    setCreating(true);
    setNote("");
  }

  function openEdit(lecture: LectureItem) {
    setDraft({
      title: String(lecture.title || ""),
      subject_slug: String(lecture.subject_slug || ""),
      topic: String(lecture.topic || ""),
      body_md: String(lecture.body_md || ""),
      body_html: String(lecture.body_html || ""),
    });
    setAttachments(Array.isArray((lecture as any).attachments) ? ((lecture as any).attachments as EditorAttachment[]) : []);
    setCreating(false);
    setEditId(String(lecture.id));
    setNote("");
  }

  function close() {
    setCreating(false);
    setEditId(null);
    setDraft({ ...EMPTY });
  }

  async function save() {
    if (!draft.title.trim()) {
      setNote("Название занятия обязательно");
      return;
    }
    const payload = {
      title: draft.title,
      subject_slug: draft.subject_slug || "general",
      topic: draft.topic,
      body_md: draft.body_md,
      body_html: draft.body_html,
      attachments,
    };
    setBusy("save");
    setNote("");
    const result: any = editId
      ? await updateMyLecture(editId, payload)
      : await createMyLecture(payload);
    setBusy("");
    if (result?.ok) {
      setNote(editId ? "Лекция сохранена" : "Лекция создана (черновик)");
      close();
      await load();
    } else {
      setNote(describeApiError(result?.error));
    }
  }

  async function publish(lecture: LectureItem) {
    setBusy("publish-" + lecture.id);
    const result: any = await publishMyLecture(lecture.id);
    setBusy("");
    setNote(result?.ok ? "Отправлено на публикацию" : describeApiError(result?.error));
    await load();
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <BookOpen className="h-5 w-5 text-indigo-600" /> Мои лекции
        </h2>
        <button type="button" onClick={openCreate} className="btn-secondary inline-flex items-center gap-1">
          <Plus className="h-4 w-4" /> Новая лекция
        </button>
      </div>

      {note && <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">{note}</div>}
      {error && <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}
      {loading && (
        <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      )}

      {!loading && !creating && editId == null && (
        <div className="space-y-2">
          {items.length === 0 && (
            <div className="card p-5 text-sm text-[var(--muted)]">
              Пока нет личных занятий. Создайте первую лекцию — редактор поддерживает формулы, таблицы, схемы и вложения.
            </div>
          )}
          {items.map((lecture) => (
            <div key={lecture.id} className="card flex flex-wrap items-start justify-between gap-2 p-4">
              <div>
                <div className="font-semibold">{lecture.title || "Без названия"}</div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">
                    {lecture.subject_slug || "без предмета"}
                  </span>
                  {lecture.topic && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{lecture.topic}</span>}
                  <span className={"rounded-full px-2 py-0.5 font-semibold " + (lecture.status === "published" ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "bg-slate-100 text-slate-600")}>
                    {lecture.status === "published" ? "опубликовано" : lecture.status || "черновик"}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/lectures/${encodeURIComponent(String(lecture.id))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                >
                  Как видит студент
                </Link>
                <button type="button" onClick={() => openEdit(lecture)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">
                  Редактор
                </button>
                {lecture.status !== "published" && (
                  <button
                    type="button"
                    disabled={busy === "publish-" + lecture.id}
                    onClick={() => void publish(lecture)}
                    className="rounded-lg bg-[var(--status-ok-fg)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Опубликовать
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editId != null) && (
        <div className="card space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="rounded-xl border p-2 text-sm"
              placeholder="Название занятия"
            />
            <input
              value={draft.subject_slug}
              onChange={(e) => setDraft({ ...draft, subject_slug: e.target.value })}
              className="rounded-xl border p-2 text-sm"
              placeholder="Предмет (slug), например histology"
            />
            <input
              value={draft.topic}
              onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
              className="rounded-xl border p-2 text-sm"
              placeholder="Тема"
            />
          </div>
          <RichLectureEditor
            value={draft.body_md}
            onChange={(next) => setDraft((d) => ({ ...d, body_md: next.markdown, body_html: next.html }))}
            attachments={attachments}
            setAttachments={(value) => setAttachments(value as EditorAttachment[])}
            subject={draft.subject_slug ? { slug: draft.subject_slug, name: draft.subject_slug } : null}
            topic={draft.topic}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy === "save"} onClick={() => void save()} className="btn-primary inline-flex items-center gap-2">
              <Save className="h-4 w-4" /> {busy === "save" ? "Сохраняю…" : "Сохранить"}
            </button>
            <button type="button" onClick={close} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">
              Закрыть
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
