"use client";

/**
 * Единая навигация админ-панели. Один список — для бокового меню,
 * мобильных вкладок и плиток на дашборде /admin.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpen,
  Bot,
  CalendarDays,
  ClipboardList,
  Database,
  FileSpreadsheet,
  FileUp,
  Flag,
  GraduationCap,
  LayoutDashboard,
  Library,
  ListChecks,
  Megaphone,
  Settings2,
  Ticket,
  UploadCloud,
  Users,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  short?: string;
  icon: typeof LayoutDashboard;
  desc: string;
};
type NavSection = { title: string; items: NavItem[] };

export const ADMIN_SECTIONS: NavSection[] = [
  {
    title: "Обзор",
    items: [
      { href: "/admin", label: "Дашборд", icon: LayoutDashboard, desc: "Сводка и быстрый переход в любой раздел." },
    ],
  },
  {
    title: "Учебный процесс",
    items: [
      { href: "/admin/schedule", label: "Расписание", icon: CalendarDays, desc: "Сетка занятий по группам и семестрам." },
      { href: "/admin/academic", label: "Предметы и группы", icon: GraduationCap, desc: "Дисциплины, курсы, семестры и учебные группы." },
      { href: "/admin/tests", label: "Тесты", icon: FileSpreadsheet, short: "Тесты", desc: "Тесты, варианты и привязка к темам." },
      { href: "/admin/test-questions", label: "Вопросы тестов", icon: ListChecks, short: "Вопросы тестов", desc: "Редактирование и архивирование вопросов." },
      { href: "/tests", label: "Банк вопросов", icon: Library, short: "Банк", desc: "Публичный банк вопросов с ответами." },
      { href: "/admin/questions", label: "Экзаменационные билеты", icon: Ticket, short: "Билеты", desc: "Билеты и экзаменационные вопросы." },
      { href: "/admin/lectures", label: "AI-лекции", icon: BookOpen, short: "Лекции", desc: "Редактор лекций, формулы, медиа и публикация." },
      { href: "/admin/attestations", label: "Аттестации", icon: ClipboardList, desc: "Аттестации и коллоквиумы." },
    ],
  },
  {
    title: "Студенты и контент",
    items: [
      { href: "/admin/users", label: "Пользователи и роли", icon: Users, short: "Пользователи", desc: "Роли, группа, курс и семестр для каждого студента." },
      { href: "/admin/announcements", label: "Объявления и сайт", icon: Megaphone, short: "Объявления", desc: "Новости и тексты главной страницы." },
      { href: "/admin/tools", label: "ДЗ, файлы, диагностика", icon: Settings2, short: "ДЗ / файлы", desc: "Проверка ДЗ, материалы, сообщество, Storage, health." },
    ],
  },
  {
    title: "Импорт",
    items: [
      { href: "/admin/content-import", label: "Импорт тестов", icon: FileUp, short: "Тесты", desc: "Excel → тесты, вопросы и порядок." },
      { href: "/admin/content-package", label: "Импорт контента", icon: UploadCloud, short: "Контент", desc: "Пакет документов, материалов и препаратов." },
      { href: "/admin/telegram", label: "Telegram → ДЗ", icon: Bot, short: "Telegram", desc: "Привязка чатов групп и проверка webhook." },
    ],
  },
  {
    title: "Система",
    items: [
      { href: "/admin/database", label: "База данных / SQL", icon: Database, short: "База / SQL", desc: "Подключения, схема, строки и SQL-редактор." },
      { href: "/admin/api-logs", label: "Журнал API", icon: Activity, short: "Журнал API", desc: "Endpoint, источник, статус и задержки." },
      { href: "/admin/problems", label: "Проблемы и жалобы", icon: Flag, short: "Жалобы", desc: "Обращения студентов и очередь работ." },
    ],
  },
];

export function isAdminRoute(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/");
}

export function AdminNav() {
  const pathname = usePathname();
  const flat = ADMIN_SECTIONS.flatMap((section) => section.items);

  return (
    <>
      <aside className="card hidden h-fit space-y-1 p-2 lg:sticky lg:top-4 lg:block" aria-label="Разделы админ-панели">
        {ADMIN_SECTIONS.map((section) => (
          <div key={section.title} className="pb-1">
            <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{section.title}</div>
            {section.items.map(({ href, label, icon: Icon, desc }) => {
              const active = isAdminRoute(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  title={desc}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </aside>

      <nav className="flex gap-2 overflow-x-auto pb-1 lg:hidden" aria-label="Разделы админ-панели">
        {flat.map(({ href, label, short, icon: Icon }) => {
          const active = isAdminRoute(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold ${active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}
            >
              <Icon className="h-4 w-4" />
              {short || label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
