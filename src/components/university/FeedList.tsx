"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ArrowUpRight, BookOpen, CheckCircle2, FileText, Loader2, RefreshCw, Save } from "lucide-react";
import type { Feed, FeedItem, FeedKind } from "./types";
import { FESMU_SOURCE, formatDateTime, formatFeedDate, importKindForFeed } from "./format";
import { useImports } from "./ImportsProvider";
import SaveButton from "./SaveButton";

type Props = {
  feeds?: Partial<Record<FeedKind, Feed>>;
  loading?: boolean;
  retrying?: boolean;
  onRetry: () => void;
};

const TABS: { id: FeedKind; label: string; fallbackSource: string }[] = [
  { id: "news", label: "Новости", fallbackSource: "https://www.fesmu.ru/press-center/news/" },
  { id: "announcements", label: "Объявления", fallbackSource: "https://www.fesmu.ru/press-center/announce/" },
  { id: "events", label: "Анонсы", fallbackSource: "https://www.fesmu.ru/press-center/events/" },
];

function payloadFor(item: FeedItem, feedKind: FeedKind) {
  return [
    {
      title: item.title,
      url: item.url,
      kind: importKindForFeed(item, feedKind),
      source: FESMU_SOURCE,
      published_at: item.date_iso || null,
    },
  ];
}

function BulkSave({ items, feedKind, label }: { items: FeedItem[]; feedKind: FeedKind; label: string }) {
  const { enabled, ready, save, isSaving } = useImports();
  if (!ready || !enabled || items.length === 0) return null;
  const batch = items.slice(0, 50);
  const busy = batch.some((item) => isSaving(item.url));
  return (
    <button
      type="button"
      onClick={() =>
        void save(
          batch.map((item) => ({
            title: item.title,
            url: item.url,
            kind: importKindForFeed(item, feedKind),
            source: FESMU_SOURCE,
            published_at: item.date_iso || null,
          })),
        )
      }
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {label}
    </button>
  );
}

/** Публичные ленты ДВГМУ: реальные даты, раздел, первоисточник и «Сохранить». */
export default function FeedList({ feeds, loading, retrying, onRetry }: Props) {
  const [active, setActive] = useState<FeedKind>("news");
  const current = feeds?.[active];
  const tab = TABS.find((entry) => entry.id === active) || TABS[0];
  const sourceUrl = current?.source || tab.fallbackSource;
  const items = useMemo(() => (Array.isArray(current?.items) ? current.items : []), [current]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <BookOpen className="h-5 w-5 text-indigo-600" /> Публичные новости и объявления
          </h2>
          <p className="mt-1 text-xs text-slate-500">Заголовки и даты с официального сайта. Полный текст — по ссылке на ФЕСМУ.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BulkSave items={items} feedKind={active} label="Сохранить все" />
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setActive(entry.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active === entry.id ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаем публичные данные...
        </div>
      ) : current?.error ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-4 py-3 text-sm text-[var(--status-warn-fg)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{current.error}. Данные могли измениться — откройте раздел на сайте ДВГМУ.</span>
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="font-semibold underline">
            Открыть первоисточник
          </a>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-[var(--status-warn-fg)] disabled:opacity-50"
          >
            {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Повторить
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
          Публичных материалов сейчас нет.{" "}
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600">
            Проверить на сайте
          </a>
        </div>
      ) : (
        <div className="mt-4 divide-y divide-slate-100">
          {items.map((item) => (
            <div key={item.url} className="flex items-start gap-3 py-3">
              <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <FileText className="h-3.5 w-3.5" />
              </span>
              <a href={item.url} target="_blank" rel="noreferrer" className="group min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-800 group-hover:text-indigo-700">{item.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                  <span>{formatFeedDate(item)}</span>
                  <span>·</span>
                  <span>{current?.label || tab.label}</span>
                  {item.section && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">{item.section}</span>}
                </span>
              </a>
              <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
              <SaveButton payload={payloadFor(item, active)} />
            </div>
          ))}
        </div>
      )}

      {current && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--status-ok-fg)]" />
          <span>Источник: {current.label || tab.label} ФЕСМУ</span>
          <span>·</span>
          <span>получено {formatDateTime(current.fetched_at)}</span>
          {current.cached && <span className="rounded-full bg-slate-100 px-2 py-0.5">кэш 30 мин</span>}
          {current.stale && <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-[var(--status-warn-fg)]">устаревшие данные</span>}
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 font-semibold text-slate-500 hover:text-indigo-600">
            Первоисточник <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      )}
      {items.length > 50 && <p className="mt-2 text-[11px] text-slate-400">Пакетно сохраняются первые 50 материалов — остальные по одному.</p>}
    </section>
  );
}
