"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, Chrome, ExternalLink, FlaskConical, Stethoscope } from "lucide-react";
import { EXTERNAL_PLATFORMS } from "@/data/external-platforms";

const ICONS = { neofamily: FlaskConical, sechenov: Stethoscope } as const;

export default function ExternalPlatforms() {
  const [open, setOpen] = useState<string | null>("neofamily");

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-tight">Внешние платформы: разбор функций</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Обе платформы открыты как публичные каталоги: мы разобрали структуру, отметили сильные механики и связали их с нашими разделами. Материалы не копируются.
          </p>
        </div>
        <Link
          href="/extension"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-xs font-semibold text-indigo-700 transition hover:border-indigo-300"
        >
          <Chrome className="h-4 w-4" /> Импорт через расширение
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {EXTERNAL_PLATFORMS.map((platform) => {
          const Icon = ICONS[platform.slug as keyof typeof ICONS] || ExternalLink;
          const expanded = open === platform.slug;
          const accent = platform.accent === "emerald" ? "emerald" : "violet";
          return (
            <article key={platform.slug} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${
                      accent === "emerald" ? "bg-emerald-50 text-emerald-700" : "bg-violet-50 text-violet-700"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="rounded-full border border-[var(--border)] bg-[var(--background)] px-2.5 py-1 text-[10px] font-semibold text-slate-500">
                    Внешняя платформа
                  </span>
                </div>
                <h3 className="mt-3 font-serif text-xl font-semibold text-[var(--text)]">{platform.title}</h3>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{platform.tagline}</p>
                <p className="mt-2 text-[13px] leading-6 text-slate-500">{platform.description}</p>

                <dl className="mt-4 grid grid-cols-3 gap-2">
                  {platform.stats.map((stat) => (
                    <div key={stat.label} className="rounded-xl bg-[var(--background)]/70 px-2.5 py-2">
                      <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{stat.label}</dt>
                      <dd className="mt-0.5 font-mono text-sm font-semibold text-[var(--text)]">{stat.value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-4 flex items-center gap-2">
                  <a
                    href={platform.href}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white ${
                      accent === "emerald" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-violet-600 hover:bg-violet-700"
                    }`}
                  >
                    Открыть платформу <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : platform.slug)}
                    aria-expanded={expanded}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300"
                  >
                    Карта функций <ChevronDown className={`h-3.5 w-3.5 transition ${expanded ? "rotate-180" : ""}`} />
                  </button>
                </div>
                <p className="mt-3 text-[10px] leading-4 text-slate-400">{platform.note}</p>
              </div>

              {expanded && (
                <div className="space-y-4 border-t border-[var(--border)] bg-[var(--background)]/40 p-5">
                  {platform.categories.map((category) => (
                    <div key={category.title}>
                      <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{category.title}</h4>
                      <p className="mt-0.5 text-[11px] leading-5 text-slate-400">{category.description}</p>
                      <ul className="mt-2 space-y-1">
                        {category.links.map((link) => (
                          <li key={link.href + link.title}>
                            <a
                              href={link.href}
                              target="_blank"
                              rel="noreferrer"
                              className="group flex items-start gap-1.5 text-[12px] leading-5 text-slate-600 hover:text-indigo-700"
                            >
                              <ExternalLink className="mt-1 h-3 w-3 shrink-0 text-slate-300 group-hover:text-indigo-400" />
                              <span>
                                {link.title}
                                {link.note && <span className="ml-1 text-[10px] text-slate-400">· {link.note}</span>}
                              </span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                  <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-3">
                    <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Что берём в MEDBIOHIM</h4>
                    <ul className="mt-2 space-y-1.5">
                      {platform.adopt.map((idea) => (
                        <li key={idea.feature} className="flex flex-wrap items-baseline gap-1.5 text-[12px] leading-5 text-slate-600">
                          <span className="h-1 w-1 rounded-full bg-slate-300" />
                          <span>{idea.feature}</span>
                          {idea.oursHref && (
                            <Link href={idea.oursHref} className="text-[11px] font-semibold text-indigo-600 hover:underline">
                              → {idea.oursLabel || "открыть"}
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
