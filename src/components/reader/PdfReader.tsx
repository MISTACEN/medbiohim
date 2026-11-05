"use client";

/**
 * Читалка учебных PDF (§13 задания агента №2): масштабирование, навигация,
 * поиск по тексту, оглавление (outline), закладки и заметки, сохранение
 * позиции, ночной режим, мобильная адаптация.
 *
 * Источники честно разделены:
 *  - PDF из материалов MEDBIOHIM — тот же same-origin маршрут
 *    /api/v1/materials/:id/file, что и в библиотеке (авторизация cookie/Bearer);
 *  - локальный файл пользователя — читается в браузере, никуда не загружается;
 *  - внешние ресурсы университета (elib.fesmu.ru и др.) — только библиографические
 *    карточки и официальные переходы: авторизация и ограничение доступа не
 *    обходятся, полнотекстовый парсинг сторонних сайтов не выполняется.
 *
 * Заметки, закладки и позиция хранятся локально с ключом на пользователя.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BookmarkPlus, ChevronLeft, ChevronRight, Expand, Loader2, Maximize2, Minus,
  Moon, PenLine, Plus, Search, Sun, Trash2,
} from "lucide-react";
import { currentUserScope } from "@/lib/auth/session";

export type ReaderSource =
  | { type: "material"; id: string; title: string }
  | { type: "local"; title: string; file: File }
  | { type: "external"; title: string; url: string };

type Bookmark = { page: number; label: string };
type Note = { page: number; text: string };

const POSITION_PREFIX = "mbh:reader:position";
const MARKS_PREFIX = "mbh:reader:marks";

function userKey(prefix: string, sourceId: string): string {
  const scope = currentUserScope();
  return `${prefix}:${scope ?? "anon"}:${sourceId}`;
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* переполнение — позиция/заметки останутся только на экране */
  }
}

