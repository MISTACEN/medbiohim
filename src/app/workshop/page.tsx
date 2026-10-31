"use client";

/**
 * Мастерская — общий пул студенческих материалов.
 *
 * Загрузка идёт «в один поток»: файлы грузятся по очереди, затем сервер
 * подсказывает тип, предмет и теги. Десять фото собираются в одну фотолекцию,
 * PDF с вопросами разбирается на отдельные вопросы на сервере.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, BookOpen, Check, Clock, Eye, EyeOff,
  FileText, History, Image as ImageIcon, Layers, Loader2, Plus, Search, ShieldCheck,
  Trash2, Upload, X,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { describeApiError } from "@/lib/errors";
import { listSubjects, uploadFile } from "@/lib/api";
import {
  createWorkshopItem, deleteWorkshopItem, getWorkshopFileUrl, getWorkshopItem,
  listWorkshopItems, reportWorkshopItem, restoreWorkshopVersion, setWorkshopItemHidden,
  suggestWorkshop, updateWorkshopItem, workshopSettings, workshopVersions,
  type WorkshopItem,
} from "@/lib/api/workshop";

type Draft = { key: string; file: File; fileId?: string; error?: string };
type Subject = { id: string; name: string };

const KIND_LABEL: Record<string, string> = {
  photo_lecture: "Фотолекция",
  notes: "Конспект",
  test_questions: "Вопросы",
  pdf: "PDF-материал",
  other: "Материал",
};

const STATUS_LABEL: Record<string, string> = {
  published: "Опубликован",
  pending: "На проверке",
  hidden: "Скрыт",
  rejected: "Отклонён",
  draft: "Черновик",
  deleted: "Удалён",
};

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

function sortKey(name: string) {
  return name.localeCompare(name, "ru", { numeric: true, sensitivity: "base" });
}

function ItemFile({ itemId, file }: { itemId: string; file: { id: string; name: string; mime: string } }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void getWorkshopFileUrl(itemId, file.id).then((next) => { if (active) { setUrl(next); setFailed(!next); } });
    return () => { active = false; };
  }, [itemId, file.id]);
  const isImage = /^image\//.test(file.mime);
  if (isImage && url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-xl border border-[var(--border)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={file.name} className="h-36 w-full object-cover transition group-hover:scale-[1.02]" />
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-[11px] text-white">{file.name}</span>
      </a>
    );
  }
  return (
    <a
      href={url || undefined}
      target="_blank"
      rel="noreferrer"
      aria-disabled={!url}
      className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm hover:bg-slate-50"
    >
      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
      <span className="min-w-0 flex-1 truncate">{file.name}</span>
      {url ? <span className="text-xs text-indigo-600">открыть</span> : failed ? <span className="text-xs text-slate-400">недоступен</span> : <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300" />}
    </a>
  );
}

export default function WorkshopPage() {
  const { user } = useAuth();
  const loggedIn = Boolean(user);
  const staff = Boolean(user?.roles?.some((role) => role === "admin" || role === "moderator"));
  const [settings, setSettings] = useState<{ moderation_mode: "open" | "manual"; personal_data_warning: boolean }>({ moderation_mode: "open", personal_data_warning: true });
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [items, setItems] = useState<WorkshopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [composer, setComposer] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ title: "", topic: "", tags: "", summary: "", kind: "", subject_id: "", questionText: "", confirmed: false });
  const [suggestion, setSuggestion] = useState<any>(null);
  const [warning, setWarning] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [edit, setEdit] = useState({ title: "", summary: "", topic: "", tags: "" });
  const [reportReason, setReportReason] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    if (!loggedIn) { setLoading(false); return; }
    setLoading(true);
    setError("");
    const [list, settingsResult, subjectResult] = await Promise.all([
      listWorkshopItems({
        mine: tab === "mine",
        status: tab === "mine" ? undefined : undefined,
        subjectId: subjectFilter || undefined,
        kind: kindFilter || undefined,
        q: query.trim() || undefined,
        limit: 36,
      }),
      workshopSettings(),
      listSubjects(),
    ]);
    if (list.ok) {
      setItems((list.data.items || []) as WorkshopItem[]);
    } else {
      setError(describeApiError(list.error));
    }
    if (settingsResult.ok) setSettings({
      moderation_mode: settingsResult.data.moderation_mode === "manual" ? "manual" : "open",
      personal_data_warning: settingsResult.data.personal_data_warning !== false,
    });
    if (subjectResult?.ok) {
      setSubjects(((subjectResult.data.items || []) as Subject[]).map((subject) => ({ id: subject.id, name: subject.name })));
    }
    setLoading(false);
  }, [loggedIn, tab, subjectFilter, kindFilter, query]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!composer) return;
    const files = drafts.filter((draft) => !draft.error).map((draft) => ({ name: draft.file.name, mime: draft.file.type, size: draft.file.size }));
    if (!files.length && !form.questionText.trim()) { setSuggestion(null); return; }
    const timer = setTimeout(() => {
      void suggestWorkshop(files, form.questionText, form.title).then((result) => {
        if (!result.ok) return;
        setSuggestion(result.data);
        if (!form.title && result.data.title) setForm((current) => ({ ...current, title: result.data.title }));
        if (!form.kind && result.data.kind) setForm((current) => ({ ...current, kind: result.data.kind }));
        if (!form.tags && Array.isArray(result.data.tags)) setForm((current) => ({ ...current, tags: result.data.tags.join(", ") }));
        if (!form.subject_id && result.data.subjects?.[0]?.id) setForm((current) => ({ ...current, subject_id: result.data.subjects[0].id }));
        if (Array.isArray(result.data.personal_data_flags) && result.data.personal_data_flags.length) setWarning(result.data.personal_data_flags);
      });
    }, 400);
    return () => clearTimeout(timer);
    // Подсказки пересчитываются только при изменении состава загрузки/текста.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composer, drafts.map((draft) => `${draft.key}:${draft.fileId || ""}`).join(","), form.questionText]);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const next: Draft[] = Array.from(files).map((file) => ({ key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, file }));
    setDrafts((current) => [...current, ...next].sort((left, right) => sortKey(left.file.name) - sortKey(right.file.name)));
    setUploading(true);
    // Один поток: не душим API и видим ошибку конкретного файла.
    for (const draft of next) {
      const result = await uploadFile(draft.file).catch(() => null);
      setDrafts((current) => current.map((row) => row.key === draft.key
        ? result?.ok ? { ...row, fileId: String(result.data.file?.id || result.data.id || "") } : { ...row, error: result ? describeApiError(result.error) : "Не удалось загрузить" }
        : row));
    }
    setUploading(false);
  }

  async function submit() {
    setBusy(true);
    setError("");
    const files = drafts.filter((draft) => draft.fileId).map((draft) => ({ file_id: draft.fileId as string, name: draft.file.name, mime: draft.file.type, size: draft.file.size }));
    if (!files.length && !form.questionText.trim()) { setError("Добавьте фото, PDF или вставьте вопросы"); setBusy(false); return; }
    const result = await createWorkshopItem({
      title: form.title.trim() || undefined,
      summary: form.summary.trim() || undefined,
      kind: (form.kind || undefined) as any,
      subject_id: form.subject_id || null,
      topic: form.topic.trim() || null,
      tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      files,
      question_text: form.questionText.trim() || undefined,
      personal_data_confirmed: form.confirmed,
    });
    setBusy(false);
    if (!result.ok) {
      const details = result.error.details as { flags?: string[] } | undefined;
      if (Array.isArray(details?.flags)) setWarning(details.flags);
      setError(describeApiError(result.error));
      return;
    }
    const created = result.data.item as WorkshopItem;
    const extracted = Number(result.data.questions_extracted || 0);
    const extractionFailed = Boolean(result.data.extraction_error);
    setNote(created.status === "pending"
      ? "Материал отправлен на проверку модератору."
      : `Материал опубликован${extracted ? `, распознано вопросов: ${extracted}` : extractionFailed ? ". PDF не удалось распознать — вставьте вопросы текстом при обновлении" : ""}.`);
    setComposer(false);
    setDrafts([]);
    setForm({ title: "", topic: "", tags: "", summary: "", kind: "", subject_id: "", questionText: "", confirmed: false });
    setSuggestion(null);
    setWarning([]);
    await load();
  }

  async function openDetail(id: string) {
    setDetail(null);
    const result = await getWorkshopItem(id);
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setDetail(result.data);
    setEdit({
      title: result.data.item.title || "",
      summary: result.data.item.summary || "",
      topic: result.data.item.topic || "",
      tags: (result.data.item.tags || []).join(", "),
    });
    setVersions([]);
    if (result.data.is_author || result.data.staff) {
      const history = await workshopVersions(id);
      if (history.ok) setVersions(history.data.items || []);
    }
  }

  async function saveEdit() {
    if (!detail?.item?.id) return;
    setBusy(true);
    const result = await updateWorkshopItem(detail.item.id, {
      title: edit.title,
      summary: edit.summary,
      topic: edit.topic,
      tags: edit.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    });
    setBusy(false);
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote(result.data.moderation_mode === "manual" ? "Изменения сохранены и отправлены на повторную проверку." : "Изменения сохранены, версия добавлена в историю.");
    await openDetail(detail.item.id);
    await load();
  }

  async function toggleHidden(item: WorkshopItem) {
    const hide = item.status !== "hidden";
    const result = await setWorkshopItemHidden(item.id, hide);
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote(hide ? "Материал скрыт — его видите только вы и модераторы." : "Материал снова опубликован.");
    await openDetail(item.id);
    await load();
  }

  async function removeItem(item: WorkshopItem) {
    if (!window.confirm(`Удалить «${item.title}»? История версий сохранится для разбора.`)) return;
    const result = await deleteWorkshopItem(item.id);
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setDetail(null);
    setNote("Материал удалён из мастерской.");
    await load();
  }

  async function restore(versionNo: number) {
    if (!detail?.item?.id) return;
    if (!window.confirm(`Восстановить версию ${versionNo}? Текущая версия останется в истории.`)) return;
    const result = await restoreWorkshopVersion(detail.item.id, versionNo);
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote(`Восстановлена версия ${versionNo}.`);
    await openDetail(detail.item.id);
    await load();
  }

  async function report(item: WorkshopItem) {
    if (reportReason.trim().length < 3) { setError("Опишите причину жалобы"); return; }
    const result = await reportWorkshopItem(item.id, reportReason.trim());
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setReportReason("");
    setNote("Жалоба отправлена модераторам.");
  }

  const subjectName = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject.name])), [subjects]);

  if (!loggedIn) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">Мастерская</h1>
        <p className="page-subtitle">Войдите, чтобы делиться материалами</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Мастерская</h1>
          <p className="page-subtitle">Фотолекции, конспекты и вопросы от студентов — с версиями и модерацией</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={"inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold " + (settings.moderation_mode === "manual" ? "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]" : "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]")}>
            {settings.moderation_mode === "manual" ? <ShieldCheck className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            {settings.moderation_mode === "manual" ? "Ручная проверка" : "Открытая публикация"}
          </span>
          {staff && <Link href="/admin/workshop" className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm font-semibold">Модерация</Link>}
          <button type="button" onClick={() => setComposer((value) => !value)} className="btn-primary inline-flex items-center gap-2 text-sm">
            {composer ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {composer ? "Закрыть" : "Загрузить материал"}
          </button>
        </div>
      </header>

      {note && <div className="rounded-xl bg-[var(--status-ok-bg)] p-3 text-sm text-[var(--status-ok-fg)]">{note}</div>}
      {error && <div className="rounded-xl bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}

      {composer && (
        <section className="card space-y-4 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Новый материал</h2>
            <span className="text-xs text-slate-500">Можно выбрать 10 фото сразу — они станут одной фотолекцией</span>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,text/plain,.doc,.docx"
            className="hidden"
            onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ""; }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] px-4 py-8 text-sm text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/40"
          >
            {uploading ? <Loader2 className="h-6 w-6 animate-spin text-indigo-500" /> : <Upload className="h-6 w-6 text-indigo-500" />}
            <span className="font-semibold text-slate-700">{uploading ? "Загружаем по одному файлу…" : "Фото лекции, скриншоты или PDF"}</span>
            <span>Тип, предмет и теги система предложит сама</span>
          </button>

          {drafts.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {drafts.map((draft) => (
                <div key={draft.key} className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
                  {draft.file.type.startsWith("image/") ? <ImageIcon className="h-4 w-4 text-slate-400" /> : <FileText className="h-4 w-4 text-slate-400" />}
                  <span className="min-w-0 flex-1 truncate" title={draft.file.name}>{draft.file.name}</span>
                  {draft.error ? <span className="text-xs text-[var(--status-critical-fg)]" title={draft.error}>ошибка</span>
                    : draft.fileId ? <Check className="h-4 w-4 text-[var(--status-ok-fg)]" />
                      : <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300" />}
                  <button type="button" aria-label="Убрать файл" onClick={() => setDrafts((current) => current.filter((row) => row.key !== draft.key))} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}

          {suggestion?.kind && (
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              Система распознала: <b>{KIND_LABEL[suggestion.kind] || suggestion.kind}</b>
              {suggestion.batch_hint ? ` · ${suggestion.batch_hint}` : ""}
              {suggestion.questions_detected ? ` · вопросов в тексте: ${suggestion.questions_detected}` : ""}
              {suggestion.subjects?.[0] ? ` · вероятный предмет: ${suggestion.subjects[0].name}` : ""}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-slate-600">Название</span>
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={160} className="w-full rounded-xl border border-[var(--border)] px-3 py-2" placeholder="Например: Фотолекция · Гистология" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-slate-600">Предмет</span>
              <select value={form.subject_id} onChange={(event) => setForm({ ...form, subject_id: event.target.value })} className="w-full rounded-xl border border-[var(--border)] px-3 py-2">
                <option value="">Подобрать автоматически</option>
                {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-slate-600">Тема</span>
              <input value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value })} maxLength={200} className="w-full rounded-xl border border-[var(--border)] px-3 py-2" placeholder="Эмбриология, кровь…" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-slate-600">Теги</span>
              <input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} className="w-full rounded-xl border border-[var(--border)] px-3 py-2" placeholder="#гистология, #конспект" />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-semibold text-slate-600">Тип материала</span>
              <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} className="w-full rounded-xl border border-[var(--border)] px-3 py-2">
                <option value="">Определить автоматически</option>
                {Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-semibold text-slate-600">Описание (необязательно)</span>
              <textarea value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} rows={2} maxLength={4000} className="w-full rounded-xl border border-[var(--border)] px-3 py-2" />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-semibold text-slate-600">Вопросы теста текстом (PDF распознаётся автоматически)</span>
              <textarea value={form.questionText} onChange={(event) => setForm({ ...form, questionText: event.target.value })} rows={4} className="w-full rounded-xl border border-[var(--border)] px-3 py-2" placeholder={"1. Вопрос…\n2. Вопрос…"} />
            </label>
          </div>

          {warning.length > 0 && settings.personal_data_warning && (
            <div className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-sm text-[var(--status-warn-fg)]">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <b>Возможны чужие персональные данные</b>
                  <ul className="mt-1 list-inside list-disc text-xs">{warning.map((flag) => <li key={flag}>{flag}</li>)}</ul>
                  <label className="mt-2 flex items-start gap-2 text-xs font-semibold">
                    <input type="checkbox" checked={form.confirmed} onChange={(event) => setForm({ ...form, confirmed: event.target.checked })} className="mt-0.5 h-4 w-4" />
                    Подтверждаю: чужих персональных данных нет или я их вырезал
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
            <p className="text-xs text-slate-500">
              {settings.moderation_mode === "manual" ? "Материал проверит модератор перед публикацией." : "Материал появится сразу; автор может скрыть или удалить его в любой момент."}
            </p>
            <button type="button" onClick={() => void submit()} disabled={busy || uploading} className="btn-primary inline-flex items-center gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Отправить в мастерскую
            </button>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-[var(--border)] p-1">
          <button type="button" onClick={() => setTab("all")} className={"rounded-lg px-3 py-1.5 text-sm font-semibold " + (tab === "all" ? "bg-indigo-50 text-indigo-700" : "text-slate-500")}>Все материалы</button>
          <button type="button" onClick={() => setTab("mine")} className={"rounded-lg px-3 py-1.5 text-sm font-semibold " + (tab === "mine" ? "bg-indigo-50 text-indigo-700" : "text-slate-500")}>Мои</button>
        </div>
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по названию…" className="w-full rounded-xl border border-[var(--border)] py-2 pl-9 pr-3 text-sm" />
        </div>
        <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
          <option value="">Все предметы</option>
          {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
        <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
          <option value="">Все типы</option>
          {Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {loading ? <SkeletonList count={4} /> : items.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={tab === "mine" ? "У вас пока нет материалов" : "Мастерская пуста"}
          description={tab === "mine" ? "Загрузите фото лекции или PDF — материал появится здесь." : "Станьте первым: поделитесь конспектом или вопросами."}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article key={item.id} className="card flex flex-col gap-3 p-4">
              <button type="button" onClick={() => void openDetail(item.id)} className="min-w-0 text-left">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">{KIND_LABEL[item.kind] || item.kind}</span>
                  {item.status !== "published" && <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--status-warn-fg)]">{STATUS_LABEL[item.status] || item.status}</span>}
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><History className="h-3 w-3" />v{item.version_no}</span>
                </div>
                <h2 className="line-clamp-2 font-bold leading-snug">{item.title}</h2>
                <p className="mt-1 text-xs text-slate-500">{item.subject_name || (item.subject_id ? subjectName.get(item.subject_id) : "") || "Без предмета"}{item.topic ? ` · ${item.topic}` : ""}</p>
              </button>
              {!!item.tags?.length && (
                <div className="flex flex-wrap gap-1">
                  {item.tags.slice(0, 5).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">#{tag}</span>)}
                </div>
              )}
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2 text-xs text-slate-500">
                <span className="truncate">{item.author_name || "Студент"} · {formatDate(item.created_at)}</span>
                <button type="button" onClick={() => void openDetail(item.id)} className="inline-flex items-center gap-1 font-semibold text-indigo-600"><BookOpen className="h-3.5 w-3.5" />Открыть</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {detail?.item && (
        <section className="card space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">{KIND_LABEL[detail.item.kind] || detail.item.kind}</span>
                <span className="text-xs text-slate-500">{STATUS_LABEL[detail.item.status] || detail.item.status} · v{detail.item.version_no}</span>
              </div>
              <h2 className="mt-1 text-xl font-bold">{detail.item.title}</h2>
              <p className="text-sm text-slate-500">{detail.item.subject_name || "Без предмета"}{detail.item.topic ? ` · ${detail.item.topic}` : ""} · {detail.item.author_name || "Студент"}</p>
            </div>
            <button type="button" onClick={() => setDetail(null)} className="rounded-xl border border-[var(--border)] p-2" aria-label="Закрыть"><X className="h-4 w-4" /></button>
          </div>

          {detail.item.summary && <p className="whitespace-pre-wrap text-sm text-slate-700">{detail.item.summary}</p>}
          {!!detail.item.personal_data_flags?.length && (
            <div className="rounded-xl bg-[var(--status-warn-bg)] p-2 text-xs text-[var(--status-warn-fg)]">Автор подтвердил отсутствие чужих персональных данных. Метки: {detail.item.personal_data_flags.join(", ")}.</div>
          )}

          {!!detail.item.files?.length && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {detail.item.files.map((file: any) => <ItemFile key={file.id} itemId={detail.item.id} file={file} />)}
            </div>
          )}

          {!!detail.item.questions?.length && (
            <details className="rounded-xl border border-[var(--border)] p-3">
              <summary className="cursor-pointer text-sm font-semibold">Вопросы ({detail.item.questions.length})</summary>
              <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-slate-700">
                {detail.item.questions.map((question: any) => <li key={question.id}>{question.text}</li>)}
              </ol>
            </details>
          )}

          {detail.is_author && (
            <div className="space-y-3 rounded-xl bg-slate-50 p-3">
              <h3 className="text-sm font-bold">Управление автора</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <input value={edit.title} onChange={(event) => setEdit({ ...edit, title: event.target.value })} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="Название" />
                <input value={edit.topic} onChange={(event) => setEdit({ ...edit, topic: event.target.value })} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="Тема" />
                <input value={edit.tags} onChange={(event) => setEdit({ ...edit, tags: event.target.value })} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="Теги через запятую" />
                <input value={edit.summary} onChange={(event) => setEdit({ ...edit, summary: event.target.value })} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="Описание" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void saveEdit()} disabled={busy} className="btn-primary inline-flex items-center gap-2 text-sm">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Сохранить версию</button>
                <button type="button" onClick={() => void toggleHidden(detail.item)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm">
                  {detail.item.status === "hidden" ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {detail.item.status === "hidden" ? "Показать снова" : "Скрыть материал"}
                </button>
                <button type="button" onClick={() => void removeItem(detail.item)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--status-critical-fg)]"><Trash2 className="h-4 w-4" />Удалить</button>
              </div>
            </div>
          )}

          {versions.length > 0 && (
            <div className="rounded-xl border border-[var(--border)] p-3">
              <h3 className="flex items-center gap-2 text-sm font-bold"><Clock className="h-4 w-4" />История версий</h3>
              <div className="mt-2 space-y-1">
                {versions.map((version) => (
                  <div key={version.id} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-sm odd:bg-slate-50">
                    <span className="font-semibold">v{version.version_no}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-600">{version.note || version.title || "Версия"}</span>
                    <span className="text-xs text-slate-400">{formatDate(version.created_at)}</span>
                    {detail.is_author && version.version_no !== detail.item.version_no && (
                      <button type="button" onClick={() => void restore(version.version_no)} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold">Восстановить</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!detail.is_author && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] p-3">
              <input value={reportReason} onChange={(event) => setReportReason(event.target.value)} placeholder="Причина жалобы (чужие данные, ошибка…)" className="min-w-[200px] flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
              <button type="button" onClick={() => void report(detail.item)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold">Пожаловаться</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
