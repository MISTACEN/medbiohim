"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

/** Человекочитаемые подписи сегментов пути (C9). */
const SEGMENT_LABELS: Record<string, string> = {
  subjects: "Предметы",
  schedule: "Расписание",
  tests: "Тесты",
  materials: "Материалы",
  lectures: "Лекции",
  tickets: "Билеты",
  homework: "Задания",
  assignments: "Отработки",
  progress: "Прогресс",
  community: "Сообщество",
  university: "Вуз и ЕИОС",
  settings: "Настройки",
  help: "Помощь",
  changelog: "Что нового",
  bookmarks: "Закладки",
  atlas: "Атлас",
  academic: "Учебный план",
  calculators: "Калькуляторы",
  attestations: "Аттестации",
  tutor: "AI-тьютор",
  practice: "База вопросов",
  trainers: "Тренажёры",
  curriculum: "Куррикулум",
  cards: "Карточки",
  chemistry: "Химия",
  login: "Вход",
  register: "Регистрация",
};

function segmentLabel(segment: string): string | null {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  if (/^\[.+\]$/.test(segment)) return null; // динамический сегмент — подпись даст родитель
  return decodeURIComponent(segment).replace(/-/g, " ");
}

/**
 * C9: хлебные крошки для вложенных страниц (глубина ≥ 2 сегментов).
 * Не рендерится на верхних разделах — там заголовок в TopBar достаточен.
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  if (!pathname || pathname === "/") return null;
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const crumbs = segments.map((segment, index) => {
    const href = "/" + segments.slice(0, index + 1).join("/");
    const label = segmentLabel(segment);
    return { href, label, isLast: index === segments.length - 1 };
  });

  return (
    <nav aria-label="Хлебные крошки" className="mb-3 flex flex-wrap items-center gap-1 text-xs text-slate-500">
      <Link href="/" className="inline-flex items-center gap-0.5 hover:text-indigo-600">
        <Home className="h-3.5 w-3.5" /> Главная
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.href} className="inline-flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-slate-300" aria-hidden="true" />
          {crumb.isLast ? (
            <span aria-current="page" className="font-semibold text-slate-700">
              {crumb.label || "…"}
            </span>
          ) : (
            <Link href={crumb.href} className="hover:text-indigo-600">
              {crumb.label || "…"}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
