"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Flame } from "lucide-react";
import { platformsForSubject } from "@/data/external-platforms";
import { externalPlatformStats, trackExternalPlatformClick } from "@/lib/api";

function track(platform: string, title: string, href: string, subjectSlug?: string | null) {
  // Счётчик некритичен: любой сбой просто игнорируем, переход всё равно открывается.
  trackExternalPlatformClick({ platform, title, href, subject_slug: subjectSlug || null }).catch(() => {});
}

/** Контекстные ссылки на внешние платформы внутри вкладки «Портал» страницы
 *  предмета: показываем только категории, размеченные под этот предмет. */
export default function ExternalPlatformLinks({ subjectSlug }: { subjectSlug?: string | null }) {
  const platforms = useMemo(() => platformsForSubject(subjectSlug), [subjectSlug]);

  if (platforms.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-slate-400">Внешние тренажёры и материалы</h2>
      {platforms.map(({ platform }) => (
        <article key={platform.slug} className="card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-bold text-slate-800">{platform.title}</h3>
            <a
              href={platform.href}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => track(platform.slug, "Главная", platform.href, subjectSlug)}
              className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-500"
            >
              {platform.tagline} <ExternalLink className="size-3" />
            </a>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {platform.categories.map((category) => (
              <div key={category.title} className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{category.title}</div>
                <p className="mt-1 text-xs text-slate-500">{category.description}</p>
                <ul className="mt-2 grid gap-1.5">
                  {category.links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        onClick={() => track(platform.slug, link.title, link.href, subjectSlug)}
                        className="inline-flex items-start gap-1 text-sm font-semibold text-indigo-700 hover:text-indigo-500"
                      >
                        <ExternalLink className="mt-0.5 size-3.5 shrink-0" />
                        <span>
                          {link.title}
                          {link.note ? <span className="ml-1 text-xs font-normal text-slate-400">· {link.note}</span> : null}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

/** Популярные переходы — блок на /university под картой платформ. */
export function ExternalPlatformStats() {
  const [data, setData] = useState<{ total: number; items: { platform: string; title: string; href: string; clicks: number }[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    externalPlatformStats()
      .then((res: any) => {
        if (cancelled) return;
        if (res?.ok) setData(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data || data.total === 0) return null;

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Flame className="size-5 text-[var(--status-warn-fg)]" /> Популярные переходы
      </h2>
      <p className="mt-1 text-sm text-slate-500">Считаем только факт перехода по публичной ссылке — без профилей и истории.</p>
      <ol className="mt-3 grid gap-2">
        {data.items.slice(0, 5).map((item) => (
          <li key={`${item.platform}:${item.href}`}>
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => track(item.platform, item.title, item.href)}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2 text-sm hover:border-indigo-200 hover:bg-indigo-50/40"
            >
              <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{item.title}</span>
              <span className="shrink-0 rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-xs font-bold text-[var(--status-warn-fg)]">
                {item.clicks} переход{item.clicks === 1 ? "" : item.clicks < 5 ? "а" : "ов"}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
