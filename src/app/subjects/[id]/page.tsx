import Link from "next/link";
import { subjects } from "@/lib/mock-data";
import { ChevronLeft, FileQuestion, BookOpen, ListChecks } from "lucide-react";

export default async function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const subject = subjects.find((s) => s.id === id) || subjects[0];
  const modules = [
    { title: "Модуль 1 — Основы", items: ["Основные понятия", "Классификация", "Методы исследования", "Исторический обзор"] },
    { title: "Модуль 2 — Практика", items: ["Практические задания", "Типовые задачи", "Лабораторные", "Разбор ситуаций"] },
    { title: "Модуль 3 — Контроль", items: ["Повторение", "Контрольные вопросы", "Критерии оценки", "Подготовка к экзамену"] },
  ];

  return (
    <div className="space-y-6">
      <Link href="/subjects" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ChevronLeft className="h-4 w-4" /> К предметам
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{subject.name}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-sm text-gray-500">
          <span>Курс {subject.course}</span><span>·</span><span>Семестр {subject.semester}</span><span>·</span>
          <span className={subject.controlType === "exam" ? "text-danger" : "text-success"}>
            {subject.controlType === "exam" ? "Экзамен" : "Зачёт"}
          </span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Случайный билет", icon: FileQuestion, href: "/tests" },
          { label: "Практические вопросы", icon: ListChecks, sub: "60 задач", href: "/tests" },
          { label: "Типовые задачи", icon: BookOpen, href: "/materials" },
          { label: "Критерии оценки", icon: ListChecks, href: "/curriculum" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} href={item.href} className="card flex flex-col items-start p-4 hover:border-primary/30">
              <Icon className="mb-2 h-5 w-5 text-primary" />
              <span className="font-medium">{item.label}</span>
              {item.sub && <span className="mt-0.5 text-xs text-gray-500">{item.sub}</span>}
            </Link>
          );
        })}
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Модули</h2>
        {modules.map((mod, mi) => (
          <details key={mod.title} className="card overflow-hidden" open={mi === 0}>
            <summary className="cursor-pointer list-none px-5 py-4 font-medium hover:bg-gray-50">{mod.title}</summary>
            <ul className="border-t border-gray-100 px-5 py-3">
              {mod.items.map((item, i) => (
                <li key={item} className="flex items-center gap-3 border-b border-gray-50 py-2.5 last:border-0">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">{i + 1}</span>
                  <span className="text-sm text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
    </div>
  );
}