export function PdfReader({ source }: { source: ReaderSource }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const sourceId = source.type === "material" ? `material:${source.id}` : source.type === "external" ? `external:${source.url}` : "local";
  const positionKey = userKey(POSITION_PREFIX, sourceId);
  const marksKey = userKey(MARKS_PREFIX, sourceId);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.25);
  const [night, setNight] = useState(false);
  const [outline, setOutline] = useState<Array<{ title: string; dest: string | null }>>([]);
  const [showOutline, setShowOutline] = useState(false);
  const [query, setQuery] = useState("");
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteDraft, setNoteDraft] = useState("");

  // Загрузка документа.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus("loading");
      setError("");
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        let data: ArrayBuffer;
        if (source.type === "material") {
          const res = await fetch(`/api/v1/materials/${encodeURIComponent(source.id)}/file`, { credentials: "include" });
          if (!res.ok) throw new Error(`Материал недоступен (${res.status}). Возможно, файл не является публичным PDF.`);
          data = await res.arrayBuffer();
        } else if (source.type === "local") {
          // Локальный файл: читается в браузере, никуда не отправляется.
          data = await source.file.arrayBuffer();
        } else {
          // Внешние ресурсы в iframe не встраиваем — только официальный переход.
          setStatus("error");
          setError("Внешний ресурс открывается по официальной ссылке — встраивание ограничено политикой источника.");
          return;
        }
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
        const outlineRaw = await doc.getOutline().catch(() => []);
        if (!cancelled) {
          setOutline(
            (outlineRaw ?? []).map((item) => ({
              title: String(item.title || "Раздел"),
              dest: typeof item.dest === "string" ? item.dest : null,
            })),
          );
          const saved = loadJson<number>(positionKey, 1);
          setPage(Math.min(Math.max(1, saved), doc.numPages));
          setBookmarks(loadJson<Bookmark[]>(marksKey, []));
          setNotes(loadJson<Note[]>(`${marksKey}:notes`, []));
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setError(err instanceof Error ? err.message : "Не удалось открыть PDF.");
        }
      }
    })();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      docRef.current?.destroy().catch(() => {});
      docRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- source идентифицируется через sourceId
  }, [sourceId]);

  // Отрисовка текущей страницы.
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || status !== "ready") return;
    let cancelled = false;
    (async () => {
      const pdfPage = await doc.getPage(page);
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale });
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      renderTaskRef.current?.cancel();
      const task = pdfPage.render({ canvasContext: canvas.getContext("2d")!, viewport });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch {
        /* отмена перерисовки — норма при быстрой навигации */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, scale, status]);

  // Позиция чтения.
  useEffect(() => {
    if (status === "ready") saveJson(positionKey, page);
  }, [page, positionKey, status]);

  const goToPage = useCallback((next: number) => {
    setPage(Math.min(Math.max(1, Math.round(next)), numPages || 1));
  }, [numPages]);

  async function jumpToOutline(dest: string | null) {
    const doc = docRef.current;
    if (!doc || !dest) return;
    try {
      const resolved = await doc.getDestination(dest);
      if (resolved) {
        const ref = await doc.getPageIndex(resolved[0] as never);
        goToPage(ref + 1);
        setShowOutline(false);
      }
    } catch {
      /* некорректный outline в файле — просто игнорируем */
    }
  }

  async function runSearch() {
    const doc = docRef.current;
    const q = query.trim().toLowerCase();
    if (!doc || q.length < 2) {
      setSearchNote("Введите минимум 2 символа.");
      return;
    }
    setSearchNote("Поиск…");
    const from = Math.max(1, page - 1);
    for (let offset = 0; offset < doc.numPages; offset += 1) {
      const candidate = ((from - 1 + offset) % doc.numPages) + 1;
      const pdfPage = await doc.getPage(candidate);
      const content = await pdfPage.getTextContent();
      const pageText = content.items.map((item) => ("str" in item ? item.str : "")).join(" ").toLowerCase();
      if (pageText.includes(q)) {
        goToPage(candidate);
        setSearchNote(`Найдено на странице ${candidate}.`);
        return;
      }
    }
    setSearchNote("Совпадений нет.");
  }

  function addBookmark() {
    const next = [...bookmarks.filter((b) => b.page !== page), { page, label: `Стр. ${page}` }].sort((a, b) => a.page - b.page);
    setBookmarks(next);
    saveJson(marksKey, next);
  }

  function removeBookmark(pageNo: number) {
    const next = bookmarks.filter((b) => b.page !== pageNo);
    setBookmarks(next);
    saveJson(marksKey, next);
  }

  function addNote() {
    const text = noteDraft.trim();
    if (!text) return;
    const next = [...notes.filter((n) => n.page !== page), { page, text }].sort((a, b) => a.page - b.page);
    setNotes(next);
    saveJson(`${marksKey}:notes`, next);
    setNoteDraft("");
  }

  function removeNote(pageNo: number) {
    const next = notes.filter((n) => n.page !== pageNo);
    setNotes(next);
    saveJson(`${marksKey}:notes`, next);
  }

  const zoomOut = () => setScale((s) => Math.max(0.5, Math.round((s - 0.25) * 100) / 100));
  const zoomIn = () => setScale((s) => Math.min(3, Math.round((s + 0.25) * 100) / 100));
  const toggleFullscreen = () => {
    const host = containerRef.current;
    if (!host) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void host.requestFullscreen().catch(() => {});
  };

  const title = source.title || "Документ";

  return (
    <div className="space-y-3" ref={containerRef} data-reader>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2">
        <button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] disabled:opacity-40" aria-label="Предыдущая страница">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <label className="inline-flex items-center gap-1 text-xs font-semibold">
          стр.
          <input
            type="number"
            min={1}
            max={numPages || 1}
            value={page}
            onChange={(e) => goToPage(Number(e.target.value))}
            className="w-16 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1 text-center"
            aria-label="Номер страницы"
          />
          из {numPages || "…"}
        </label>
        <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= numPages} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] disabled:opacity-40" aria-label="Следующая страница">
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="inline-flex items-center">
          <button type="button" onClick={zoomOut} className="inline-flex h-9 w-9 items-center justify-center rounded-l-lg border border-[var(--border)]" aria-label="Уменьшить"><Minus className="h-4 w-4" /></button>
          <span className="border-y border-[var(--border)] px-2 py-1.5 text-xs font-semibold tabular-nums">{Math.round(scale * 100)}%</span>
          <button type="button" onClick={zoomIn} className="inline-flex h-9 w-9 items-center justify-center rounded-r-lg border border-[var(--border)]" aria-label="Увеличить"><Plus className="h-4 w-4" /></button>
        </div>
        <button type="button" onClick={addBookmark} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--border)] px-2 text-xs font-semibold" title="Закладка на текущей странице">
          <BookmarkPlus className="h-4 w-4" />
        </button>
        {outline.length ? (
          <button type="button" onClick={() => setShowOutline((v) => !v)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--border)] px-2 text-xs font-semibold" aria-pressed={showOutline}>
            <Expand className="h-4 w-4" /> Оглавление
          </button>
        ) : null}
        <button type="button" onClick={toggleFullscreen} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)]" aria-label="Во весь экран">
          <Maximize2 className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setNight((v) => !v)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)]" aria-label="Ночной режим" aria-pressed={night}>
          {night ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <div className="ml-auto flex flex-1 items-center gap-1 min-w-[220px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }}
            placeholder="Поиск по тексту…"
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm"
            aria-label="Поиск по тексту документа"
          />
          <button type="button" onClick={() => void runSearch()} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)]" aria-label="Найти">
            <Search className="h-4 w-4" />
          </button>
        </div>
      </div>

      {searchNote ? <p className="text-xs text-[var(--muted)]" role="status">{searchNote}</p> : null}

      {showOutline && outline.length ? (
        <ul className="max-h-48 overflow-auto rounded-xl border border-[var(--border)] p-2 text-sm">
          {outline.map((item, i) => (
            <li key={i}>
              <button type="button" onClick={() => void jumpToOutline(item.dest)} className="w-full rounded px-2 py-1 text-left hover:bg-[var(--primary-soft)]">
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
        {status === "loading" ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--muted)]">
            <Loader2 className="h-5 w-5 animate-spin" /> Загрузка документа…
          </div>
        ) : status === "error" ? (
          <div className="py-10 text-center text-sm">
            <p className="font-semibold text-[var(--status-critical-fg)]">{error}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Для материалов MEDBIOHIM вернитесь в <Link href="/materials" className="text-[var(--primary)] underline">библиотеку материалов</Link> и проверьте файл.
            </p>
          </div>
        ) : (
          <div className="flex justify-center overflow-auto">
            <canvas
              ref={canvasRef}
              className="max-w-full"
              style={night ? { filter: "invert(0.92) hue-rotate(180deg)" } : undefined}
              aria-label={`Страница ${page} документа «${title}»`}
            />
          </div>
        )}
      </div>

      {(bookmarks.length || notes.length || status === "ready") ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="text-sm font-semibold">Закладки</div>
            {bookmarks.length ? (
              <ul className="mt-2 space-y-1">
                {bookmarks.map((b) => (
                  <li key={b.page} className="flex items-center gap-2 text-sm">
                    <button type="button" onClick={() => goToPage(b.page)} className="flex-1 rounded-lg px-2 py-1 text-left hover:bg-[var(--primary-soft)]">
                      {b.label}
                    </button>
                    <button type="button" onClick={() => removeBookmark(b.page)} className="rounded-lg border border-[var(--border)] p-1 text-[var(--status-critical-fg)]" aria-label={`Удалить закладку ${b.page}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-[var(--muted)]">Закладок нет — добавьте кнопку со скрепкой над документом.</p>
            )}
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="text-sm font-semibold">Заметки · страница {page}</div>
            <div className="mt-2 flex gap-1">
              <input
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addNote(); }}
                placeholder="Заметка к текущей странице…"
                className="w-full rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm"
                aria-label="Текст заметки"
              />
              <button type="button" onClick={addNote} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)]" aria-label="Сохранить заметку">
                <PenLine className="h-4 w-4" />
              </button>
            </div>
            {notes.length ? (
              <ul className="mt-2 space-y-1">
                {notes.map((n) => (
                  <li key={n.page} className="flex items-start gap-2 text-sm">
                    <span className="shrink-0 rounded bg-[var(--primary-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--primary)]">{n.page}</span>
                    <span className="min-w-0 flex-1 break-words">{n.text}</span>
                    <button type="button" onClick={() => removeNote(n.page)} className="rounded p-1 text-[var(--status-critical-fg)]" aria-label={`Удалить заметку к странице ${n.page}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-[var(--muted)]">Заметок пока нет. Они хранятся локально и привязаны к пользователю.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
