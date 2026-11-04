"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, Search } from "lucide-react";
import UserFiles from "@/components/library/UserFiles";
import { LIBRARY_FILES, searchLibrary } from "@/lib/library";
import {
  AVAILABILITY_LABELS,
  EXTERNAL_RESOURCES,
  searchExternalResources,
  type ResourceAvailability,
} from "@/lib/libraryExternal";

const availabilityClass: Record<ResourceAvailability, string> = {
  free: "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]",
  subscription: "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]",
  mixed: "bg-[var(--primary-soft)] text-[var(--primary)]",
  unknown: "bg-[var(--border)] text-[var(--muted)]",
};

export default function LibraryBrowser() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"internal" | "external" | "mine">("internal");

  const internal = useMemo(() => {
    if (!query.trim()) return LIBRARY_FILES;
    return searchLibrary(query).map((hit) => ({
      title: hit.title,
      href: hit.href,
      type: hit.hint,
      subject: hit.subject,
      subject_slug: hit.subject_slug,
    }));
  }, [query]);

  const external = useMemo(() => searchExternalResources(query), [query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {tab === "mine" ? null : (
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Название, автор, предмет или ключевое слово"
            aria-label="Поиск по библиотеке"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        )}
        <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--border)] p-1">
          {(
            [
              ["internal", "Материалы MEDBIOHIM"],
              ["external", "Внешние каталоги"],
              ["mine", "Мои файлы"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-semibold",
                tab === id ? "bg-[var(--primary)] text-white" : "hover:bg-[var(--primary-soft)]",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "mine" ? (
        <UserFiles />
      ) : tab === "internal" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Link href="/materials" className="rounded-full border border-[var(--border)] px-3 py-1.5 hover:border-[var(--primary)]">
              Все материалы
            </Link>
            <Link href="/lectures" className="rounded-full border border-[var(--border)] px-3 py-1.5 hover:border-[var(--primary)]">
              Лекции и конспекты
            </Link>
            <Link href="/atlas" className="rounded-full border border-[var(--border)] px-3 py-1.5 hover:border-[var(--primary)]">
              Атлас и микропрепараты
            </Link>
            <Link href="/workshop" className="rounded-full border border-[var(--border)] px-3 py-1.5 hover:border-[var(--primary)]">
              Мастерская: свои материалы
            </Link>
          </div>

          {internal.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--muted)]">
              По запросу «{query}» ничего не найдено. Попробуйте название предмета или слово
              «методичка».
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {internal.map((file) => (
                <li key={file.href}>
                  <a
                    href={file.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-full items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 hover:border-[var(--primary)]"
                  >
                    <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{file.title}</span>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        {file.subject} · {file.type}
                      </span>
                    </span>
                    <ExternalLink className="ml-auto h-4 w-4 shrink-0 text-[var(--muted)]" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-xs leading-5 text-[var(--muted)]">
            Внешние каталоги открываются на стороне библиотеки: MEDBIOHIM не обходит
            авторизацию и не копирует закрытые полные тексты. Для подписных баз нужен доступ
            университета.
          </p>
          {external.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--muted)]">
              По запросу «{query}» внешних источников не найдено.
            </p>
          ) : (
            <ul className="space-y-2">
              {external.map((resource) => (
                <li
                  key={resource.id}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
                      >
                        {resource.title}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">{resource.organization}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${availabilityClass[resource.availability]}`}
                    >
                      {AVAILABILITY_LABELS[resource.availability]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6">{resource.description}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{resource.accessNote}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-[var(--muted)]">
            Всего источников в справочнике: {EXTERNAL_RESOURCES.length}. Список составлен по
            официальным страницам ДВГМУ; доступность проверяется у библиотеки.
          </p>
        </div>
      )}
    </div>
  );
}
