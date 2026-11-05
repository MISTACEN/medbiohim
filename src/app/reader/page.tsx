"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpen, ExternalLink } from "lucide-react";
import { PdfReader, type ReaderSource } from "@/components/reader/PdfReader";

/**
 * Читалка учебных PDF (§13). Источники:
 *  - ?material=<id> — PDF из материалов MEDBIOHIM (same-origin файл-маршрут);
 *  - локальный файл — выбирается на странице и не загружается на сервер;
 *  - ресурсы университета — библиографические карточки и официальные ссылки.
 */

/** Официальные ресурсы университета — без обхода авторизации, только ссылки. */
const UNIVERSITY_RESOURCES = [
  { title: "Электронная библиотека ФЕсМУ", url: "http://elib.fesmu.ru/", note: "Каталог и полнотексты изданий университета; вход по библиотечным учётным данным." },
  { title: "Образовательный портал ФЕсМУ", url: "https://www.fesmu.ru/teachers/obrazovatelnyy-portal/", note: "Курсы и материалы кафедр; доступ по учётной записи вуза." },
  { title: "Сайт ФЕсМУ", url: "https://www.fesmu.ru/", note: "Новости, объявления, структура вуза." },
  { title: "ОЗИЗ ДВГМУ", url: "https://ozizdvgmu.ru/", note: "Здоровьесберегающие ресурсы университета." },
];

type CatalogEntry = { title: string; author: string; year: string; url: string };

const CATALOG_KEY = "mbh:reader:catalog";

function ReaderInner() {
  const search = useSearchParams();
  const materialId = search.get("material") || "";
  const [source, setSource] = useState<ReaderSource | null>(materialId ? { type: "material", id: materialId, title: "Материал MEDBIOHIM" } : null);
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [form, setForm] = useState<CatalogEntry>({ title: "", author: "", year: "", url: "" });
  const [catalogQuery, setCatalogQuery] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CATALOG_KEY);
      const list = raw ? JSON.parse(raw) : [];
      setEntries(Array.isArray(list) ? list : []);
    } catch {
      setEntries([]);
    }
    return undefined;
  }, []);

  function pickLocalFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSource({ type: "local", title: file.name, file });
    event.target.value = "";
  }

  function addEntry() {
    if (!form.title.trim()) return;
    const next = [...entries, { ...form, year: form.year.trim() }].sort((a, b) => a.title.localeCompare(b.title, "ru"));
    setEntries(next);
    try { localStorage.setItem(CATALOG_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setForm({ title: "", author: "", year: "", url: "" });
  }

  const filtered = entries.filter((e) => {
    const q = catalogQuery.trim().toLowerCase();
    if (!q) return true;
    return `${e.title} ${e.author} ${e.year}`.toLowerCase().includes(q);
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600">
          <BookOpen className="h-4 w-4" /> Читалка
        </div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Чтение учебных материалов</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
          PDF из библиотеки MEDBIOHIM открывается в том же авторизованном маршруте, что и скачивание.
          Локальный файл читается прямо в браузере и никуда не отправляется. Ресурсы университета открываются
          по официальным ссылкам — авторизация и ограничения доступа не обходятся.
        </p>
      </header>

      {source ? (
        <section aria-label="Читалка">
          <h2 className="mb-2 text-sm font-semibold">{source.title}</h2>
          <PdfReader source={source} />
        </section>
      ) : (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4" aria-label="Выбор документа">
          <h2 className="text-sm font-semibold">Открыть документ</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm">
              <span className="block font-semibold">Локальный PDF</span>
              <span className="mt-1 block text-xs text-[var(--muted)]">Файл читается в браузере, на сервер не загружается.</span>
              <input type="file" accept="application/pdf" onChange={pickLocalFile} className="mt-2 w-full text-xs" />
            </label>
            <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm">
              <span className="block font-semibold">Из материалов MEDBIOHIM</span>
              <span className="mt-1 block text-xs text-[var(--muted)]">Укажите ID материала или откройте читалку из библиотеки.</span>
              <div className="mt-2">
                <Link href="/materials" className="inline-flex items-center rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs font-semibold hover:bg-[var(--primary-soft)]">
                  Библиотека материалов
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4" aria-label="Ресурсы университета">
        <h2 className="text-sm font-semibold">Ресурсы университета</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Официальные ссылки. Материалы, требующие авторизации, открываются в личном кабинете вуза —
          пароли и доступ не собираются и не обходятся.
        </p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {UNIVERSITY_RESOURCES.map((res) => (
            <li key={res.url} className="rounded-xl border border-[var(--border)] p-3">
              <a href={res.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[var(--primary)] hover:underline">
                {res.title} <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{res.note}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4" aria-label="Библиографическая полка">
        <h2 className="text-sm font-semibold">Моя библиографическая полка</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Личные карточки изданий (название, автор, год, ссылка) — хранятся локально. Для закрытых изданий
          достаточно карточки и официального перехода к источнику.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_70px_minmax(0,1.6fr)_auto]">
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Название" className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm" />
          <input value={form.author} onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))} placeholder="Автор" className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm" />
          <input value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} placeholder="Год" className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm" />
          <input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="Ссылка на источник" className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm" />
          <button type="button" onClick={addEntry} className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-semibold text-white">Добавить</button>
        </div>
        <input value={catalogQuery} onChange={(e) => setCatalogQuery(e.target.value)} placeholder="Поиск по полке…" className="mt-2 w-full rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm sm:w-72" />
        {filtered.length ? (
          <ul className="mt-2 space-y-1">
            {filtered.map((entry, i) => (
              <li key={i} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
                <b>{entry.title}</b>
                {entry.author ? <span className="text-[var(--muted)]"> · {entry.author}</span> : null}
                {entry.year ? <span className="text-[var(--muted)]"> · {entry.year}</span> : null}
                {entry.url ? (
                  <a href={entry.url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--primary)] hover:underline">
                    официальный переход <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-[var(--muted)]">Полка пуста — добавьте первую карточку издания.</p>
        )}
      </section>
    </div>
  );
}

export default function ReaderPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Загрузка читалки…</div>}>
      <ReaderInner />
    </Suspense>
  );
}
