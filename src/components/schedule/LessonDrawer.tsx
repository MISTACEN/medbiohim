"use client";

/**
 * Панель занятия: ДЗ с ответом и вложениями, добавление ДЗ (включая умную
 * вставку из чата), план занятия и самоотчёт о посещении. Разметка перенесена
 * из `src/app/schedule/page.tsx` без изменений.
 */
import Link from "next/link";
import { BookOpen, CheckCircle2, ClipboardList, Loader2, Plus, Sparkles, Upload, X } from "lucide-react";
import { SkeletonText } from "@/components/ui/Skeleton";
import { HomeworkGrade, HomeworkText } from "@/components/schedule/HomeworkBits";
import { TYPE_LABELS } from "@/components/schedule/utils";
import type { ScheduleController } from "@/components/schedule/useSchedulePage";

export function LessonDrawer({ schedule }: { schedule: ScheduleController }) {
  const {
    selected,
    setSelected,
    canCreateHomework,
    addHomeworkOpen,
    setAddHomeworkOpen,
    addHomeworkTitle,
    setAddHomeworkTitle,
    addHomeworkDescription,
    setAddHomeworkDescription,
    addHomeworkFiles,
    setAddHomeworkFiles,
    smartPasteOpen,
    setSmartPasteOpen,
    smartPasteText,
    setSmartPasteText,
    smartPasteBusy,
    smartPasteNote,
    applySmartPaste,
    addHomeworkForSelected,
    homeworkBusy,
    selectedHomeworks,
    homeworkStatus,
    toggleHomework,
    homeworkOpenId,
    setHomeworkOpenId,
    homeworkAnswer,
    setHomeworkAnswer,
    submitSelectedHomework,
    lessonLoading,
    lesson,
    lessonWeeks,
    setAttendance,
    attendanceBusy,
  } = schedule;

  if (!selected) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={() => setSelected(null)}>
      <div className="card max-h-[85dvh] w-full max-w-lg overflow-y-auto p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide opacity-60">{TYPE_LABELS[selected.type || ""] || selected.type}</div>
            <h2 className="text-xl font-bold">{selected.subject_name}</h2>
            <p className="text-sm opacity-70">{selected.date} · {selected.start_time.slice(0, 5)}–{selected.end_time.slice(0, 5)} · Хабаровск</p>
            {/* Синхронизация с /study: план дня и ИИ-подготовка собирают
                события из того же хука useStudentAgenda. */}
            {!canCreateHomework && (
              <Link href="/study" className="mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold" style={{ color: "var(--primary)", borderColor: "var(--border)" }}>
                <Sparkles className="h-3.5 w-3.5" /> Готовиться с ИИ — в «Учёбе»
              </Link>
            )}
          </div>
          <button type="button" className="rounded-lg p-2 hover:bg-black/5" onClick={() => { setSelected(null); setAddHomeworkOpen(false); setAddHomeworkFiles([]); }} aria-label="Закрыть"><X className="h-5 w-5" /></button>
        </div>

        <section className="mt-4 rounded-2xl border p-4" style={{ background: "color-mix(in srgb,var(--primary) 4%,var(--card))" }}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div><div className="flex items-center gap-2 font-semibold"><ClipboardList className="h-4 w-4" style={{ color: "var(--primary)" }} /> ДЗ по этому занятию</div><p className="mt-0.5 text-xs opacity-60">Дата и предмет уже выбраны: {selected.date} · {selected.subject_name}</p></div>
            {canCreateHomework && selected.subject_id && <button type="button" onClick={() => setAddHomeworkOpen((v) => !v)} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold"><Plus className="mr-1 inline h-3.5 w-3.5" />Добавить ДЗ</button>}
          </div>
          {addHomeworkOpen && canCreateHomework && <div className="mb-3 space-y-2 rounded-xl border bg-[var(--card)] p-3">
            <div className="rounded-lg bg-black/5 px-3 py-2 text-xs font-semibold">Привязка к занятию: {selected.date} · {selected.subject_name} · {selected.start_time.slice(0, 5)}–{selected.end_time.slice(0, 5)}</div>
            <input value={addHomeworkTitle} onChange={(e) => setAddHomeworkTitle(e.target.value)} placeholder="Что задать" className="w-full rounded-lg border px-3 py-2 text-sm" />
            <textarea value={addHomeworkDescription} onChange={(e) => setAddHomeworkDescription(e.target.value)} rows={2} placeholder="Страницы, номера, требования..." className="w-full rounded-lg border px-3 py-2 text-sm" />
            <div className="rounded-lg border border-dashed p-2">
              <button type="button" onClick={() => setSmartPasteOpen((v) => !v)} aria-expanded={smartPasteOpen} className="text-xs font-semibold text-indigo-700">Умная вставка из чата</button>
              {smartPasteOpen && <div className="mt-2 space-y-2">
                <textarea value={smartPasteText} onChange={(e) => setSmartPasteText(e.target.value)} rows={3} maxLength={10000} placeholder="Вставьте текст из чата группы: «Дз на 02.10. Тема: Эмбриология. 1. Лекцию учим. 2. Написать файлик…»" className="w-full rounded-lg border px-3 py-2 text-sm" />
                <button type="button" disabled={smartPasteBusy || !smartPasteText.trim()} onClick={() => void applySmartPaste()} className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">{smartPasteBusy ? "Разбор…" : "Разобрать текст"}</button>
                {smartPasteNote && <p className="text-xs" style={{ color: smartPasteNote.startsWith("Распознано") ? "var(--status-ok-fg)" : "var(--status-critical-fg)" }}>{smartPasteNote}</p>}
              </div>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold"><Upload className="mr-1 inline h-3.5 w-3.5" />Добавить фото
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const next = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/")); setAddHomeworkFiles((prev) => [...prev, ...next].slice(0, 12)); e.currentTarget.value = ""; }} />
              </label>
              {addHomeworkFiles.length > 0 && <span className="text-xs opacity-60">{addHomeworkFiles.length}/12 фото</span>}
            </div>
            {addHomeworkFiles.length > 0 && <div className="space-y-1">
              {addHomeworkFiles.map((file, index) => <div key={file.name + "-" + file.size + "-" + index} className="flex items-center gap-2 rounded-lg bg-black/5 px-2.5 py-1.5 text-xs"><span className="min-w-0 flex-1 truncate">{file.name}</span><button type="button" className="rounded p-1 hover:bg-black/10" onClick={() => setAddHomeworkFiles((prev) => prev.filter((_, i) => i !== index))} aria-label={`Удалить ${file.name}`}><X className="h-3.5 w-3.5" /></button></div>)}
            </div>}
            <button type="button" disabled={homeworkBusy === "add"} onClick={() => void addHomeworkForSelected()} className="btn-primary w-full">{homeworkBusy === "add" ? "Сохранение…" : "Добавить ДЗ к этому занятию"}</button>
          </div>}
          {selectedHomeworks.length === 0 ? <div className="rounded-xl border border-dashed p-4 text-center text-sm opacity-60">На это занятие ДЗ пока нет.</div> : <div className="space-y-2">
            {selectedHomeworks.map((h: any) => { const hs = homeworkStatus(h); return <article key={h.id} className="rounded-xl border bg-[var(--card)] p-3"><div className="flex items-start gap-2"><button type="button" disabled={homeworkBusy === String(h.id)} onClick={() => void toggleHomework(h)} className={hs === "done" ? "mt-0.5 text-[var(--status-ok-fg)]" : "mt-0.5 text-slate-300"}><CheckCircle2 className="h-5 w-5" /></button><div className="min-w-0 flex-1"><b className={hs === "done" ? "line-through opacity-60" : ""}>{h.title}</b><div className="mt-1 text-xs opacity-60">{h.subject_name || selected.subject_name}{hs === "overdue" ? " · просрочено" : ""}</div></div></div>{h.description && <HomeworkText text={h.description} />}
              {<HomeworkGrade homework={h} />}
              {Array.isArray(h.attachments) && h.attachments.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2">
                {h.attachments.map((att: any, index: number) => {
                  const image = String(att.mime_type || "").startsWith("image/");
                  const href = String(att.download_url || "");
                  return image && href
                    ? <a key={att.file_id || index} href={href} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border" title={att.name || "Фото ДЗ"}><img src={href} alt={att.name || "Фото ДЗ"} className="h-28 w-full object-cover" /></a>
                    : href
                      ? <a key={att.file_id || index} href={href} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2 text-xs font-semibold">{att.name || "Файл ДЗ"}</a>
                      : <div key={att.file_id || index} className="rounded-lg border px-3 py-2 text-xs opacity-60">{att.name || "Файл ДЗ"}</div>;
                })}
              </div>}<div className="mt-2 flex flex-wrap gap-2">{hs !== "done" && <button type="button" disabled={homeworkBusy === String(h.id)} onClick={() => void toggleHomework(h)} className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white">{homeworkBusy === String(h.id) ? <Loader2 className="inline h-3 w-3 animate-spin" /> : "Выполнено"}</button>}<button type="button" onClick={() => setHomeworkOpenId(homeworkOpenId === String(h.id) ? null : String(h.id))} className="rounded-lg border px-3 py-1.5 text-xs">{homeworkOpenId === String(h.id) ? "Скрыть" : "Записать ответ"}</button></div>{homeworkOpenId === String(h.id) && <div className="mt-3 space-y-2 border-t pt-3"><textarea value={homeworkAnswer} onChange={(e) => setHomeworkAnswer(e.target.value)} rows={3} placeholder="Ответ, решение, комментарий..." className="w-full rounded-lg border px-3 py-2 text-sm" /><div className="flex flex-wrap gap-2"><label className="cursor-pointer rounded-lg border px-3 py-2 text-xs"><Upload className="mr-1 inline h-3.5 w-3.5" />Файл<input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void submitSelectedHomework(h, f); }} /></label><button type="button" disabled={homeworkBusy === String(h.id)} onClick={() => void submitSelectedHomework(h)} className="rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white">Сохранить ответ</button></div></div>}</article>; })}
          </div>}
        </section>

        {lessonLoading ? (
          <SkeletonText lines={2} />
        ) : lesson ? (
          <div className="space-y-3 text-sm">
            {lesson.lecture && (
              <div className="rounded-xl border p-3">
                <div className="mb-1 flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4" /> Лекция / тема</div>
                <p>{lesson.lecture}</p>
              </div>
            )}
            {lesson.practice && (
              <div className="rounded-xl border p-3">
                <div className="mb-1 font-semibold">Практика / лаборатория</div>
                <p>{lesson.practice}</p>
              </div>
            )}
            {(lesson as { lab_detail?: string }).lab_detail && (
              <div className="rounded-xl border p-3">
                <div className="mb-1 font-semibold">Содержание занятия</div>
                <p className="whitespace-pre-wrap opacity-90">{(lesson as { lab_detail?: string }).lab_detail}</p>
              </div>
            )}
            {lesson.control && (
              <div className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-[var(--status-warn-fg)]">
                <div className="mb-1 font-semibold">Контроль</div>
                <p>{lesson.control}</p>
              </div>
            )}
            {Array.isArray(lesson.study) && lesson.study.length > 0 && (
              <div className="rounded-xl border p-3">
                <div className="mb-1 font-semibold">Что изучать / детали</div>
                <ul className="list-disc space-y-1 pl-4">{lesson.study.map((s: any, i: number) => <li key={i}>{s}</li>)}</ul>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-4 text-sm opacity-70">
            Тема занятия в плане не найдена для «{selected.subject_name}» на {selected.date}.
            Добавьте/исправьте план в CMS → Учебный план / subject plans.
          </div>
        )}

        {lessonWeeks.length > 1 && (
          <div className="mt-4">
            <div className="mb-2 text-xs font-semibold uppercase opacity-50">Другие темы предмета</div>
            <div className="max-h-40 space-y-1 overflow-y-auto text-xs">
              {lessonWeeks.slice(0, 12).map((w, i) => (
                <div key={i} className="rounded-lg bg-black/5 px-2 py-1">{w.date}: {(w.lecture || w.practice || "").slice(0, 80)}</div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 grid gap-2 rounded-xl border p-3 text-xs sm:grid-cols-2">
          {selected.teacher && <div><b>Преподаватель:</b> {selected.teacher}</div>}
          {selected.academic_hours && <div><b>Академическая нагрузка:</b> {selected.academic_hours} ак. ч.</div>}
          {selected.week_parity && <div><b>Чередование:</b> {selected.week_parity === "numerator" ? "числитель" : selected.week_parity === "denominator" ? "знаменатель" : "все недели"}</div>}
          {selected.source_detail && <div className="sm:col-span-2"><b>Источник/уточнение:</b> {selected.source_detail}</div>}
          {selected.is_makeup && <div className="sm:col-span-2 font-semibold text-[var(--status-warn-fg)]">Отработка — это не обычное занятие</div>}
          <div className="sm:col-span-2">
            <div className="mb-1 font-semibold">
              Посещение
              <span className="ml-2 rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 align-middle text-[10px] font-semibold text-[var(--status-warn-fg)]" title="Отметку ставит сам студент; преподаватель её не подтверждает">
                самоотчёт
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {([["present", "Был"], ["excused", "Уважительная"], ["sick", "Болезнь"], ["unexcused", "Пропуск"]] as const).map(([status, label]) => (
                <button key={status} type="button" disabled={attendanceBusy} aria-pressed={selected.attendance_status === status} onClick={() => void setAttendance(selected, status)} className="rounded-lg border px-2 py-1 disabled:opacity-50" style={selected.attendance_status === status ? { borderColor: "var(--primary)", color: "var(--primary)" } : undefined}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {(selected.room || selected.notes) && (
          <div className="mt-3 text-xs opacity-60">
            {[selected.building, selected.room].filter(Boolean).join(", ")}
            {selected.notes ? ` · ${selected.notes}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
