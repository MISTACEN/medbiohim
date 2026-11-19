"use client";

/** CMS · Сетка расписания: модальное окно редактирования занятия. */
import { Trash2 } from "lucide-react";
import type { ScheduleItem } from "@/lib/api";
import { Button, Modal } from "@/components/ui";
import { TYPES, TYPE_LABELS } from "@/components/admin/schedule-hub/model";

export function ScheduleLessonModal({
  edit,
  onChange,
  onClose,
  onDelete,
  onSave,
}: {
  edit: ScheduleItem;
  onChange: (next: ScheduleItem) => void;
  onClose: () => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      closeOnBackdrop={false}
      labelledBy="edit-lesson-title"
      className="space-y-3"
    >
        <h2 id="edit-lesson-title" className="font-bold">Редактировать</h2>
        <input
          className="w-full rounded-xl border px-3 py-2"
          value={edit.subject_name ?? ""}
          onChange={(e) => onChange({ ...edit, subject_name: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="time"
            className="rounded-xl border px-3 py-2"
            value={(edit.start_time || "").slice(0, 5)}
            onChange={(e) => onChange({ ...edit, start_time: e.target.value })}
          />
          <input
            type="time"
            className="rounded-xl border px-3 py-2"
            value={(edit.end_time || "").slice(0, 5)}
            onChange={(e) => onChange({ ...edit, end_time: e.target.value })}
          />
        </div>
        <select
          className="w-full rounded-xl border px-3 py-2"
          value={edit.type || "lecture"}
          onChange={(e) => onChange({ ...edit, type: e.target.value })}
        >
          {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
        <input
          className="w-full rounded-xl border px-3 py-2"
          placeholder="Аудитория"
          value={edit.room ?? ""}
          onChange={(e) => onChange({ ...edit, room: e.target.value })}
        />
        <input
          className="w-full rounded-xl border px-3 py-2"
          placeholder="Преподаватель"
          value={edit.teacher ?? ""}
          onChange={(e) => onChange({ ...edit, teacher: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number" min="1" max="8"
            className="rounded-xl border px-3 py-2"
            placeholder="Академические часы"
            value={edit.academic_hours ?? ""}
            onChange={(e) => onChange({ ...edit, academic_hours: e.target.value ? Number(e.target.value) : null })}
          />
          <select
            className="rounded-xl border px-3 py-2"
            value={edit.week_parity ?? ""}
            onChange={(e) => onChange({ ...edit, week_parity: (e.target.value || null) as ScheduleItem["week_parity"] })}
          >
            <option value="">Без чередования</option>
            <option value="numerator">Числитель</option>
            <option value="denominator">Знаменатель</option>
            <option value="all">Все недели</option>
          </select>
        </div>
        <input
          className="w-full rounded-xl border px-3 py-2"
          placeholder="Уточнение / источник"
          value={edit.source_detail ?? ""}
          onChange={(e) => onChange({ ...edit, source_detail: e.target.value })}
        />
        <div className="flex justify-between gap-2">
          <button
            type="button"
            className="text-[var(--status-critical-fg)]"
            onClick={onDelete}
          >
            <Trash2 className="inline h-4 w-4" /> Удалить
          </button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Отмена</Button>
            <Button onClick={onSave}>
              OK
            </Button>
          </div>
        </div>
    </Modal>
  );
}
