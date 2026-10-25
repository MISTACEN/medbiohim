import Link from "next/link";
import { ArrowLeft, Chrome, Download, LockKeyhole, MousePointerClick, ShieldCheck, Sparkles } from "lucide-react";

const STEPS = [
  {
    title: "Скачайте архив",
    text: "Кнопка ниже отдаёт собранное расширение (Manifest V3, ~13 КБ). Никаких сторонних магазинов и трекеров.",
  },
  {
    title: "Распакуйте папку",
    text: "Разархивируйте medbiohim-importer.zip в постоянную папку — из неё Chrome будет загружать расширение.",
  },
  {
    title: "Загрузите в браузер",
    text: "Откройте chrome://extensions, включите «Режим разработчика», нажмите «Загрузить распакованное» и выберите папку.",
  },
  {
    title: "Подключите аккаунт",
    text: "В настройках расширения укажите адрес API и access token из MEDBIOHIM. Токен хранится только в браузере.",
  },
];

const SOURCES = [
  { name: "Сайт ДВГМУ", detail: "новости, объявления, расписание и документы", tone: "sky" },
  { name: "ЕИОС ДВГМУ", detail: "объявления, события календаря, документы", tone: "indigo" },
  { name: "NeoFamily Lab", detail: "тренажёры и интерактивные темы", tone: "violet" },
  { name: "Школа Сеченова", detail: "уроки, клинические разделы, материалы", tone: "emerald" },
];

export default function ExtensionPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      <Link href="/university" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> В раздел «Вуз и ЕИОС»
      </Link>

      <header className="relative overflow-hidden rounded-[26px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.45)] sm:p-9">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-gradient-to-br from-indigo-100 via-violet-50 to-transparent" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-600">
            <Chrome className="h-3.5 w-3.5" /> Расширение браузера
          </div>
          <h1 className="mt-4 font-serif text-3xl font-semibold tracking-tight sm:text-[2.5rem]">Импорт материалов без копипаста</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
            Расширение читает открытую страницу, показывает найденные объявления, события и материалы, и сохраняет только те, что вы отметили. Одна кнопка — и ссылка со описанием уже в личной библиотеке MEDBIOHIM.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href="/downloads/medbiohim-importer.zip"
              download
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              <Download className="h-4 w-4" /> Скачать расширение
            </a>
            <Link
              href="/university/import"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-indigo-300"
            >
              <Sparkles className="h-4 w-4" /> Импорт вручную без расширения
            </Link>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">Версия 1.2.0 · Chrome, Edge, Яндекс.Браузер, Opera (Chromium)</p>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((step, index) => (
          <div key={step.title} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-900 font-mono text-xs font-bold text-white">
                {index + 1}
              </span>
              <h2 className="text-sm font-bold">{step.title}</h2>
            </div>
            <p className="mt-2 text-[13px] leading-6 text-slate-500">{step.text}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="font-serif text-xl font-semibold">Где работает</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SOURCES.map((source) => (
            <div key={source.name} className="rounded-xl border border-[var(--border)] bg-[var(--background)]/50 p-4">
              <div className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                source.tone === "sky" ? "bg-sky-50 text-sky-600" : source.tone === "indigo" ? "bg-indigo-50 text-indigo-600" : source.tone === "violet" ? "bg-violet-50 text-violet-600" : "bg-emerald-50 text-emerald-600"
              }`}>
                {source.name}
              </div>
              <p className="mt-2 text-[12px] leading-5 text-slate-500">{source.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
          <h2 className="inline-flex items-center gap-2 text-sm font-bold text-emerald-900">
            <ShieldCheck className="h-4 w-4" /> Что расширение не делает
          </h2>
          <ul className="mt-2 space-y-1.5 text-[13px] leading-6 text-emerald-900/80">
            <li>· не обходит оплату и авторизацию платных платформ;</li>
            <li>· не копирует закрытые материалы и не парсит сайты в фоне;</li>
            <li>· не отправляет данные без вашего нажатия «Импортировать».</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="inline-flex items-center gap-2 text-sm font-bold">
            <LockKeyhole className="h-4 w-4 text-indigo-500" /> Доступ и токен
          </h2>
          <p className="mt-2 text-[13px] leading-6 text-slate-500">
            Токен хранится в <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">chrome.storage.sync</code> и уходит только на адрес API MEDBIOHIM, который вы указали сами. Отозвать доступ можно, выйдя из аккаунта и очистив токен в настройках расширения.
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
            <MousePointerClick className="h-3.5 w-3.5" /> Импорт подтверждается вручную для каждого пакета
          </p>
        </div>
      </section>
    </div>
  );
}
