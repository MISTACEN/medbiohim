"use client";

/**
 * Мастерская: загрузка «в один поток», подсказки типа/предмета, карточка
 * материала с версиями и модерацией. Разметка — в панелях `components/workshop`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { describeApiError } from "@/lib/errors";
import { listSubjects, uploadFile } from "@/lib/api";
import {
  createWorkshopItem, deleteWorkshopItem, getWorkshopItem,
  listWorkshopItems, reportWorkshopItem, restoreWorkshopVersion, setWorkshopItemHidden,
  suggestWorkshop, updateWorkshopItem, workshopSettings, workshopVersions,
  type WorkshopItem,
} from "@/lib/api/workshop";
import { sortKey, type Draft, type Subject } from "@/components/workshop/model";

export type WorkshopState = ReturnType<typeof useWorkshopPage>;

const EMPTY_FORM = { title: "", topic: "", tags: "", summary: "", kind: "", subject_id: "", questionText: "", confirmed: false };

export function useWorkshopPage() {
  const { user } = useAuth();
  const { confirm, dialog } = useConfirm();
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
  // Сотрудникам доступен второй раздел — занятия на том же редакторе, что в админке.
  const [section, setSection] = useState<"materials" | "lectures" | "library" | "questions">("materials");
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
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
    setForm(EMPTY_FORM);
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
    if (!(await confirm({
      title: `Удалить «${item.title}»?`,
      description: "История версий сохранится для разбора.",
      confirmLabel: "Удалить",
      danger: true,
    }))) return;
    const result = await deleteWorkshopItem(item.id);
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setDetail(null);
    setNote("Материал удалён из мастерской.");
    await load();
  }

  async function restore(versionNo: number) {
    if (!detail?.item?.id) return;
    if (!(await confirm({
      title: `Восстановить версию ${versionNo}?`,
      description: "Текущая версия останется в истории.",
      confirmLabel: "Восстановить",
    }))) return;
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

  // Фото из загрузки, которые показываем рядом с их вопросом (i-й вопрос → i-е фото).
  const questionPhotos = useMemo(() => {
    const files = ((detail?.item?.files || []) as any[])
      .filter((file) => /^image\//.test(String(file.mime || "")))
      .slice()
      .sort((left, right) => Number(left.position || 0) - Number(right.position || 0));
    return files;
  }, [detail]);
  const pairedPhotoIds = useMemo(() => {
    const count = Number(detail?.item?.questions?.length || 0);
    return new Set(questionPhotos.slice(0, count).map((file: any) => String(file.id)));
  }, [detail, questionPhotos]);

  return {
    user,
    dialog,
    loggedIn,
    staff,
    settings,
    subjects,
    items,
    loading,
    note,
    setNote,
    error,
    setError,
    tab,
    setTab,
    query,
    setQuery,
    subjectFilter,
    setSubjectFilter,
    kindFilter,
    setKindFilter,
    composer,
    setComposer,
    drafts,
    setDrafts,
    section,
    setSection,
    uploading,
    form,
    setForm,
    suggestion,
    warning,
    busy,
    detail,
    setDetail,
    versions,
    edit,
    setEdit,
    reportReason,
    setReportReason,
    inputRef,
    load,
    addFiles,
    submit,
    openDetail,
    saveEdit,
    toggleHidden,
    removeItem,
    restore,
    report,
    subjectName,
    questionPhotos,
    pairedPhotoIds,
  };
}
