import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { CHANGELOG } from "@/data/changelog";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Что нового",
  description:
    "Изменения платформы Медбиохим: новые разделы, тесты, расписание и инструменты для учёбы.",
  path: "/changelog",
});

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold text-slate-900">
        <Sparkles className="h-6 w-6 text-indigo-600" />
        Что нового
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Сюда попадают только уже работающие изменения — без планов и обещаний.
      </p>

      <div className="mt-6 space-y-4">
        {CHANGELOG.map((entry) => (
          <article key={entry.date} className="card p-5">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="text-lg font-bold text-slate-900">{entry.title}</h2>
              <time className="text-xs tabular-nums text-slate-400" dateTime={entry.date}>
                {entry.date.split("-").reverse().join(".")}
              </time>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
              {entry.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <p className="mt-8 text-sm text-slate-500">
        Не нашли то, что искали?{" "}
        <Link href="/help" className="font-semibold text-blue-600">
          Загляните в помощь
        </Link>{" "}
        или напишите в{" "}
        <Link href="/community" className="font-semibold text-blue-600">
          сообщество
        </Link>
        .
      </p>
    </div>
  );
}
