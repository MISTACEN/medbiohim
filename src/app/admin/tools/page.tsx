"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bot,
  Activity,
  BookOpen,
  CalendarDays,
  GraduationCap,
  HardDrive,
  FileSpreadsheet,
  LayoutDashboard,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Ticket,
  Users,
  UploadCloud,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AdminMissingTools } from "@/components/admin/AdminMissingTools";
import { adminOverview, adminPresence, adminValidateContent, health, hasToken } from "@/lib/api";

/** Единый Центр управления CMS. */
export default function AdminToolsPage() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [backendHealth, setBackendHealth] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"overview" | "learning" | "system">("overview");
  const [validation, setValidation] = useState<any>(null);
  const [validating, setValidating] = useState(false);
  const [presence, setPresence] = useState<any[]>([]);

  async function load() {
    setRefreshing(true);
    setError("");
    const [o, h, p] = await Promise.all([adminOverview(), health(), adminPresence(180)]);
    if (o.ok) setCounts(o.data.counts || {});
    else setError(o.error.message);
    if (h.ok) setBackendHealth(h.data);
    if (p.ok) setPresence(p.data.items || []);
    setRefreshing(false);
  }


  async function validateContent() {
    setValidating(true);
    const r = await adminValidateContent();
    setValidating(false);
    if (r.ok) setValidation(r.data); else setError(r.error.message);
  }

  useEffect(() => {
    if (hasToken()) void load();
  }, []);

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">CMS Медбиохим</h1>
        <p className="page-subtitle">Сначала войдите</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  const nav: Array<["overview" | "learning" | "system", string, typeof LayoutDashboard]> = [
    ["overview", "Обзор", LayoutDashboard],
    ["learning", "ДЗ и сообщество", ShieldCheck],
    ["system", "Система", Settings2],
  ];

  return (
    <main className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Единая CMS</p>
          <h1 className="mt-1 page-title">Центр управления Медбиохим</h1>
          <p className="page-subtitle">
            Один вход для админки. Спец. редакторы — в боковом меню.
            {user?.name ? ` · ${user.name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => void load()}>

          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Обновить
        </button><button type="button" className="btn-secondary" disabled={validating} onClick={() => void validateContent()}>{validating ? "Проверяю…" : "Проверить контент"}</button></div>
      </header>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {validation && <div className={"rounded-xl border px-4 py-3 text-sm " + (validation.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900")}><div className="font-semibold">{validation.ok ? "Целостность контента в норме" : "Найдены проблемы: " + validation.count}</div><div className="mt-1 text-xs opacity-80">Проверено: тесты {validation.checked?.tests ?? "—"}, вопросы {validation.checked?.questions ?? "—"}, связи {validation.checked?.test_questions ?? "—"}, карточки {validation.checked?.trainer_cards ?? "—"}, материалы {validation.checked?.materials ?? "—"}, exam_questions {validation.checked?.exam_questions ?? "—"}.</div>{!validation.ok&&<pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(validation.issues || [],null,2)}</pre>}</div>}

      <div className="grid gap-5 lg:grid-cols-[230px_1fr]">
        <aside className="card h-fit space-y-1 p-2 lg:sticky lg:top-4">
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Control Center</div>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${
                tab === id ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
          <div className="mt-3 border-t border-slate-100 pt-2">
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Спец. редакторы</div>
            <Link href="/admin/schedule" className="mt-1 flex w-full items-center gap-3 rounded-xl bg-indigo-50 px-3 py-2.5 text-sm font-semibold text-indigo-700">
              <CalendarDays className="h-4 w-4" /> Сетка расписания
            </Link>
            <Link href="/admin/tests" className="mt-1 flex w-full items-center gap-3 rounded-xl bg-indigo-50 px-3 py-2.5 text-sm font-semibold text-indigo-700"><FileSpreadsheet className="h-4 w-4" /> Управление тестами</Link>
            <Link href="/admin/content-import" className="mt-1 flex w-full items-center gap-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700"><FileSpreadsheet className="h-4 w-4" /> Импорт тестов</Link>
            <Link href="/admin/content-package" className="mt-1 flex w-full items-center gap-3 rounded-xl bg-violet-50 px-3 py-2.5 text-sm font-semibold text-violet-700"><UploadCloud className="h-4 w-4" /> Импорт контента</Link>
            <Link href="/admin/telegram" className="mt-1 flex w-full items-center gap-3 rounded-xl bg-sky-50 px-3 py-2.5 text-sm font-semibold text-sky-700"><Bot className="h-4 w-4" /> Telegram → ДЗ</Link>
            <Link href="/admin/database" className="mt-1 flex w-full items-center gap-3 rounded-xl bg-indigo-50 px-3 py-2.5 text-sm font-semibold text-indigo-700"><HardDrive className="h-4 w-4" /> База / Excel</Link><Link href="/admin/database?table=materials" className="mt-1 flex w-full items-center gap-3 rounded-xl bg-indigo-50 px-3 py-2.5 text-sm font-semibold text-indigo-700"><HardDrive className="h-4 w-4" /> Редактор материалов</Link><Link href="/admin/database?table=trainer_feed_cards" className="mt-1 flex w-full items-center gap-3 rounded-xl bg-violet-50 px-3 py-2.5 text-sm font-semibold text-violet-700"><HardDrive className="h-4 w-4" /> Карточки тренажёра</Link>
            <Link href="/admin/questions" className="mt-1 flex w-full items-center gap-3 rounded-xl bg-indigo-50 px-3 py-2.5 text-sm font-semibold text-indigo-700">
              <Ticket className="h-4 w-4" /> Вопросы / билеты
            </Link>
            <Link href="/admin/lectures" className="mt-1 flex w-full items-center gap-3 rounded-xl bg-indigo-50 px-3 py-2.5 text-sm font-semibold text-indigo-700">
              <BookOpen className="h-4 w-4" /> AI-лекции
            </Link>
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          {tab === "overview" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Object.entries(counts).map(([k, v]) => (
                  <div className="card" key={k}>
                    <div className="text-xs uppercase text-slate-400">{k}</div>
                    <div className="text-2xl font-bold text-indigo-600">{v}</div>
                  </div>
                ))}
                {Object.keys(counts).length === 0 && (
                  <div className="card text-sm text-slate-500">Нет данных overview</div>
                )}
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="card lg:col-span-2">
                  <h2 className="text-lg font-bold">Что открывается из CMS</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Feature icon={Users} title="Пользователи" text="Роли и учебный контекст через API." />
                    <Feature icon={GraduationCap} title="Академия" text="Группы и предметы в overview." />
                    <Feature icon={CalendarDays} title="Расписание" text="Сетка /admin/schedule · Убрать дубли." />
                    <Feature icon={Ticket} title="Билеты" text="/admin/questions · Supabase." />
                    <Feature icon={BookOpen} title="AI-лекции" text="/admin/lectures · KaTeX, RuTube/VK." />
                    <Feature icon={HardDrive} title="ДЗ / файлы" text="Вкладка «ДЗ и сообщество»." />
                  </div>
                </div>
                <div className="card">
                  <div className="flex items-center gap-2 font-bold"><Activity className="h-5 w-5" /> Система</div>
                  <p className="mt-3 text-sm text-slate-500">Секреты backend не отдаются в браузер.</p>
                  <div className="mt-4 space-y-2 text-sm">
                    <Row ok={Object.keys(counts).length > 0} label="API / overview" />
                    <Row ok={Boolean(backendHealth)} label="Health" />
                    <Row ok={Boolean(user)} label="Авторизация" />
                  </div>
                </div>
              </div>
            </>
          )}
          {tab === "learning" && <AdminMissingTools onMessage={(m, err) => setError(err ? m : "")} />}
          {tab === "system" && (
            <div className="card space-y-4">
              <h2 className="text-lg font-bold">Состояние backend</h2>
              <pre className="overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                {JSON.stringify(backendHealth || { status: "нет ответа" }, null, 2)}
              </pre>
              <button type="button" className="btn-secondary" onClick={() => void load()}>Проверить снова</button>
              <div className="rounded-2xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">Сейчас онлайн</div>
                    <div className="text-xs text-slate-500">heartbeat за последние 3 минуты</div>
                  </div>
                  <div className="text-2xl font-bold text-emerald-600">{presence.length}</div>
                </div>
                {presence.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {presence.slice(0, 12).map((x:any) => (
                      <div key={String(x.user_id || x.id)} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                        <span className="truncate">{String(x.name || x.email || x.user_id)}</span>
                        <span className="ml-3 text-xs text-slate-500">{String(x.role || "")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Feature({ icon: Icon, title, text }: { icon: typeof Users; title: string; text: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-indigo-600" />{title}</div>
      <p className="mt-1 text-xs text-slate-500">{text}</p>
    </div>
  );
}

function Row({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border px-3 py-2">
      <span>{label}</span>
      <span className={ok ? "text-emerald-600" : "text-rose-600"}>{ok ? "OK" : "—"}</span>
    </div>
  );
}
