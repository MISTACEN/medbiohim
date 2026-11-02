"use client";

/**
 * Личная библиотека: всё, что пользователь загрузил в свои занятия и материалы
 * Мастерской, собирается в одном месте — как библиотека в игровом клиенте.
 * Сюда попадают файлы из черновиков и опубликованных работ, поэтому ничего
 * загруженное не теряется после публикации.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen, FileText, FolderOpen, Image as ImageIcon, Loader2, Search, Video,
} from "lucide-react";
import { fileDownloadUrl, listMyLectures } from "@/lib/api";
import { getWorkshopFileUrl, listWorkshopItems } from "@/lib/api/workshop";
import { describeApiError } from "@/lib/errors";

type LibKind = "image" | "video" | "pdf" | "file";
type LibScope = "lecture" | "workshop";

type LibFile = {
  key: string;
  name: string;
  kind: LibKind;
  scope: LibScope;
  parentId: string;
  parentTitle: string;
  href?: string;
  itemId?: string;
  fileId?: string;
};

const KIND_ICON: Record<LibKind, typeof FileText> = {
  image: ImageIcon,
  video: Video,
  pdf: FileText,
  file: FileText,
};

const KIND_LABEL: Record<LibKind, string> = {
  image: "фото",
  video: "видео",
  pdf: "PDF",
  file: "файл",
};

function normalizeKind(type?: unknown, mime?: unknown, name?: unknown): LibKind {
  const declared = String(type || "").toLowerCase();
  if (declared === "image" || declared === "video" || declared === "pdf") return declared;
  const mimeValue = String(mime || "").toLowerCase();
  if (mimeValue.startsWith("image/")) return "image";
  if (mimeValue.startsWith("video/")) return "video";
  if (mimeValue === "application/pdf") return "pdf";
  if (/\.(png|jpe?g|webp|gif)$/i.test(String(name || ""))) return "image";
  return "file";
}

/** Файл материала мастерской отдаётся только через аутентифицированный прокси. */
function LibraryFile({ file }: { file: LibFile }) {
  const [url, setUrl] = useState<string | null>(file.href || null);
  const [failed, setFailed] = useState(false);
  const { href, itemId, fileId } = file;

  useEffect(() => {
    if (href || !itemId || !fileId) return;
    let active = true;
    void getWorkshopFileUrl(itemId, fileId).then((next) => {
      if (!active) return;
      setUrl(next);
      setFailed(!next);
    });
    return () => {
      active = false;
    };
  }, [href, itemId, fileId]);

  const Icon = KIND_ICON[file.kind];
  return (
    <li className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{file.name}</div>
        <div className="truncate text-[11px] text-[var(--muted)]">
          {KIND_LABEL[file.kind]} · {file.scope === "lecture" ? "занятие" : "материал"}: {file.parentTitle}
        </div>
      </div>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-[var(--primary)]">
          открыть
        </a>
      ) : failed ? (
        <span className="shrink-0 text-xs text-slate-400">недоступен</span>
      ) : (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-300" />
      )}
    </li>
  );
}

export default function MyLibrary() {
  const [lectures, setLectures] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | LibScope>("all");

  useEffect(() => {
    let alive = true;
    (async () => {
      const [lectureResult, itemResult]: any[] = await Promise.all([
        listMyLectures(),
        listWorkshopItems({ mine: true, limit: 100 }),
      ]);
      if (!alive) return;
      if (lectureResult?.ok) setLectures(Array.isArray(lectureResult.data?.items) ? lectureResult.data.items : []);
      if (itemResult?.ok) setItems(Array.isArray(itemResult.data?.items) ? itemResult.data.items : []);
      const problems = [
        lectureResult?.ok ? "" : describeApiError(lectureResult?.error),
        itemResult?.ok ? "" : describeApiError(itemResult?.error),
      ].filter(Boolean);
      setError(problems.join(" · "));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const files = useMemo(() => {
    const out: LibFile[] = [];
    for (const lecture of lectures) {
      const list = Array.isArray(lecture?.attachments) ? lecture.attachments : [];
      list.forEach((attachment: any, index: number) => {
        const fileId = String(attachment?.file_id || "");
        const name = String(attachment?.name || "Файл");
        out.push({
          key: `lecture-${lecture.id}-${fileId || index}`,
          name,
          kind: normalizeKind(attachment?.type, attachment?.mime_type, name),
          scope: "lecture",
          parentId: String(lecture.id || ""),
          parentTitle: String(lecture.title || "Без названия"),
          href: attachment?.url || (fileId ? fileDownloadUrl(fileId) : undefined),
        });
      });
    }
    for (const item of items) {
      const list = Array.isArray(item?.files) ? item.files : [];
      list.forEach((file: any) => {
        const name = String(file?.name || "Файл");
        out.push({
          key: `workshop-${item.id}-${file.id}`,
          name,
          kind: normalizeKind(undefined, file?.mime, name),
          scope: "workshop",
          parentId: String(item.id || ""),
          parentTitle: String(item.title || "Материал"),
          itemId: String(item.id || ""),
          fileId: String(file.id || ""),
        });
      });
    }
    return out;
  }, [lectures, items]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return files
      .filter((file) => scope === "all" || file.scope === scope)
      .filter((file) => !needle || `${file.name} ${file.parentTitle}`.toLowerCase().includes(needle));
  }, [files, query, scope]);

  const counts = useMemo(
    () => ({
      all: files.length,
      lecture: files.filter((file) => file.scope === "lecture").length,
      workshop: files.filter((file) => file.scope === "workshop").length,
    }),
    [files]
  );

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-[var(--primary)]" />
          <h2 className="text-base font-bold">Моя библиотека</h2>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Всё, что вы загрузили в занятия и материалы Мастерской, хранится здесь: фото, PDF, видео и файлы.
          Загруженное в черновике никуда не пропадает после публикации.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {([
            { id: "all", label: `Всё · ${counts.all}` },
            { id: "lecture", label: `Занятия · ${counts.lecture}` },
            { id: "workshop", label: `Материалы · ${counts.workshop}` },
          ] as const).map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setScope(row.id)}
              aria-pressed={scope === row.id}
              className={
                "rounded-xl px-3 py-1.5 text-xs font-semibold transition " +
                (scope === row.id
                  ? "bg-[var(--primary)] text-white"
                  : "border border-[var(--border)] bg-white text-slate-600 hover:bg-slate-50")
              }
            >
              {row.label}
            </button>
          ))}
          <label className="inline-flex min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по файлам и занятиям"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
        </div>
        {error ? <p className="text-xs text-[var(--status-critical-fg)]">{error}</p> : null}
      </div>

      <div className="card space-y-3 p-3 sm:p-4">
        {loading ? (
          <p className="flex items-center gap-2 p-2 text-sm text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Собираем библиотеку…
          </p>
        ) : visible.length === 0 ? (
          <div className="p-4 text-sm text-[var(--muted)]">
            <p>Здесь пока пусто. Прикрепите фото или файл в занятии или в материале Мастерской — он появится в библиотеке.</p>
            <p className="mt-3 flex flex-wrap gap-2">
              <Link href="/workshop" className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)]">
                <FileText className="h-3.5 w-3.5" /> Загрузить материал
              </Link>
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)]">
                <BookOpen className="h-3.5 w-3.5" /> Занятия — на вкладке «Мои занятия»
              </span>
            </p>
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {visible.map((file) => (
              <LibraryFile key={file.key} file={file} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
