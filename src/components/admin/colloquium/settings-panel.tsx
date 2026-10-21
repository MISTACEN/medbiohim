"use client";

import { CalendarClock, GraduationCap, Settings2, SlidersHorizontal } from "lucide-react";
import {
  fromDateTimeLocal,
  toDateTimeLocal,
  type ColloquiumSettings,
} from "@/lib/physiology-colloquium/settings";
import { Field, PanelHeader, Toggle, fieldClass } from "./fields";

export type AdminSubject = {
  id?: string;
  name: string;
  slug: string;
  course_number?: number | null;
  semester?: number | null;
};

function parseNumberList(value: string, min: number, max: number): number[] {
  const result = value
    .split(/[,\s]+/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item >= min && item <= max);
  return Array.from(new Set(result));
}

export function SettingsPanel({
  settings,
  subjects,
  onChange,
}: {
  settings: ColloquiumSettings;
  subjects: AdminSubject[];
  onChange: (settings: ColloquiumSettings) => void;
}) {
  const update = (patch: Partial<ColloquiumSettings>) => onChange({ ...settings, ...patch });
  const updateExam = (patch: Partial<ColloquiumSettings["exam"]>) =>
    onChange({ ...settings, exam: { ...settings.exam, ...patch } });
  const updateFeatures = (patch: Partial<ColloquiumSettings["features"]>) =>
    onChange({ ...settings, features: { ...settings.features, ...patch } });

  const subjectOptions = subjects.length
    ? subjects
    : [{ name: settings.subject_name, slug: settings.subject_slug, course_number: settings.course_number, semester: settings.semester }];
  const hasCurrent = subjectOptions.some((subject) => subject.slug === settings.subject_slug);

  return (
    <div className="space-y-5">
      <PanelHeader
        title="Параметры проведения"
        description="Доступность, привязка к предмету, тексты страницы и правила экзамена. Изменения применяются после сохранения."
      />

      <section className="card space-y-4 p-5">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Предмет и период</h3>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Предмет" hint="Коллоквиум хранится отдельно для каждого предмета. При смене предмета данные переносятся.">
            <select
              value={settings.subject_slug}
              onChange={(event) => {
                const subject = subjectOptions.find((item) => item.slug === event.target.value);
                if (!subject) return;
                update({
                  subject_slug: subject.slug,
                  subject_name: subject.name,
                  course_number: subject.course_number ?? null,
                  semester: subject.semester ?? null,
                });
              }}
              className={fieldClass}
            >
              {!hasCurrent && <option value={settings.subject_slug}>{settings.subject_name}</option>}
              {subjectOptions.map((subject) => (
                <option key={subject.slug} value={subject.slug}>
                  {subject.name} ({subject.slug})
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Курс">
              <input
                type="number"
                min={1}
                max={6}
                value={settings.course_number ?? ""}
                onChange={(event) =>
                  update({ course_number: event.target.value ? Number(event.target.value) : null })
                }
                className={fieldClass}
              />
            </Field>
            <Field label="Семестр">
              <input
                type="number"
                min={1}
                max={12}
                value={settings.semester ?? ""}
                onChange={(event) =>
                  update({ semester: event.target.value ? Number(event.target.value) : null })
                }
                className={fieldClass}
              />
            </Field>
          </div>

          <Field label="Открытие" hint="Пустое значение — без ограничения.">
            <input
              type="datetime-local"
              value={toDateTimeLocal(settings.opens_at)}
              onChange={(event) => update({ opens_at: fromDateTimeLocal(event.target.value) })}
              className={fieldClass}
            />
          </Field>
          <Field label="Закрытие" hint="После этой даты студенты увидят экран блокировки.">
            <input
              type="datetime-local"
              value={toDateTimeLocal(settings.closes_at)}
              onChange={(event) => update({ closes_at: fromDateTimeLocal(event.target.value) })}
              className={fieldClass}
            />
          </Field>
        </div>

        <Toggle
          checked={settings.enabled}
          onChange={(enabled) => update({ enabled })}
          label="Коллоквиум доступен студентам"
          description="Если выключить, страница коллоквиума будет показывать сообщение о временной недоступности."
        />
      </section>

      <section className="card space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Тексты страницы</h3>
        </div>
        <Field label="Заголовок">
          <input
            value={settings.title}
            maxLength={200}
            onChange={(event) => update({ title: event.target.value })}
            className={fieldClass}
          />
        </Field>
        <Field label="Подзаголовок">
          <input
            value={settings.subtitle}
            maxLength={500}
            onChange={(event) => update({ subtitle: event.target.value })}
            className={fieldClass}
          />
        </Field>
        <Field label="Описание">
          <textarea
            value={settings.description}
            maxLength={5000}
            rows={3}
            onChange={(event) => update({ description: event.target.value })}
            className={fieldClass}
          />
        </Field>
      </section>

      <section className="card space-y-4 p-5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Экзамен</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Проходной порог, %">
            <input
              type="number"
              min={1}
              max={100}
              value={settings.exam.pass_percent}
              onChange={(event) => updateExam({ pass_percent: Number(event.target.value) })}
              className={fieldClass}
            />
          </Field>
          <Field label="Вопросов по умолчанию">
            <input
              type="number"
              min={1}
              max={500}
              value={settings.exam.default_question_count}
              onChange={(event) => updateExam({ default_question_count: Number(event.target.value) })}
              className={fieldClass}
            />
          </Field>
          <Field label="Время по умолчанию, мин" hint="0 — без таймера.">
            <input
              type="number"
              min={0}
              max={600}
              value={settings.exam.default_minutes}
              onChange={(event) => updateExam({ default_minutes: Number(event.target.value) })}
              className={fieldClass}
            />
          </Field>
          <Field label="Лимит попыток" hint="0 — без ограничений.">
            <input
              type="number"
              min={0}
              max={100}
              value={settings.exam.max_attempts}
              onChange={(event) => updateExam({ max_attempts: Number(event.target.value) })}
              className={fieldClass}
            />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Варианты числа вопросов" hint="Через запятую. Используются в настройках экзамена.">
            <input
              value={settings.exam.question_counts.join(", ")}
              onChange={(event) =>
                updateExam({ question_counts: parseNumberList(event.target.value, 1, 500) })
              }
              className={fieldClass}
            />
          </Field>
          <Field label="Варианты таймера, мин" hint="Через запятую. 0 — без таймера.">
            <input
              value={settings.exam.timer_minutes.join(", ")}
              onChange={(event) => updateExam({ timer_minutes: parseNumberList(event.target.value, 0, 600) })}
              className={fieldClass}
            />
          </Field>
        </div>

        <Field label="Общая длительность подготовки, мин">
          <input
            type="number"
            min={1}
            max={100000}
            value={settings.plan.total_minutes}
            onChange={(event) =>
              onChange({ ...settings, plan: { total_minutes: Number(event.target.value) } })
            }
            className={fieldClass}
          />
        </Field>
      </section>

      <section className="card space-y-3 p-5">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Разделы подготовки</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Toggle checked={settings.features.plan} onChange={(plan) => updateFeatures({ plan })} label="План" />
          <Toggle
            checked={settings.features.theory}
            onChange={(theory) => updateFeatures({ theory })}
            label="Теория"
          />
          <Toggle checked={settings.features.tests} onChange={(tests) => updateFeatures({ tests })} label="Тесты" />
          <Toggle checked={settings.features.tasks} onChange={(tasks) => updateFeatures({ tasks })} label="Задачи" />
          <Toggle checked={settings.features.exam} onChange={(exam) => updateFeatures({ exam })} label="Экзамен" />
        </div>
      </section>
    </div>
  );
}
