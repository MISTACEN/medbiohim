"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ClipboardList,
  Layers3,
  ListChecks,
  Loader2,
  RefreshCcw,
  Save,
  Settings2,
} from "lucide-react";
import {
  adminGetColloquium,
  adminListColloquium,
  adminResetColloquium,
  adminSaveColloquium,
  hasToken,
  listSubjects,
} from "@/lib/api";
import {
  createDefaultColloquiumContent,
  DEFAULT_COLLOQUIUM_SETTINGS,
  normalizeColloquiumContent,
  normalizeColloquiumSettings,
  type ColloquiumContentSnapshot,
  type ColloquiumSettings,
} from "@/lib/physiology-colloquium/settings";
import { SettingsPanel, type AdminSubject } from "@/components/admin/colloquium/settings-panel";
import { StructurePanel } from "@/components/admin/colloquium/structure-panel";
import { TheoryPanel } from "@/components/admin/colloquium/theory-panel";
import { TestsPanel } from "@/components/admin/colloquium/tests-panel";
import { TasksPanel } from "@/components/admin/colloquium/tasks-panel";

type TabId = "settings" | "structure" | "theory" | "tests" | "tasks";

const tabs: { id: TabId; label: string; icon: typeof Settings2 }[] = [
  { id: "settings", label: "Параметры", icon: Settings2 },
  { id: "structure", label: "Структура", icon: Layers3 },
  { id: "theory", label: "Теория", icon: BookOpen },
  { id: "tests", label: "Тесты", icon: ListChecks },
  { id: "tasks", label: "Задачи", icon: ClipboardList },
];

