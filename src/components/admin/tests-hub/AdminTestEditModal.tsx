"use client";

import { CheckCircle2 } from "lucide-react";

import { Button, Modal } from "@/components/ui";
import type { AdminDbRow } from "@/lib/api";
import type { AdminTestsController } from "./useAdminTests";

/** Модальное окно редактирования теста. */
export function AdminTestEditModal({ page, editing, onClose }: { page: AdminTestsController; editing: AdminDbRow; onClose: () => void }) {
  const { subjects, modules, topics, setEditing, save } = page;
  return (
    <Modal
      open
      onClose={onClose}
      closeOnBackdrop={false}
      size="lg"
      labelledBy="edit-test-title"
      className="max-h-[92vh] overflow-y-auto"
    >
        <h2 id="edit-test-title" className="text-lg font-bold">Редактировать тест</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm md:col-span-2">Название<input className="input mt-1 w-full" value={String(editing.title ?? "")} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></label>
          <label className="text-sm">Предмет<select className="input mt-1 w-full" value={String(editing.subject_id ?? "")} onChange={(e) => setEditing({ ...editing, subject_id: e.target.value, module_id: null, topic_id: null })}>{subjects.map((s) => <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>)}</select></label>
          <label className="text-sm">Модуль<select className="input mt-1 w-full" value={String(editing.module_id ?? "")} onChange={(e) => setEditing({ ...editing, module_id: e.target.value || null, topic_id: null })}><option value="">Без модуля</option>{modules.filter((m) => String(m.subject_id) === String(editing.subject_id)).map((m) => <option key={String(m.id)} value={String(m.id)}>{String(m.title ?? m.name)}</option>)}</select></label>
          <label className="text-sm">Тема<select className="input mt-1 w-full" value={String(editing.topic_id ?? "")} onChange={(e) => setEditing({ ...editing, topic_id: e.target.value || null })}><option value="">Без темы</option>{topics.filter((t) => String(t.module_id) === String(editing.module_id)).map((t) => <option key={String(t.id)} value={String(t.id)}>{String(t.name ?? t.title)}</option>)}</select></label>
          <label className="text-sm">Лимит, секунд<input className="input mt-1 w-full" type="number" value={String(editing.time_limit_sec ?? "")} onChange={(e) => setEditing({ ...editing, time_limit_sec: e.target.value === "" ? null : Number(e.target.value) })} /></label>
          <label className="text-sm">Попытки<input className="input mt-1 w-full" type="number" value={String(editing.max_attempts ?? "")} onChange={(e) => setEditing({ ...editing, max_attempts: e.target.value === "" ? null : Number(e.target.value) })} /></label>
          <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={Boolean(editing.is_published)} onChange={(e) => setEditing({ ...editing, is_published: e.target.checked })} /> Опубликован</label>
        </div>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Отмена</Button><Button icon={CheckCircle2} onClick={() => void save()}>Сохранить</Button></div>
    </Modal>
  );
}
