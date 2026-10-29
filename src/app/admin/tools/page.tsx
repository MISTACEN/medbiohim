"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, HardDrive, RefreshCw, Settings2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AdminMissingTools } from "@/components/admin/AdminMissingTools";
import { adminPresence, adminValidateContent, adminFileAudit, adminMediaCapabilities, health, hasToken } from "@/lib/api";
import { describeApiError } from "@/lib/errors";

/** ДЗ, файлы и диагностика. Навигация по разделам — в общем AdminNav. */
export default function AdminToolsPage() {
  const { user } = useAuth();
  const [backendHealth, setBackendHealth] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"learning" | "storage" | "system">("learning");
  const [fileAudit, setFileAudit] = useState<any>(null);
  const [fileAuditing, setFileAuditing] = useState(false);
  const [mediaCapabilities, setMediaCapabilities] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);
  const [validating, setValidating] = useState(false);
  const [presence, setPresence] = useState<any[]>([]);
  const [transport, setTransport] = useState<{ source: string; fallback: boolean; path: string; at: number } | null>(null);

  useEffect(() => {
    const onTransport = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: string; fallback?: boolean; path?: string; at?: number }>).detail;
      if (!detail || typeof detail.source !== "string") return;
      setTransport({
        source: detail.source,
        fallback: Boolean(detail.fallback),
        path: typeof detail.path === "string" ? detail.path : "",
        at: typeof detail.at === "number" ? detail.at : Date.now(),
      });
    };
    window.addEventListener("mbh:api-transport", onTransport);
    return () => window.removeEventListener("mbh:api-transport", onTransport);
  }, []);

  async function load() {
    setRefreshing(true);
    setError("");
    const [h, p] = await Promise.all([health(), adminPresence(180)]);
    if (h.ok) setBackendHealth(h.data);
    if (p.ok) setPresence(p.data.items || []);
    else setError(describeApiError(p.error));
    setRefreshing(false);
  }

  async function validateContent() {
    setValidating(true);
    const r = await adminValidateContent();
    setValidating(false);
    if (r.ok) setValidation(r.data);
    else setError(describeApiError(r.error));
  }

  async function validateFiles() {
    setFileAuditing(true);
    const [r, caps] = await Promise.all([adminFileAudit(300), adminMediaCapabilities()]);
    setFileAuditing(false);
    if (r.ok) setFileAudit(r.data);
    else setError(describeApiError(r.error));
    if (caps.ok) setMediaCapabilities(caps.data);
    else setError(describeApiError(caps.error));
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

  const tabs: Array<["learning" | "storage" | "system", string, typeof Activity]> = [
    ["learning", "ДЗ и сообщество", ShieldCheck],
    ["storage", "Файлы / Storage", HardDrive],
    ["system", "Система", Settings2],
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">ДЗ, файлы и диагностика</h1>
          <p className="page-subtitle">
            Домашние задания, материалы, сообщество, Storage и состояние backend.
            {user?.name ? ` · ${user.name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => void load()}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Обновить
          </button>
          <button type="button" className="btn-secondary" disabled={validating} onClick={() => void validateContent()}>
            {validating ? "Проверяю…" : "Проверить контент"}
          </button>
        </div>
      </header>

      {transport && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-xs text-slate-600" role="status" aria-live="polite">
          <span className="font-semibold text-slate-800">Маршрут API</span>
          <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">
            {transport.source === "cloudflare" ? "Cloudflare Worker" :
              transport.source === "spaceweb" ? "SpaceWeb PHP" :
              transport.source === "spaceweb-fallback" ? "Аварийный SpaceWeb fallback" :
              transport.source === "compatibility-fallback" ? "Совместимый fallback" :
              "Cloudflare недоступен"}
          </span>
          {transport.fallback && <span className="font-medium text-amber-700">Основной запрос не обслужен Cloudflare; использован резервный маршрут.</span>}
          <span className="text-slate-500">Последний запрос: <code>{transport.path}</code></span>
          <span className="text-slate-400">{new Date(transport.at).toLocaleTimeString()}</span>
        </div>
      )}

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {validation && (
        <div className={"rounded-xl border px-4 py-3 text-sm " + (validation.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900")}>
          <div className="font-semibold">{validation.ok ? "Целостность контента в норме" : "Найдены проблемы: " + validation.count}</div>
          <div className="mt-1 text-xs opacity-80">Проверено: тесты {validation.checked?.tests ?? "—"}, вопросы {validation.checked?.questions ?? "—"}, связи {validation.checked?.test_questions ?? "—"}, карточки {validation.checked?.trainer_cards ?? "—"}, материалы {validation.checked?.materials ?? "—"}, exam_questions {validation.checked?.exam_questions ?? "—"}.</div>
          {!validation.ok && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(validation.issues || [], null, 2)}</pre>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${tab === id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "learning" && <AdminMissingTools onMessage={(m, err) => setError(err ? m : "")} />}

      {tab === "storage" && (
        <div className="space-y-5">
          <div className="card flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">File & Storage Center</h2>
              <p className="mt-1 text-sm text-slate-500">Неразрушающий аудит metadata → материалы → тренажёр → ДЗ → сдачи. Физические объекты не удаляются и не перемещаются.</p>
            </div>
            <button type="button" className="btn-primary" disabled={fileAuditing} onClick={() => void validateFiles()}>
              {fileAuditing ? "Проверяю…" : "Запустить аудит"}
            </button>
          </div>

          {fileAudit?.summary && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Активных файлов", fileAudit.summary.active_files],
                ["B2", fileAudit.summary.b2_files],
                ["SpaceWeb", fileAudit.summary.spaceweb_files],
                ["Без checksum", fileAudit.summary.missing_sha256],
                ["Без object_key", fileAudit.summary.missing_object_key],
                ["Неопределённое хранилище", fileAudit.summary.unknown_files],
                ["В обработке", fileAudit.summary.processing_files],
                ["Ошибка обработки", fileAudit.summary.failed_processing],
              ].map(([label, value]) => (
                <div key={String(label)} className="card">
                  <div className="text-xs uppercase tracking-wide text-slate-400">{String(label)}</div>
                  <div className="mt-1 text-2xl font-bold text-indigo-600">{String(value ?? 0)}</div>
                </div>
              ))}
            </div>
          )}

          {mediaCapabilities && (
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold">Media runtime capabilities</h3>
                  <p className="mt-1 text-xs text-slate-500">Фактические возможности PHP/SpaceWeb для следующего этапа оптимизации.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{String(mediaCapabilities.runtime || "PHP")}</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["GD", mediaCapabilities.extensions?.gd],
                  ["Imagick", mediaCapabilities.extensions?.imagick],
                  ["WebP GD", mediaCapabilities.image?.webp_gd],
                  ["AVIF GD", mediaCapabilities.image?.avif_gd],
                  ["WebP Imagick", mediaCapabilities.image?.webp_imagick],
                  ["AVIF Imagick", mediaCapabilities.image?.avif_imagick],
                  ["ffmpeg", mediaCapabilities.commands?.ffmpeg],
                  ["ffprobe", mediaCapabilities.commands?.ffprobe],
                  ["cwebp", mediaCapabilities.commands?.cwebp],
                  ["avifenc", mediaCapabilities.commands?.avifenc],
                ].map(([label, ok]) => (
                  <div key={String(label)} className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs">
                    <span>{String(label)}</span>
                    <b className={ok ? "text-emerald-600" : "text-slate-400"}>{ok ? "есть" : "нет"}</b>
                  </div>
                ))}
              </div>
            </div>
          )}

          {fileAudit?.b2 && (
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold">B2 physical scan</h3>
                  <p className="mt-1 text-xs text-slate-500">Только чтение: сравниваются object_key из metadata и имена объектов в B2.</p>
                </div>
                <span className={fileAudit.b2.configured ? "badge-primary" : "rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500"}>
                  {fileAudit.b2.configured ? "B2 подключён" : "B2 не настроен"}
                </span>
              </div>
              {fileAudit.b2.configured ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <Mini label="Просканировано" value={fileAudit.b2.scanned} />
                  <Mini label="Совпало" value={fileAudit.b2.matched_metadata} />
                  <Mini label="Нет в БД" value={fileAudit.b2.orphan_objects} />
                  <Mini label="Нет в B2" value={fileAudit.b2.missing_db_objects} />
                  <Mini label="Ограничен список" value={fileAudit.b2.scan_truncated ? "да" : "нет"} />
                </div>
              ) : null}
              {fileAudit.b2.error ? <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{fileAudit.b2.error}</div> : null}
            </div>
          )}

          {fileAudit?.items && (
            <div className="card overflow-hidden">
              <div className="border-b bg-slate-50 px-4 py-3 text-xs text-slate-500">Показаны файлы с наименьшим количеством ссылок. Это кандидаты для ручной reconciliation, а не команда на удаление.</div>
              <div className="overflow-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      {["Файл","MIME","Storage","Status","Refs","SHA-256","Object key"].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 text-left">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {fileAudit.items.map((row:any) => (
                      <tr key={String(row.id)} className="border-t">
                        <td className="max-w-[260px] px-3 py-2"><div className="truncate font-semibold">{String(row.original_name || row.id)}</div><div className="text-[10px] text-slate-400">{String(row.id)}</div></td>
                        <td className="px-3 py-2">{String(row.mime_type || "—")}</td>
                        <td className="px-3 py-2">{String(row.storage_provider || "unknown")}</td>
                        <td className="px-3 py-2">{String(row.processing_status || "—")}</td>
                        <td className="px-3 py-2 font-semibold">{String(row.total_refs ?? 0)}</td>
                        <td className="max-w-[180px] px-3 py-2"><span className="truncate">{row.sha256 ? String(row.sha256) : "нет"}</span></td>
                        <td className="max-w-[240px] px-3 py-2"><span className="truncate">{String(row.object_key || "нет")}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

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
    </div>
  );
}

function Mini({ label, value }: { label: string; value: unknown }) {
  return <div className="rounded-xl border bg-slate-50 px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 font-bold">{String(value ?? 0)}</div></div>;
}
