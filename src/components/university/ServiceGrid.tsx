"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Landmark,
  Library,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { ServiceStatus } from "./types";
import { formatDateTime, toneClasses } from "./format";

type Props = {
  /** Registry from GET /api/university — `reachable: null` until probed. */
  services?: ServiceStatus[];
  fetchedAt?: string | null;
};

const ICONS: Record<string, typeof Landmark> = {
  portal: Landmark,
  lms: GraduationCap,
  schedule: CalendarDays,
  library: Library,
  testing: ClipboardCheck,
  news: BookOpen,
};

const TONES: Record<string, string> = {
  portal: "indigo",
  lms: "violet",
  schedule: "sky",
  library: "emerald",
  testing: "amber",
  news: "rose",
};

/** Static registry mirrors §0 when the overview payload is unavailable. */
const FALLBACK_SERVICES: ServiceStatus[] = [
  {
    id: "portal",
    title: "Сайт ДВГМУ",
    url: "https://www.fesmu.ru/",
    category: "portal",
    description: "Официальные новости, документы, структура вуза и приёмная кампания.",
    badge: "Официальный сайт",
    reachable: null,
  },
  {
    id: "eios",
    title: "ЕИОС",
    url: "https://eios.fesmu.ru/WebApp/#/",
    category: "lms",
    description: "Электронная информационно-образовательная среда: расписания, материалы, оценки.",
    badge: "Личный кабинет",
    reachable: null,
  },
  {
    id: "schedule",
    title: "Расписание",
    url: "https://www.fesmu.ru/ucheba/raspisanie/",
    category: "schedule",
    description: "PDF-файлы факультетов: занятия, лекции, экзамены и ликвидация задолженности.",
    badge: "Официальные PDF",
    reachable: null,
  },
  {
    id: "library",
    title: "Электронная библиотека",
    url: "https://elib.fesmu.ru/",
    category: "library",
    description: "Учебники, методички и полнотекстовые ресурсы библиотеки ДВГМУ.",
    badge: "Библиотека",
    reachable: null,
  },
  {
    id: "testing",
    title: "Тестирование ДВГМУ",
    url: "http://test.fesmu.ru:8080/",
    category: "testing",
    description: "Оригинальная система тестирования. Вход — в своей сессии, без пароля в MEDBIOHIM.",
    badge: "Оригинальные тесты",
    reachable: null,
  },
  {
    id: "news",
    title: "Новости и объявления",
    url: "https://www.fesmu.ru/press-center/news/",
    category: "news",
    description: "Публичные новости, объявления и анонсы мероприятий университета.",
    badge: "Публичный архив",
    reachable: null,
  },
];

function ReachBadge({ service }: { service: ServiceStatus }) {
  if (service.reachable === true) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> доступно
        {typeof service.latency_ms === "number" ? ` · ${service.latency_ms} мс` : ""}
      </span>
    );
  }
  if (service.reachable === false) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
        <AlertCircle className="h-3 w-3" /> недоступно
        {typeof service.http_status === "number" ? ` · HTTP ${service.http_status}` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
      не проверено
    </span>
  );
}

/**
 * Official services grid. First paint renders the overview registry with
 * «не проверено» badges; the reachability probe runs lazily in the background
 * and can be repeated manually — it never blocks the hub.
 */
export default function ServiceGrid({ services, fetchedAt }: Props) {
  const [probed, setProbed] = useState<ServiceStatus[] | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  const probe = useCallback(async () => {
    setProbing(true);
    setProbeError(null);
    try {
      const response = await fetch("/api/university/status", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; services?: ServiceStatus[]; error?: string } | null;
      if (!response.ok || !data || data.ok === false) throw new Error(data?.error || `HTTP ${response.status}`);
      const next = Array.isArray(data.services) ? data.services : [];
      if (next.length === 0) throw new Error("Пустой список сервисов");
      setProbed(next);
    } catch (cause) {
      setProbeError(cause instanceof Error ? cause.message : "Проверка недоступна");
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    // Defer the probe so the page paints from the overview first.
    const timer = setTimeout(() => void probe(), 400);
    return () => clearTimeout(timer);
  }, [probe]);

  const registry = probed && probed.length > 0 ? probed : services && services.length > 0 ? services : FALLBACK_SERVICES;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Официальные ресурсы</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Ссылки ведут на домены ДВГМУ и открываются в новой вкладке. Доступность проверяется отдельно и не блокирует страницу.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-400 sm:inline">Данные портала: {formatDateTime(fetchedAt)}</span>
          <button
            type="button"
            onClick={() => void probe()}
            disabled={probing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {probing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Проверить доступность
          </button>
        </div>
      </div>

      {probeError && (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Не удалось проверить доступность: {probeError}. Ссылки ниже продолжают работать.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {registry.map((service) => {
          const Icon = ICONS[service.category || ""] || Landmark;
          const tone = TONES[service.category || ""] || "indigo";
          return (
            <a
              key={service.id || service.url}
              href={service.url}
              target="_blank"
              rel="noreferrer"
              className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${toneClasses(tone)}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-indigo-500" />
              </div>
              <div className="mt-3 font-semibold text-slate-900">{service.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{service.description || "Официальный ресурс университета."}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {service.badge && (
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${toneClasses(tone)}`}>{service.badge}</span>
                )}
                <ReachBadge service={service} />
              </div>
              {service.checked_at && (
                <div className="mt-2 text-[10px] text-slate-400">Проверено: {formatDateTime(service.checked_at)}</div>
              )}
              {service.note && <div className="mt-1 text-[10px] leading-4 text-slate-400">{service.note}</div>}
            </a>
          );
        })}
      </div>
    </section>
  );
}
