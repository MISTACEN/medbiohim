"use client";

/**
 * «Мои файлы»: загрузка в серверное хранилище, коллекции, читатель и заметки.
 *
 * Файл уходит в Worker (`POST /files/upload`, лимит 12 МБ) и остаётся в
 * `public.files`; локально хранится только обвязка — предмет, коллекция,
 * прогресс чтения, закладки. Читатель открывает файл по подписанной ссылке,
 * которую выдаёт `GET /files/:id`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BookMarked, Check, Download, ExternalLink, FileText, Image as ImageIcon,
  Loader2, Search, Trash2, Upload, X,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getFile, uploadFile } from "@/lib/api";
import {
  addUserFile, collectionNames, formatFileSize, readUserFiles,
  removeUserFile, summarizeUserFiles, updateUserFile,
  type FileBookmark, type UserFile,
} from "@/lib/libraryFiles";

const SUBJECT_OPTIONS: Array<{ slug: string; label: string }> = [
  { slug: "", label: "Без предмета" },
  { slug: "physiology", label: "Физиология" },
  { slug: "histology", label: "Гистология" },
  { slug: "biology", label: "Биология" },
  { slug: "chemistry_organic_physical", label: "Органическая и физическая химия" },
  { slug: "inorganic_chemistry", label: "Неорганическая химия" },
];

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain",
]);
const ACCEPT = ".pdf,.txt,.doc,.docx,image/jpeg,image/png,image/webp,image/gif";

function subjectLabel(slug: string): string {
  return SUBJECT_OPTIONS.find((option) => option.slug && option.slug === slug)?.label ?? "Без предмета";
}

function isImage(mime: string): boolean {
  return /^image\//.test(mime);
}

/** Ссылка на скачивание: подписанный URL из API либо null. */
async function resolveFileUrl(id: string): Promise<string | null> {
  try {
    const result: any = await getFile(id);
    if (!result?.ok) return null;
    return String(result.data?.download?.url ?? "") || null;
  } catch {
    return null;
  }
}

