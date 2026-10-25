"use client";

import Link from "next/link";
import { AlertCircle, ArrowUpRight, Bookmark, CheckCircle2, Info, Loader2, LogIn, RefreshCw, Trash2 } from "lucide-react";
import { useImports } from "./ImportsProvider";
import { formatDateTime, kindLabel, sourceLabel } from "./format";

type Props = {
  /** Compact mode hides the «открыть отдельную страницу» link (used on /university/saved). */
  compact?: boolean;
};

/** «Сохранённое из порталов вуза»: список, удаление, понятные 401/503 состояния. */
export default function SavedImports({ compact = false }: Props) {
  const { enabled, ready, items, loading, authRequired, error, notice, remove, reload, isSaving } = useImports();

  const needsLogin = ready && (!enabled || authRequired);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Bookmark className="h-5 w-5 text-indigo-600" /> Сохранённое из порталов вуза
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Материалы ДВГМУ, которые вы отметили кнопкой «Сохранить». Они хранятся в вашем аккаунте MEDBIOHIM, первоисточник остаётся на сайте вуза.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {enabled && !authRequired && (
            <button
              type="button"
              onClick={() => void reload()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Обновить
            </button>
          )}
          {!compact && (
            <Link href="/university/saved" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Отдельная страница <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      {notice && (
        <div
          className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${
            notice.tone === "ok"
              ? "border border-emerald-100 bg-emerald-50 text-emerald-700"
              : notice.tone === "warn"
                ? "border border-amber-200 bg-amber-50 text-amber-800"
                : "border border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {notice.tone === "ok" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      {!ready ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Проверяем сессию MEDBIOHIM...
        </div>
      ) : needsLogin ? (
        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-5 text-sm text-indigo-800">
          <div className="flex items-center gap-2 font-semibold">
            <LogIn className="h-4 w-4" /> Нужен вход в MEDBIOHIM
          </div>
          <p className="mt-2 text-xs leading-relaxed">
            Сохранение материалов доступно только в вашем аккаунте: кнопка «Сохранить» появится после входа. Официальные ссылки,
            расписание и новости работают и без входа, а пароль ЕИОС в MEDBIOHIM не запрашивается.
          </p>
          <Link href="/login" className="btn-primary mt-3 inline-flex items-center gap-2">
            Войти <LogIn className="h-4 w-4" />
          </Link>
        </div>
      ) : error ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button type="button" onClick={() => void reload()} className="ml-auto rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-rose-700">
            Повторить
          </button>
        </div>
      ) : loading && items.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаем сохранённые материалы...
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4" /> Пока ничего не сохранено.
          </div>
          <p className="mt-1 text-xs">Нажмите «Сохранить» у новости, объявления или PDF-документа расписания.</p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id || item.key} className="flex items-start gap-3 py-3">
              <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Bookmark className="h-3.5 w-3.5" />
              </span>
              <a href={item.url} target="_blank" rel="noreferrer" className="group min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-800 group-hover:text-indigo-700">{item.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">{kindLabel(item.kind)}</span>
                  <span>{sourceLabel(item.source)}</span>
                  <span>·</span>
                  <span>сохранено {formatDateTime(item.imported_at)}</span>
                </span>
              </a>
              <button
                type="button"
                onClick={() => void remove(item.id)}
                disabled={isSaving(item.url)}
                title="Удалить из сохранённого"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 transition hover:border-rose-200 hover:text-rose-600 disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" /> Удалить
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
        Сохраняются только ссылка, заголовок и служебные поля. Полный текст материала остаётся на сайте ДВГМУ, а пароль ЕИОС не запрашивается и не хранится.
      </p>
    </section>
  );
}