export default function AdminColloquiumPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabId>("settings");
  const [settings, setSettings] = useState<ColloquiumSettings>(DEFAULT_COLLOQUIUM_SETTINGS);
  const [content, setContent] = useState<ColloquiumContentSnapshot>(() => createDefaultColloquiumContent());
  const [subjects, setSubjects] = useState<AdminSubject[]>([]);
  const [originalSubject, setOriginalSubject] = useState("physiology");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setSignedIn(hasToken());
  }, []);

  useEffect(() => {
    if (signedIn !== true) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      const [listResult, subjectsResult] = await Promise.all([
        adminListColloquium(),
        listSubjects(),
      ]);
      if (cancelled) return;

      const savedColloquiums = listResult.ok ? listResult.data.items : [];
      const preferred =
        savedColloquiums.find((item) => item.subject === "physiology") ?? savedColloquiums[0];
      const targetSubject = preferred?.subject || "physiology";
      const colloquiumResult = await adminGetColloquium(targetSubject);
      if (cancelled) return;

      if (colloquiumResult.ok) {
        const nextSettings = normalizeColloquiumSettings(colloquiumResult.data.settings);
        setSettings({ ...nextSettings, subject_slug: targetSubject });
        setOriginalSubject(targetSubject);
        setContent(
          colloquiumResult.data.content
            ? normalizeColloquiumContent(colloquiumResult.data.content)
            : createDefaultColloquiumContent(),
        );
        setUpdatedAt(colloquiumResult.data.updated_at ?? null);
      } else {
        setError(colloquiumResult.error.message || "Не удалось загрузить настройки коллоквиума.");
      }

      const subjectPayload: any = subjectsResult.ok ? subjectsResult.data : null;
      const items = Array.isArray(subjectPayload?.items) ? subjectPayload.items : [];
      if (items.length) {
        setSubjects(
          items.map((item: any) => ({
            id: item.id,
            name: String(item.name || item.slug || ""),
            slug: String(item.slug || ""),
            course_number: item.course_number ?? null,
            semester: item.semester ?? null,
          })),
        );
      }

      setLoading(false);
      setDirty(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const changeSettings = (next: ColloquiumSettings) => {
    setSettings(next);
    setDirty(true);
    setMessage("");
    setError("");
  };

  const changeContent = (next: ColloquiumContentSnapshot) => {
    setContent(next);
    setDirty(true);
    setMessage("");
    setError("");
  };

  const validate = (): string | null => {
    if (!settings.title.trim()) return "Заголовок коллоквиума не может быть пустым.";
    if (!settings.subject_slug.trim()) return "Выберите предмет.";
    if (settings.opens_at && settings.closes_at && new Date(settings.opens_at) >= new Date(settings.closes_at)) {
      return "Дата открытия должна быть раньше даты закрытия.";
    }
    if (!settings.exam.question_counts.length) return "Добавьте хотя бы один вариант числа вопросов.";
    if (!settings.exam.timer_minutes.length) return "Добавьте хотя бы один вариант таймера.";
    if (!content.plan_stages.length) return "В структуре должен быть хотя бы один этап.";
    if (settings.features.theory && !content.theory.length) return "Добавьте хотя бы один вопрос теории.";
    if (settings.features.tests && !content.tests.length) return "Добавьте хотя бы один тестовый вопрос.";
    if (settings.features.tasks && !content.tasks.length) return "Добавьте хотя бы одну ситуационную задачу.";
    const brokenTest = content.tests.find((test) => !test.options.length || !test.correct.length);
    if (brokenTest) return `В тесте №${brokenTest.number ?? brokenTest.id} не отмечен правильный вариант.`;
    const brokenTheory = content.theory.find((item) => !item.title.trim());
    if (brokenTheory) return `Вопрос теории №${brokenTheory.id} не имеет формулировки.`;
    const brokenTask = content.tasks.find((item) => !item.title.trim() || !item.question.trim());
    if (brokenTask) return `Задача №${brokenTask.id} заполнена не полностью.`;
    return null;
  };

  const save = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setMessage("");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await adminSaveColloquium(settings.subject_slug, {
        settings,
        content,
        previous_subject: originalSubject !== settings.subject_slug ? originalSubject : undefined,
      });
      if (!result.ok) {
        setError(result.error.message || "Не удалось сохранить настройки.");
        return;
      }
      const nextSettings = normalizeColloquiumSettings(result.data.settings);
      const nextContent = result.data.content
        ? normalizeColloquiumContent(result.data.content)
        : createDefaultColloquiumContent();
      setSettings(nextSettings);
      setContent(nextContent);
      setOriginalSubject(nextSettings.subject_slug);
      setUpdatedAt(result.data.updated_at ?? new Date().toISOString());
      setDirty(false);
      setMessage("Настройки и контент коллоквиума сохранены.");
    } catch {
      setError("Не удалось связаться с API. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (
      !window.confirm(
        "Сбросить настройки и пользовательский контент коллоквиума к значениям по умолчанию? Это действие нельзя отменить.",
      )
    ) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await adminResetColloquium(settings.subject_slug);
      if (!result.ok) {
        setError(result.error.message || "Не удалось сбросить настройки.");
        return;
      }
      setSettings(DEFAULT_COLLOQUIUM_SETTINGS);
      setContent(createDefaultColloquiumContent());
      setOriginalSubject("physiology");
      setUpdatedAt(null);
      setDirty(false);
      setMessage("Настройки сброшены. Контент страницы снова берётся из встроенной версии.");
    } catch {
      setError("Не удалось связаться с API для сброса настроек.");
    } finally {
      setSaving(false);
    }
  };

  if (signedIn === null || (signedIn && loading)) {
    return (
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <div className="card flex min-h-56 items-center justify-center gap-3 p-8 text-sm font-semibold text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
          Загружаем настройки коллоквиума…
        </div>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-8 text-center">
        <h1 className="page-title">Коллоквиум</h1>
        <p className="page-subtitle">Сначала войдите в аккаунт администратора</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">
          Войти
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> В админ-панель
          </Link>
          <h1 className="page-title mt-2">Коллоквиум</h1>
          <p className="page-subtitle">
            Параметры проведения, привязка к предмету и редактирование контента
            {updatedAt ? ` · сохранено ${new Date(updatedAt).toLocaleString("ru-RU")}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={reset}
            disabled={saving}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCcw className="h-4 w-4" /> Сбросить
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="btn-primary inline-flex min-h-11 items-center gap-2 px-5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
      {message && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>
      )}
      {dirty && !message && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          Есть несохранённые изменения.
        </div>
      )}

      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Разделы настройки коллоквиума">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition " +
                (active
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
              }
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <main>
          {tab === "settings" && (
            <SettingsPanel settings={settings} subjects={subjects} onChange={changeSettings} />
          )}
          {tab === "structure" && <StructurePanel content={content} onChange={changeContent} />}
          {tab === "theory" && <TheoryPanel content={content} onChange={changeContent} />}
          {tab === "tests" && <TestsPanel content={content} onChange={changeContent} />}
          {tab === "tasks" && <TasksPanel content={content} onChange={changeContent} />}
        </main>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Сводка</h2>
            <div className="grid grid-cols-2 gap-2 text-center">
              {[
                ["Теория", content.theory.length],
                ["Тесты", content.tests.length],
                ["Задачи", content.tasks.length],
                ["Этапы", content.plan_stages.length],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-slate-50 px-2 py-3">
                  <div className="text-xl font-black text-slate-900">{value}</div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="card space-y-2 p-4 text-sm leading-6 text-slate-600">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Публичная страница</h2>
            <p>
              Студенты увидят изменения после сохранения. Прогресс студентов остаётся в их браузере и не
              сбрасывается.
            </p>
            <Link
              href={`/subjects/${encodeURIComponent(settings.subject_slug === "physiology" ? "sub-phys" : settings.subject_slug)}/colloquium`}
              className="inline-flex items-center gap-1 font-bold text-indigo-700 hover:underline"
            >
              Открыть страницу коллоквиума
            </Link>
          </section>

          {dirty && (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="btn-primary sticky bottom-4 inline-flex w-full min-h-11 items-center justify-center gap-2 text-sm"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Сохранить изменения
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