function Reader({
  file,
  onClose,
  onPatch,
}: {
  file: UserFile;
  onClose: () => void;
  onPatch: (patch: Partial<Omit<UserFile, "id">>) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [bookmarkLabel, setBookmarkLabel] = useState("");
  const [bookmarkPosition, setBookmarkPosition] = useState("");
  const [notes, setNotes] = useState(file.notes);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    void resolveFileUrl(file.id).then((next) => {
      if (!active) return;
      setUrl(next);
      setFailed(!next);
      setLoading(false);
    });
    return () => { active = false; };
  }, [file.id]);

  useEffect(() => { setNotes(file.notes); }, [file.id, file.notes]);

  const addBookmark = () => {
    const label = bookmarkLabel.trim();
    if (!label) return;
    const bookmark: FileBookmark = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: label.slice(0, 200),
      position: bookmarkPosition.trim().slice(0, 50),
    };
    onPatch({ bookmarks: [...file.bookmarks, bookmark] });
    setBookmarkLabel("");
    setBookmarkPosition("");
  };

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{file.name}</h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {subjectLabel(file.subjectSlug)} · {formatFileSize(file.size)} · {file.collection || "без коллекции"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold hover:border-[var(--primary)]"
            >
              <Download className="h-3.5 w-3.5" /> Скачать
            </a>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть читатель"
            className="rounded-lg border border-[var(--border)] p-1.5 hover:bg-[var(--primary-soft)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)] bg-slate-50">
        {loading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Открываю файл
          </div>
        ) : failed || !url ? (
          <div className="p-4 text-sm text-[var(--muted)]">
            Файл не открылся: ссылка недоступна или файл удалён из хранилища.
            {isImage(file.mime) ? " Попробуйте загрузить его заново." : ""}
          </div>
        ) : isImage(file.mime) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={file.name} className="max-h-[70vh] w-full object-contain" />
        ) : (
          <iframe title={file.name} src={url} className="h-[70vh] w-full bg-white" />
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Прогресс чтения: {file.progressPercent}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={file.progressPercent}
            onChange={(event) => onPatch({ progressPercent: Number(event.target.value) })}
            aria-label="Прогресс чтения"
            className="w-full accent-[var(--primary)]"
          />
          <div className="flex flex-wrap gap-1.5">
            {[25, 50, 75, 100].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onPatch({ progressPercent: value })}
                className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold hover:border-[var(--primary)]"
              >
                {value === 100 ? "Прочитано" : `${value}%`}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="bookmark-label" className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Закладка
          </label>
          <div className="flex gap-1.5">
            <input
              id="bookmark-label"
              value={bookmarkLabel}
              onChange={(event) => setBookmarkLabel(event.target.value)}
              placeholder="Название темы"
              className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
            />
            <input
              value={bookmarkPosition}
              onChange={(event) => setBookmarkPosition(event.target.value)}
              placeholder="стр."
              aria-label="Страница закладки"
              className="w-16 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
            />
            <button
              type="button"
              onClick={addBookmark}
              disabled={!bookmarkLabel.trim()}
              className="rounded-lg bg-[var(--primary)] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Добавить
            </button>
          </div>
          {file.bookmarks.length ? (
            <ul className="space-y-1">
              {file.bookmarks.map((bookmark) => (
                <li key={bookmark.id} className="flex items-center gap-2 text-xs">
                  <BookMarked className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
                  <span className="min-w-0 flex-1 truncate">
                    {bookmark.label}
                    {bookmark.position ? ` · ${bookmark.position}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => onPatch({ bookmarks: file.bookmarks.filter((item) => item.id !== bookmark.id) })}
                    aria-label={`Удалить закладку ${bookmark.label}`}
                    className="text-[var(--muted)] hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[var(--muted)]">Закладок пока нет.</p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="file-notes" className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Заметки
        </label>
        <textarea
          id="file-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => onPatch({ notes })}
          rows={3}
          placeholder="Что запомнить по этому файлу"
          className="mt-1 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
        />
        <button
          type="button"
          onClick={() => onPatch({ notes })}
          className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold hover:border-[var(--primary)]"
        >
          <Check className="h-3.5 w-3.5" /> Сохранить заметку
        </button>
      </div>
    </section>
  );
}

export default function UserFiles() {
  const { user } = useAuth();
  const [files, setFiles] = useState<UserFile[]>([]);
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [collectionDraft, setCollectionDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(() => setFiles(readUserFiles()), []);
  useEffect(() => { refresh(); }, [refresh]);

  const collections = useMemo(() => collectionNames(files), [files]);
  const summary = useMemo(() => summarizeUserFiles(files), [files]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return files
      .filter((file) => (collection ? file.collection === collection : true))
      .filter((file) => (subjectSlug ? file.subjectSlug === subjectSlug : true))
      .filter((file) => !needle || file.name.toLowerCase().includes(needle) || file.collection.toLowerCase().includes(needle))
      .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
  }, [files, query, collection, subjectSlug]);

  const opened = files.find((file) => file.id === openId) ?? null;

  const patch = (id: string, nextPatch: Partial<Omit<UserFile, "id">>) => {
    setFiles(updateUserFile(id, nextPatch));
  };

  const handleUpload = async (selected: File | null) => {
    if (!selected) return;
    setError("");
    setNotice("");
    if (!user) {
      setError("Загрузка доступна после входа: файл привязывается к вашему аккаунту.");
      return;
    }
    if (selected.size > MAX_BYTES) {
      setError("Файл больше 12 МБ — сервер такой не примет.");
      return;
    }
    if (selected.type && !ALLOWED_MIME.has(selected.type)) {
      setError("Этот тип файла не поддерживается: PDF, DOC/DOCX, TXT или изображение.");
      return;
    }
    setUploading(true);
    try {
      const result: any = await uploadFile(selected);
      const created = result?.ok ? result.data?.file : null;
      if (!created?.id) {
        setError(String(result?.error?.message ?? "Не удалось загрузить файл. Попробуйте ещё раз."));
        return;
      }
      const nextFiles = addUserFile({
        id: String(created.id),
        name: String(created.original_name ?? selected.name),
        mime: String(created.mime_type ?? selected.type ?? "application/octet-stream"),
        size: Number(created.size_bytes ?? selected.size),
        subjectSlug,
        collection: collectionDraft.trim(),
        addedAt: new Date().toISOString(),
        progressPercent: 0,
        bookmarks: [],
        notes: "",
      });
      setFiles(nextFiles);
      setNotice(`«${selected.name}» добавлен в библиотеку.`);
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setError("Сеть недоступна: файл не загружен.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (file: UserFile) => {
    setFiles(removeUserFile(file.id));
    if (openId === file.id) setOpenId(null);
    setNotice(`«${file.name}» убран из библиотеки. Файл остаётся в хранилище аккаунта.`);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="library-file" className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Загрузить файл
          </label>
          <input
            id="library-file"
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            disabled={uploading || !user}
            onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--primary)] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white disabled:opacity-50"
          />
          <p className="text-[11px] leading-5 text-[var(--muted)]">
            PDF, DOC/DOCX, TXT или изображение до 12 МБ. Файл хранится в аккаунте и доступен только вам.
          </p>
          {!user ? (
            <p className="text-[11px] text-[var(--muted)]">
              <Link href="/login" className="font-semibold text-[var(--primary)] hover:underline">Войдите</Link>, чтобы загружать свои файлы.
            </p>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="library-subject" className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Предмет
            </label>
            <select
              id="library-subject"
              value={subjectSlug}
              onChange={(event) => setSubjectSlug(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-2 text-sm outline-none focus:border-[var(--primary)]"
            >
              {SUBJECT_OPTIONS.map((option) => (
                <option key={option.slug || "none"} value={option.slug}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="library-collection" className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Коллекция
            </label>
            <input
              id="library-collection"
              list="library-collections"
              value={collectionDraft}
              onChange={(event) => setCollectionDraft(event.target.value)}
              placeholder="Например, к зачёту"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />
            <datalist id="library-collections">
              {collections.map((name) => <option key={name} value={name} />)}
            </datalist>
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--primary-soft)] px-3 py-2 text-sm">{notice}</p>
      ) : null}

      {files.length ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Файлов", String(summary.total)],
              ["Коллекций", String(summary.collections)],
              ["Прочитано", String(summary.read)],
              ["Средний прогресс", summary.averageProgress === null ? "—" : `${summary.averageProgress}%`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                <div className="text-lg font-extrabold">{value}</div>
                <div className="text-[11px] text-[var(--muted)]">{label}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск по моим файлам"
                aria-label="Поиск по моим файлам"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <select
              value={collection}
              onChange={(event) => setCollection(event.target.value)}
              aria-label="Фильтр по коллекции"
              className="rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-2 text-xs"
            >
              <option value="">Все коллекции</option>
              {collections.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>

          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--muted)]">
              Под фильтр ничего не подошло.
            </p>
          ) : (
            <ul className="space-y-2">
              {visible.map((file) => (
                <li key={file.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
                  <div className="flex flex-wrap items-start gap-2">
                    {isImage(file.mime) ? (
                      <ImageIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />
                    ) : (
                      <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => setOpenId(openId === file.id ? null : file.id)}
                        className="block max-w-full truncate text-left text-sm font-semibold hover:underline"
                      >
                        {file.name}
                      </button>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {subjectLabel(file.subjectSlug)} · {formatFileSize(file.size)}
                        {file.collection ? ` · ${file.collection}` : ""}
                        {file.progressPercent ? ` · прочитано ${file.progressPercent}%` : ""}
                        {file.bookmarks.length ? ` · закладок: ${file.bookmarks.length}` : ""}
                      </p>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
                        <div className="h-full bg-[var(--primary)]" style={{ width: `${file.progressPercent}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setOpenId(openId === file.id ? null : file.id)}
                        className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold hover:border-[var(--primary)]"
                      >
                        {openId === file.id ? "Свернуть" : "Читать"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(file)}
                        aria-label={`Убрать ${file.name} из библиотеки`}
                        className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--muted)] hover:border-red-300 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
          <Upload className="mx-auto h-6 w-6 text-[var(--muted)]" />
          <p className="mt-2 text-sm font-semibold">Здесь появятся ваши файлы</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[var(--muted)]">
            Загрузите методичку, конспект или фото — они попадут в личную библиотеку с прогрессом,
            закладками и заметками. Материалы мастерской остаются в разделе{" "}
            <Link href="/workshop" className="font-semibold text-[var(--primary)] hover:underline">Мастерская</Link>.
          </p>
        </div>
      )}

      {opened ? (
        <Reader
          key={opened.id}
          file={opened}
          onClose={() => setOpenId(null)}
          onPatch={(nextPatch) => patch(opened.id, nextPatch)}
        />
      ) : null}

      <p className="flex items-start gap-1.5 text-[11px] leading-5 text-[var(--muted)]">
        <ExternalLink className="mt-1 h-3 w-3 shrink-0" />
        Коллекции, прогресс и заметки хранятся в этом браузере. Заметки не синхронизируются между устройствами;
        сам файл — на сервере.
      </p>
    </div>
  );
}
